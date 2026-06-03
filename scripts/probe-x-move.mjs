// Phase 3 move verification: draw a rectangle, then with the selection tool grab its outline and
// drag it; assert the element translated by the drag delta. Screenshot the moved + selected result.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9246;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xmove',
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
const drag = async (x1, y1, x2, y2) => { await mouse('mousePressed', x1, y1, 1); await sleep(30); await mouse('mouseMoved', x2, y2, 1); await sleep(30); await mouse('mouseReleased', x2, y2, 0); await sleep(40); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
// fresh scene: clear any element restored from a prior run’s localStorage
await ev(`window.__draw.clear()`);
await mouse("mouseMoved", 200, 200, 0); // warm the pointer (CDP cold-pointer: first event must be a move)

// draw rect 300,200 → 520,360
await ev(`window.__draw.setTool('rectangle')`);
await drag(300, 200, 520, 360);
const before = await ev(`(() => { const e = window.__draw.scene.elements[0]; return { x: Math.round(e.x), y: Math.round(e.y) }; })()`);

// select + drag from left outline (300,280) by +120,+90
await ev(`window.__draw.setTool('selection')`);
await drag(300, 280, 420, 370);
const after = await ev(`(() => { const e = window.__draw.scene.elements[0]; return { x: Math.round(e.x), y: Math.round(e.y), selected: window.__draw.selectedId === e.id }; })()`);

console.log('before:', JSON.stringify(before), 'after:', JSON.stringify(after));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-move.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-move.png');

const ok = after && after.selected &&
  Math.abs(after.x - (before.x + 120)) <= 2 &&
  Math.abs(after.y - (before.y + 90)) <= 2;
console.log(ok ? 'PASS: selected element moved by drag delta' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
