// Milestone B verification: modifier keys for transforms.
//  A) Alt-resize  → anchored at center (bbox center stays fixed, all sides grow).
//  B) Shift-resize → aspect ratio (w/h) preserved.
//  C) Shift-rotate → angle snaps to multiples of SHIFT_LOCKING_ANGLE (π/12 = 15°).
// Handle positions come from the vendored getTransformHandles; coords offset by the live canvas rect.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9262;
const URL = 'http://localhost:1420/x';
const STEP = Math.PI / 12; // SHIFT_LOCKING_ANGLE

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xmods',
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
  await mouse('mouseMoved', (x1 + x2) / 2, (y1 + y2) / 2, 1, modifiers);
  await sleep(20);
  await mouse('mouseMoved', x2, y2, 1, modifiers);
  await sleep(30);
  await mouse('mouseReleased', x2, y2, 0, modifiers);
  await sleep(40);
};
const click = async (x, y) => { await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await sleep(20); await mouse('mouseReleased', x, y, 0); await sleep(40); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

const off = await ev(`(()=>{const cs=document.querySelectorAll('.canvas-wrap canvas.layer');const r=cs[cs.length-1].getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top)};})()`);
const vp = (sx, sy) => [sx + off.left, sy + off.top];
// handle center in viewport coords
const handleVp = async (which) => {
  const h = await ev(`(async () => {
    const { getTransformHandles } = await import('/src/lib/element/transformHandles.ts');
    const c = window.__draw; const el = c.scene.elements[0];
    const hs = getTransformHandles(el, c.appState.current.zoom, c.scene.scene.getNonDeletedElementsMap(), 'mouse');
    const h = hs[${JSON.stringify(which)}];
    return h ? { x: h[0] + h[2]/2, y: h[1] + h[3]/2 } : null;
  })()`);
  return vp(h.x, h.y);
};
const geom = () => ev(`(() => { const e = window.__draw.scene.elements[0]; return { x:e.x, y:e.y, w:e.width, h:e.height, angle:e.angle }; })()`);
const freshRect = async () => {
  await ev(`window.__draw.clear()`);
  await ev(`window.__draw.setTool('rectangle')`);
  await drag(...vp(300, 200), ...vp(500, 320)); // 200 x 120 (non-square)
  await ev(`window.__draw.setTool('selection')`);
  await click(...vp(300, 260)); // left edge → select
};

// --- A) Alt-resize from center ---
await freshRect();
const a0 = await geom();
let se = await handleVp('se');
await drag(Math.round(se[0]), Math.round(se[1]), Math.round(se[0] + 60), Math.round(se[1] + 40), 1 /* alt */);
const a1 = await geom();
const c0 = { x: a0.x + a0.w / 2, y: a0.y + a0.h / 2 };
const c1 = { x: a1.x + a1.w / 2, y: a1.y + a1.h / 2 };
const altOk = Math.abs(c1.x - c0.x) <= 3 && Math.abs(c1.y - c0.y) <= 3 && a1.w > a0.w + 20 && a1.h > a0.h + 10;

// --- B) Shift-resize aspect lock ---
await freshRect();
const b0 = await geom();
se = await handleVp('se');
await drag(Math.round(se[0]), Math.round(se[1]), Math.round(se[0] + 120), Math.round(se[1] + 20), 8 /* shift */);
const b1 = await geom();
const ar0 = b0.w / b0.h, ar1 = b1.w / b1.h;
const aspectOk = b1.w > b0.w + 20 && Math.abs(ar1 - ar0) < 0.05;

// --- C) Shift-rotate snaps to 15° ---
await freshRect();
const rot = await handleVp('rotation');
await drag(Math.round(rot[0]), Math.round(rot[1]), Math.round(rot[0] + 80), Math.round(rot[1] + 35), 8 /* shift */);
const c = await geom();
const rem = Math.abs(((c.angle % STEP) + STEP) % STEP);
const snapOk = Math.abs(c.angle) > 0.01 && (rem < 0.02 || Math.abs(rem - STEP) < 0.02);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-modifiers.png', Buffer.from(shot.data, 'base64'));

console.log('canvas off:', JSON.stringify(off));
console.log('A alt-from-center: before-c', JSON.stringify(c0), 'after-c', JSON.stringify(c1), 'wh', a0.w + 'x' + a0.h, '->', Math.round(a1.w) + 'x' + Math.round(a1.h), '=>', altOk);
console.log('B shift-aspect: ar', ar0.toFixed(3), '->', ar1.toFixed(3), 'w', b0.w, '->', Math.round(b1.w), '=>', aspectOk);
console.log('C shift-rotate: angle', c.angle.toFixed(4), 'rad (', (c.angle * 180 / Math.PI).toFixed(1), 'deg ) step-remainder', rem.toFixed(4), '=>', snapOk);
console.log('screenshot -> /tmp/x-modifiers.png');

const ok = altOk && aspectOk && snapOk;
console.log(ok ? 'PASS: alt=from-center, shift=aspect-lock, shift-rotate=15° snap' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
