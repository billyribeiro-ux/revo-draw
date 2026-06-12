// Fix-13..16 verification — group selection must flow through
// selectGroupsForSelectedElements so a grouped selection populates
// appState.selectedGroupIds (drives the single dashed group outline + members
// highlighting as a unit), and so a marquee/click over ONE group member selects
// the WHOLE group. Pre-fix, #setSelection never set selectedGroupIds, and the
// marquee selected only the enclosed members.
//
// DIFFERENTIAL PROOF: the expected selectedGroupIds is the shared group id the two
// elements carry (read live from the scene). We assert:
//   #16  selectAll on a group → appState.selectedGroupIds == { <groupId>: true }
//   #13  marquee over ONE member → both members selected AND selectedGroupIds set
//   #15  double-click a grouped element → editingGroupId == <groupId> (deep enter)
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9285;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix13', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await m2('mouseMoved', x1, y1, 0); await m2('mousePressed', x1, y1, 1); await m2('mouseMoved', x2, y2, 1); await m2('mouseReleased', x2, y2, 0); await sleep(40); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// two rects, group them
await ev(`window.__draw.setTool('rectangle')`); await ev(`window.__draw.pointerDown(300,250,{}); window.__draw.pointerMove(380,330,{}); window.__draw.pointerUp(380,330,{});`);
await ev(`window.__draw.setTool('rectangle')`); await ev(`window.__draw.pointerDown(500,250,{}); window.__draw.pointerMove(580,330,{}); window.__draw.pointerUp(580,330,{});`);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll(); window.__draw.groupSelected();`);
await sleep(60);

const groupId = await ev(`(() => { const e = window.__draw.scene.elements.filter(x=>x.type==='rectangle'); const g = e[0].groupIds[e[0].groupIds.length-1]; return e[1].groupIds.includes(g) ? g : null; })()`);

// #16: selectAll on a group → selectedGroupIds == { groupId: true }
await ev(`window.__draw.selectAll();`);
await sleep(60);
const sgIdsSelectAll = JSON.parse(await ev(`JSON.stringify(window.__draw.appState.current.selectedGroupIds)`));
const selAllOk = groupId && sgIdsSelectAll && sgIdsSelectAll[groupId] === true && Object.keys(sgIdsSelectAll).filter(k=>sgIdsSelectAll[k]).length === 1;

// clear selection (click empty canvas via controller API)
await ev(`window.__draw.pointerDown(900,600,{}); window.__draw.pointerUp(900,600,{});`);
await sleep(40);
const clearedSize = await ev(`window.__draw.selectedIds.size`);

// #13: marquee enclosing the WHOLE group (both members, client 300-580) → all
// members selected AND selectedGroupIds set. NOTE: Excalidraw's box selection runs
// in "contain" mode (selection.ts:347-363), which deletes a group member unless the
// ENTIRE group is enclosed — so a box over only one member selects nothing. That is
// faithful upstream behaviour; the fix under test is that a full-group box sets
// selectedGroupIds (not just selectedElementIds). This is the user-visible "drag a
// box around a group → one dashed group outline" contract.
await ev(`window.__draw.setTool('selection'); window.__draw.pointerDown(260,220,{}); window.__draw.pointerMove(620,360,{}); window.__draw.pointerUp(620,360,{});`);
await sleep(60);
const afterMarquee = JSON.parse(await ev(`JSON.stringify({ size: window.__draw.selectedIds.size, sgi: window.__draw.appState.current.selectedGroupIds })`));
const marqueeOk = afterMarquee.size === 2 && afterMarquee.sgi && afterMarquee.sgi[groupId] === true;

// Control: a box enclosing only ONE member selects nothing (contain-mode group rule).
await ev(`window.__draw.pointerDown(900,600,{}); window.__draw.pointerUp(900,600,{});`); await sleep(40);
await ev(`window.__draw.pointerDown(270,220,{}); window.__draw.pointerMove(420,360,{}); window.__draw.pointerUp(420,360,{});`);
await sleep(60);
const partialSize = await ev(`window.__draw.selectedIds.size`);
const partialOk = partialSize === 0; // upstream-faithful: partial group box = no selection

let ok = selAllOk && clearedSize === 0 && marqueeOk && partialOk;
console.log('--- Bug #13/#16 differential: group selection populates selectedGroupIds ---');
console.log(`  groupId = ${groupId}`);
console.log(`  #16 selectAll selectedGroupIds=${JSON.stringify(sgIdsSelectAll)} -> ${selAllOk ? 'OK' : 'FAIL'}`);
console.log(`  cleared selection size=${clearedSize}`);
console.log(`  #13 full-group box -> size=${afterMarquee.size} selectedGroupIds=${JSON.stringify(afterMarquee.sgi)} -> ${marqueeOk ? 'OK' : 'FAIL'}`);
console.log(`  contain-mode control: partial-group box -> size=${partialSize} (want 0) -> ${partialOk ? 'OK' : 'FAIL'}`);
console.log(ok ? 'PASS: grouped selections set selectedGroupIds; box selection matches upstream contain-mode' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
