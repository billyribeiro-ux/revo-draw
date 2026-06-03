// Milestone F (snapping) + G (grid).
//  GRID: toggleGrid() flips gridModeEnabled and the static canvas paints grid lines.
//  SNAP: dragging an element with ⌘/Ctrl snaps its edge to a neighbour's and shows snap guides;
//        a free drag (no modifier) lands at the raw offset, a snapped drag lands on the neighbour's edge.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9275;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xsnap',
  '--window-size=1440,900', URL
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no cdp');
}

const ws = new WebSocket(await discover());
let id = 0;
const pending = new Map();
const send = (m, pr = {}) =>
  new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
await send('Page.enable');

const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const bx = () => ev(`Math.round(window.__draw.scene.elements.find(e=>Math.round(e.y)>=380).x)`);
const staticNonBg = () => ev(`(()=>{const c=document.querySelectorAll('canvas')[0];const ctx=c.getContext('2d');const d=ctx.getImageData(0,0,c.width,c.height).data;let n=0;for(let p=0;p<d.length;p+=4){if(d[p+3]>0&&!(d[p]>250&&d[p+1]>250&&d[p+2]>250))n++;}return n;})()`);

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear()`);

// --- GRID ---
const gridBefore = await ev(`window.__draw.gridMode`);
const pxBefore = await staticNonBg();
await ev(`window.__draw.toggleGrid()`);
await sleep(80);
const gridAfter = await ev(`window.__draw.gridMode`);
const pxAfter = await staticNonBg();
await ev(`window.__draw.toggleGrid()`); // back off so it doesn't pollute the snap screenshot
await sleep(50);
const gridOk = gridBefore === false && gridAfter === true && pxAfter > pxBefore + 500;

// --- SNAP ---
// A at x=300 (top), B at x=340 (below). Dragging B left by 37 → free x=303; with ⌘ snaps to 300.
await ev(`window.__draw.clear()`);
await ev(`(() => {
  const d = window.__draw;
  d.setTool('rectangle'); d.pointerDown(300,200); d.pointerMove(420,300); d.pointerUp();
  d.setTool('rectangle'); d.pointerDown(340,400); d.pointerMove(460,500); d.pointerUp();
  d.setTool('selection');
})()`);

const MOD = (ctrl) => `{shiftKey:false,altKey:false,ctrlKey:${ctrl},metaKey:${ctrl}}`;
// free drag (no modifier): B.x → 303
await ev(`(() => { const d=window.__draw; d.pointerDown(340,450); d.pointerMove(303,450,${MOD(false)}); })()`);
const freeX = await bx();
const freeSnapLines = await ev(`window.__draw.appState.current.snapLines.length`);
await ev(`window.__draw.pointerUp()`);
await ev(`window.__draw.undo()`); // restore B to x=340

// snapped drag (⌘ held): B.x should snap to A.x = 300
await ev(`(() => { const d=window.__draw; d.pointerDown(340,450); d.pointerMove(303,450,${MOD(true)}); })()`);
const snappedX = await bx();
const snapLines = await ev(`window.__draw.appState.current.snapLines.length`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-snap.png', Buffer.from(shot.data, 'base64'));
await ev(`window.__draw.pointerUp()`);
const snapLinesCleared = await ev(`window.__draw.appState.current.snapLines.length`);

console.log('GRID: before', gridBefore, 'after', gridAfter, 'px', pxBefore, '->', pxAfter, '=>', gridOk);
console.log('SNAP: free-x', freeX, '(no snapLines:', freeSnapLines, ') | snapped-x', snappedX, '(snapLines:', snapLines, ') | cleared:', snapLinesCleared);
console.log('screenshot -> /tmp/x-snap.png');

const snapOk = freeX === 303 && freeSnapLines === 0 && snappedX === 300 && snapLines > 0 && snapLinesCleared === 0;
const ok = gridOk && snapOk;
console.log(ok ? 'PASS: grid toggles + paints; ⌘-drag snaps to neighbour edge with guides (free drag does not)' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
