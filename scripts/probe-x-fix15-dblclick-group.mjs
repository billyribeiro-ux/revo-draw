// Fix-15 verification — Bug #15: double-clicking a member of a selected group must
// deep-enter that group (set editingGroupId to the group, select just the hit
// element). Mirrors Excalidraw App.tsx:6533-6557. Clicking empty canvas exits the
// group (editingGroupId back to null) — handled by selectGroupsForSelectedElements'
// empty-selection branch (groups.ts:186-196).
//
// DIFFERENTIAL PROOF: editingGroupId after the double-click must equal the group id
// the two rects share (read live), and the selection must be exactly the hit member.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9292;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix15', '--window-size=1440,900', URL]);
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

// two FILLED rects (solid fill so the interior is hit-testable — an unfilled
// rectangle is only hit near its stroke), group, keep selected
await ev(`window.__draw.setTool('rectangle'); window.__draw.setBackgroundColor('#a5d8ff'); window.__draw.setFillStyle('solid');`);
await ev(`window.__draw.pointerDown(300,250,{}); window.__draw.pointerMove(380,330,{}); window.__draw.pointerUp(380,330,{});`);
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(500,250,{}); window.__draw.pointerMove(580,330,{}); window.__draw.pointerUp(580,330,{});`);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll(); window.__draw.groupSelected();`); await sleep(50);
await ev(`window.__draw.selectAll();`); await sleep(40); // group selected

const groupId = await ev(`(() => { const e = window.__draw.scene.elements.filter(x=>x.type==='rectangle'); const g = e[0].groupIds.at(-1); return e[1].groupIds.includes(g) ? g : null; })()`);
const rect0Id = await ev(`window.__draw.scene.elements.find(e=>e.type==='rectangle').id`);

// double-click the FIRST rect (center ~340,290) → deep-enter group
await ev(`window.__draw.doubleClickAt(340, 290);`); await sleep(60);
const afterDbl = JSON.parse(await ev(`JSON.stringify({ egid: window.__draw.appState.current.editingGroupId, selIds: Object.keys(window.__draw.appState.current.selectedElementIds), size: window.__draw.selectedIds.size })`));

const enteredOk = afterDbl.egid === groupId;
// within group, selection is just the hit element
const scopedOk = afterDbl.selIds.length === 1 && afterDbl.selIds[0] === rect0Id;

// click empty canvas → exit group (editingGroupId null)
await ev(`window.__draw.pointerDown(900,600,{}); window.__draw.pointerUp(900,600,{});`); await sleep(40);
const exitedEgid = await ev(`window.__draw.appState.current.editingGroupId`);
const exitOk = exitedEgid === null;

const ok = groupId && enteredOk && scopedOk && exitOk;
console.log('--- Bug #15 differential: double-click deep-enters group (editingGroupId) ---');
console.log(`  groupId=${groupId} rect0=${rect0Id}`);
console.log(`  after dblclick: editingGroupId=${afterDbl.egid} selIds=${JSON.stringify(afterDbl.selIds)} -> enter=${enteredOk} scoped=${scopedOk}`);
console.log(`  after empty click: editingGroupId=${exitedEgid} -> exit=${exitOk}`);
console.log(ok ? 'PASS: double-click enters group, selects hit member, empty-click exits' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
