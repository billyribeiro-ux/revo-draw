// Milestone C verification: multi-point line/arrow editor (LinearElementEditor).
//  1) draw a 2-point arrow, select it, enter point-edit (isEditing=true, handles drawn)
//  2) drag the tip endpoint → its point moves
//  3) drag a segment midpoint → a 3rd point is added (points 2 → 3)
//  4) Delete the selected (added) point → points 3 → 2
//  5) Escape → isEditing=false
// Endpoint coords come straight from the element (angle 0). enterLineEditor()/deleteSelected()/
// deselect() are driven directly (the dblclick/keydown bindings are trivial); the point GESTURES
// go through real CDP mouse events so the pointer state machine is exercised.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9264;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xlineedit',
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
const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => {
  await mouse('mouseMoved', x1, y1, 0);
  await mouse('mousePressed', x1, y1, 1);
  await sleep(30);
  await mouse('mouseMoved', (x1 + x2) / 2, (y1 + y2) / 2, 1);
  await sleep(20);
  await mouse('mouseMoved', x2, y2, 1);
  await sleep(30);
  await mouse('mouseReleased', x2, y2, 0);
  await sleep(40);
};
const click = async (x, y) => { await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await sleep(20); await mouse('mouseReleased', x, y, 0); await sleep(40); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear()`);

const off = await ev(`(()=>{const cs=document.querySelectorAll('.canvas-wrap canvas.layer');const r=cs[cs.length-1].getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top)};})()`);
const vp = (sx, sy) => [sx + off.left, sy + off.top];
// element point i global coords (angle 0): el.x+p[i][0], el.y+p[i][1]
const ptGlobal = (i) => ev(`(()=>{const e=window.__draw.scene.elements[0];const p=e.points[${i}];return {x:e.x+p[0],y:e.y+p[1]};})()`);
const npoints = () => ev(`window.__draw.scene.elements[0].points.length`);

// 1) draw a 2-point arrow + select + enter edit
await ev(`window.__draw.setTool('arrow')`);
await drag(...vp(300, 250), ...vp(500, 350));
await ev(`window.__draw.setTool('selection')`);
await click(...vp(400, 300)); // click the arrow body → select
const selBefore = await ev(`window.__draw.selectedIds.size`);
await ev(`window.__draw.enterLineEditor()`);
const editing = await ev(`window.__draw.isLineEditing`);
const pts0 = await npoints();

// 2) drag the tip (point index 1) by (+60,-50)
let tip = await ptGlobal(1);
await drag(...vp(tip.x, tip.y), ...vp(tip.x + 60, tip.y - 50));
const tipAfter = await ptGlobal(1);
const tipMoved = Math.abs(tipAfter.x - (tip.x + 60)) <= 6 && Math.abs(tipAfter.y - (tip.y - 50)) <= 6;

// 3) add a midpoint: drag the segment midpoint (between p0 and p1) downward
const p0 = await ptGlobal(0);
const p1 = await ptGlobal(1);
const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
await drag(...vp(mid.x, mid.y), ...vp(mid.x + 10, mid.y + 70));
const pts1 = await npoints();
const added = pts1 === pts0 + 1;

// 4) delete the selected (added) point
const selPts = await ev(`window.__draw.appState.current.selectedLinearElement?.selectedPointsIndices ?? null`);
await ev(`window.__draw.deleteSelected()`);
const pts2 = await npoints();
const deleted = pts2 === pts1 - 1;

// screenshot while still editing (shows point handles)
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-lineedit.png', Buffer.from(shot.data, 'base64'));

// 5) escape → exit edit
await ev(`window.__draw.deselect()`);
const editingAfter = await ev(`window.__draw.isLineEditing`);

console.log('canvas off:', JSON.stringify(off));
console.log('selected-before-edit:', selBefore, 'isEditing:', editing, 'points:', pts0);
console.log('tip', JSON.stringify(tip), '->', JSON.stringify(tipAfter), 'moved:', tipMoved);
console.log('add-midpoint: points', pts0, '->', pts1, '=>', added, '(selectedPts after add:', JSON.stringify(selPts), ')');
console.log('delete-point: points', pts1, '->', pts2, '=>', deleted);
console.log('after-escape isEditing:', editingAfter);
console.log('screenshot -> /tmp/x-lineedit.png');

const ok = selBefore === 1 && editing === true && pts0 === 2 && tipMoved && added && deleted && editingAfter === false;
console.log(ok ? 'PASS: enter edit, drag endpoint, add midpoint, delete point, exit' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
