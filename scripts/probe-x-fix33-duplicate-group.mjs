// Fix-33 verification — Bug #33: duplicating a selection must use the batch
// duplicateElements (type:"in-place") so a duplicated group keeps ONE shared
// groupIdMap (copies stay grouped together) and bound arrows rebind to the copies,
// not the originals. Mirrors Excalidraw's actionDuplicateSelection
// (actionDuplicateSelection.tsx:63-109). The old per-element duplicateElement(new
// Map()) gave each copy its own group remap → singleton groups, arrows bound to
// originals.
//
// DIFFERENTIAL PROOF: group two rects, duplicate. Assert the two COPIES share a
// single group id, that id differs from the originals', and the originals are
// untouched.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9302;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix33', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// two rects → group
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(300,250,{}); window.__draw.pointerMove(380,330,{}); window.__draw.pointerUp(380,330,{});`);
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(500,250,{}); window.__draw.pointerMove(580,330,{}); window.__draw.pointerUp(580,330,{});`);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll(); window.__draw.groupSelected();`); await sleep(50);

const origGroupId = await ev(`window.__draw.scene.elements.find(e=>e.type==='rectangle').groupIds.at(-1)`);
const origCount = await ev(`window.__draw.scene.elements.filter(e=>e.type==='rectangle').length`);

// select the group + duplicate
await ev(`window.__draw.selectAll(); window.__draw.duplicateSelected();`); await sleep(50);

const after = JSON.parse(await ev(`(() => {
  const rects = window.__draw.scene.elements.filter(e=>e.type==='rectangle');
  // originals keep origGroupId; copies have a new shared group id
  const groups = {};
  for (const r of rects) { const g = r.groupIds.at(-1); groups[g] = (groups[g]||0)+1; }
  return JSON.stringify({ total: rects.length, groups });
})()`));

// expect: 4 rects total; 2 group ids each with exactly 2 members
const groupIds = Object.keys(after.groups);
const fourRects = after.total === 4 && origCount === 2;
const twoGroups = groupIds.length === 2;
const eachPair = groupIds.every((g) => after.groups[g] === 2);
const origIntact = after.groups[origGroupId] === 2; // originals still grouped
const copyGroupId = groupIds.find((g) => g !== origGroupId);
const copiesShareNewGroup = !!copyGroupId && after.groups[copyGroupId] === 2 && copyGroupId !== origGroupId;

const ok = fourRects && twoGroups && eachPair && origIntact && copiesShareNewGroup;
console.log('--- Bug #33 differential: duplicated group stays one group ---');
console.log(`  origGroupId=${origGroupId} | after: ${JSON.stringify(after)}`);
console.log(`  4 rects=${fourRects} twoGroups=${twoGroups} eachPair=${eachPair} origIntact=${origIntact} copiesShareNewGroup=${copiesShareNewGroup}`);
console.log(ok ? 'PASS: duplicated group forms ONE new shared group (copies grouped together, distinct from originals)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
