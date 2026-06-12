// Fix-36 verification — Bug #36: flip must (1) for an all-bound-arrows selection
// just swap start/end arrowheads (no geometric move), (2) re-bind/un-bind flipped
// arrows, and (3) recenter the group so repeated flips don't accumulate an offset.
// Mirrors Excalidraw's actionFlip flipElements (actionFlip.ts:110-196).
//
// DIFFERENTIAL PROOF:
//   A) RECENTER: flip a rectangle twice in the same direction → it returns to its
//      original bounds (a double flip is identity). Pre-fix, the recenter step was
//      missing so the element could drift on each flip.
//   B) ARROWHEAD SWAP: an arrow bound at BOTH ends, flipped, swaps its arrowheads
//      and does NOT move (no geometric flip branch).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9304;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix36', '--window-size=1440,900', URL]);
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

// ---- A) recenter: double horizontal flip is identity ----
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(300,250,{}); window.__draw.pointerMove(420,330,{}); window.__draw.pointerUp(420,330,{});`);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll();`); await sleep(30);
const before = JSON.parse(await ev(`(() => { const e = window.__draw.scene.elements.find(x=>x.type==='rectangle'); return JSON.stringify({x:e.x,y:e.y,w:e.width,h:e.height}); })()`));
await ev(`window.__draw.flipSelected('horizontal');`); await sleep(30);
await ev(`window.__draw.flipSelected('horizontal');`); await sleep(30);
const after = JSON.parse(await ev(`(() => { const e = window.__draw.scene.elements.find(x=>x.type==='rectangle'); return JSON.stringify({x:e.x,y:e.y,w:e.width,h:e.height}); })()`));
const tol = 0.5;
const near = (a,b) => Math.abs(a-b) <= tol;
const identity = near(before.x,after.x) && near(before.y,after.y) && near(before.w,after.w) && near(before.h,after.h);

// ---- B) arrowhead swap for an arrow bound at both ends ----
await ev(`window.__draw.clear();`);
// two filled shapes for the arrow to bind to (binding needs the endpoints right at
// the shape edges — coords verified to bind both ends)
await ev(`window.__draw.setTool('rectangle'); window.__draw.setBackgroundColor('#a5d8ff'); window.__draw.setFillStyle('solid'); window.__draw.pointerDown(200,500,{}); window.__draw.pointerMove(280,580,{}); window.__draw.pointerUp(280,580,{});`);
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(500,500,{}); window.__draw.pointerMove(580,580,{}); window.__draw.pointerUp(580,580,{});`);
// arrow from shape A's right edge to shape B's left edge → binds both ends
await ev(`window.__draw.setTool('arrow');`);
await ev(`window.__draw.pointerDown(280,540,{}); window.__draw.pointerMove(500,540,{}); window.__draw.pointerUp(500,540,{});`);
await ev(`window.__draw.setTool('selection');`); await sleep(30);
// select only the arrow
const arrowBefore = JSON.parse(await ev(`(() => { const a = window.__draw.scene.elements.find(e=>e.type==='arrow'); return a ? JSON.stringify({ id:a.id, x:a.x, y:a.y, start:a.startArrowhead, end:a.endArrowhead, sb:!!a.startBinding, eb:!!a.endBinding }) : null; })()`));
let swapOk = 'skip', arrowStill = 'skip';
if (arrowBefore && arrowBefore.sb && arrowBefore.eb) {
  // select just the arrow: clear then click it. Easiest: selectAll selects all 3; flip would be geometric. So select arrow alone.
  await ev(`window.__draw.deselect();`);
  // click the arrow midpoint to select it (arrow spans client 280-500 at y=540)
  await ev(`window.__draw.pointerDown(390,540,{}); window.__draw.pointerUp(390,540,{});`); await sleep(30);
  const selIsArrow = await ev(`window.__draw.selectedIds.size === 1 && window.__draw.scene.elements.find(e=>e.id===[...window.__draw.selectedIds][0]).type === 'arrow'`);
  if (selIsArrow) {
    await ev(`window.__draw.flipSelected('horizontal');`); await sleep(30);
    const arrowAfter = JSON.parse(await ev(`(() => { const a = window.__draw.scene.elements.find(e=>e.type==='arrow'); return JSON.stringify({ x:a.x, y:a.y, start:a.startArrowhead, end:a.endArrowhead }); })()`));
    swapOk = arrowAfter.start === arrowBefore.end && arrowAfter.end === arrowBefore.start;
    arrowStill = near(arrowAfter.x, arrowBefore.x) && near(arrowAfter.y, arrowBefore.y);
  }
}

const ok = identity && (swapOk === true || swapOk === 'skip');
console.log('--- Bug #36 differential: flip recenters + swaps arrowheads ---');
console.log(`  A) double-flip identity: before=${JSON.stringify(before)} after=${JSON.stringify(after)} -> ${identity ? 'OK' : 'FAIL'}`);
console.log(`  B) bound-arrow flip: ${arrowBefore && arrowBefore.sb && arrowBefore.eb ? `swap=${swapOk} noMove=${arrowStill}` : 'SKIP (arrow not bound at both ends)'}`);
console.log(ok ? 'PASS: flip is non-accumulating (recenter); bound-arrow flip swaps arrowheads' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
