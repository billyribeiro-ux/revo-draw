// Milestone G (frame tool): drag-create a frame around an element → the element becomes a member
// (frameId set, clipped); moving the frame moves its children too.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9280;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xframe',
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
const snapshot = () => ev(`(() => {
  const els = window.__draw.scene.elements;
  const frame = els.find(e => e.type === 'frame');
  const rect = els.find(e => e.type === 'rectangle');
  return {
    n: els.length,
    frameId: frame?.id ?? null,
    rectFrameId: rect?.frameId ?? null,
    frame: frame ? { x: Math.round(frame.x), y: Math.round(frame.y) } : null,
    rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y) } : null,
  };
})()`);

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear()`);

// a rectangle, then a frame drawn around it
await ev(`(() => {
  const d = window.__draw;
  d.setTool('rectangle'); d.pointerDown(350,250); d.pointerMove(420,310); d.pointerUp();
  d.setTool('frame');     d.pointerDown(300,200); d.pointerMove(500,400); d.pointerUp();
})()`);
const created = await snapshot();
const memberOk = created.n === 2 && created.frameId && created.rectFrameId === created.frameId;

// select the frame (top edge, clear of the rect) and drag it +100,+50 → child must follow
await ev(`(() => { const d=window.__draw; d.setTool('selection'); d.selectAt(400,200); d.pointerDown(400,200); d.pointerMove(500,250,{shiftKey:false,altKey:false,ctrlKey:false,metaKey:false}); d.pointerUp(); })()`);
const moved = await snapshot();
const frameMoved = moved.frame.x - created.frame.x === 100 && moved.frame.y - created.frame.y === 50;
const childMoved = moved.rect.x - created.rect.x === 100 && moved.rect.y - created.rect.y === 50;

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-frame.png', Buffer.from(shot.data, 'base64'));

console.log('created:', JSON.stringify(created), '=> member', memberOk);
console.log('after frame move:', JSON.stringify({ frame: moved.frame, rect: moved.rect }), '=> frameMoved', frameMoved, 'childMoved', childMoved);
console.log('screenshot -> /tmp/x-frame.png');

const ok = memberOk && frameMoved && childMoved;
console.log(ok ? 'PASS: frame created + adopts enclosed element; moving the frame moves its child' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
