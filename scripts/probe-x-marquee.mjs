// Milestone A verification: marquee multi-select + multi-element transforms.
// 1) draw 3 rectangles (clear of the left panel), 2) drag a selection box (from empty bottom-right)
// around all 3 → 3 selected, 3) group-move from inside the bbox → all 3 translate by the same delta
// (relative positions kept), 4) shift-click one shape → it drops out of the selection. Screenshot.
// Coordinates are computed from the live canvas rect + element bounds so panel/offset can't bite.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9251;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xmarquee',
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
const mouse = (type, x, y, buttons, modifiers = 0) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, modifiers });
const drag = async (x1, y1, x2, y2, modifiers = 0) => {
  await mouse('mouseMoved', x1, y1, 0, modifiers);
  await mouse('mousePressed', x1, y1, 1, modifiers);
  await sleep(30);
  await mouse('mouseMoved', x2, y2, 1, modifiers);
  await sleep(30);
  await mouse('mouseReleased', x2, y2, 0, modifiers);
  await sleep(40);
};
const click = async (x, y, modifiers = 0) => {
  await mouse('mouseMoved', x, y, 0, modifiers);
  await mouse('mousePressed', x, y, 1, modifiers);
  await sleep(20);
  await mouse('mouseReleased', x, y, 0, modifiers);
  await sleep(40);
};

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear()`);

// canvas viewport offset (toolbar height etc.) — scene coord (s) maps to viewport (s + off)
const off = await ev(`(()=>{const cs=document.querySelectorAll('canvas');const r=cs[cs.length-1].getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top)};})()`);
const vp = (sx, sy) => [sx + off.left, sy + off.top];

// 1) three rectangles, all to the right of the left properties panel (x >= 250)
await ev(`window.__draw.setTool('rectangle')`); await drag(...vp(250, 150), ...vp(350, 230));
await ev(`window.__draw.setTool('rectangle')`); await drag(...vp(420, 150), ...vp(520, 230));
await ev(`window.__draw.setTool('rectangle')`); await drag(...vp(330, 300), ...vp(430, 380));
const count = await ev(`window.__draw.scene.elements.length`);

// 2) marquee around all three: start in empty bottom-right, drag up to top-left
const b = await ev(`(()=>{const els=window.__draw.scene.elements;let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;for(const e of els){x1=Math.min(x1,e.x);y1=Math.min(y1,e.y);x2=Math.max(x2,e.x+e.width);y2=Math.max(y2,e.y+e.height);}return {x1:Math.round(x1),y1:Math.round(y1),x2:Math.round(x2),y2:Math.round(y2)};})()`);
await ev(`window.__draw.setTool('selection')`);
await drag(...vp(b.x2 + 40, b.y2 + 40), ...vp(b.x1 - 40, b.y1 - 40));
const selCount = await ev(`window.__draw.selectedIds.size`);

// snapshot positions before group-move
const before = await ev(`window.__draw.scene.elements.map((e)=>({x:Math.round(e.x),y:Math.round(e.y)}))`);

// 3) group-move from inside the common bbox by +50,+40
const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
await drag(...vp(cx, cy), ...vp(cx + 50, cy + 40));
const after = await ev(`window.__draw.scene.elements.map((e)=>({x:Math.round(e.x),y:Math.round(e.y),w:Math.round(e.width),h:Math.round(e.height)}))`);
const stillSelected = await ev(`window.__draw.selectedIds.size`);

// 4) shift-click the third shape's LEFT EDGE to drop it from the selection
//    (transparent-fill shapes only hit-test on their outline, like real Excalidraw)
const m3 = after[2];
await click(...vp(m3.x, m3.y + m3.h / 2), 8 /* shift */);
const afterShift = await ev(`window.__draw.selectedIds.size`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-marquee.png', Buffer.from(shot.data, 'base64'));

const movedOk = before.length === 3 && after.length === 3 &&
  before.every((bp, i) => Math.abs(after[i].x - (bp.x + 50)) <= 2 && Math.abs(after[i].y - (bp.y + 40)) <= 2);

console.log('elements:', count, 'marquee-selected:', selCount, 'after-move-selected:', stillSelected, 'after-shift-deselect:', afterShift);
console.log('before:', JSON.stringify(before));
console.log('after :', JSON.stringify(after.map((e)=>({x:e.x,y:e.y}))));
console.log('screenshot -> /tmp/x-marquee.png');

const ok = count === 3 && selCount === 3 && stillSelected === 3 && movedOk && afterShift === 2;
console.log(ok ? 'PASS: marquee selected 3, group-moved together, shift-click deselected 1' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
