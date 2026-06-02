// Phase 3 freedraw verification: draw a multi-point stroke with synthesized mouse moves, assert a
// freedraw element accumulated the points, and confirm perfect-freehand actually painted a stroke.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9244;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xfree',
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

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

await ev(`window.__draw.setTool('freedraw')`);

// a wavy stroke
const pts = [];
for (let i = 0; i <= 40; i++) {
  pts.push([300 + i * 12, 300 + Math.round(Math.sin(i / 4) * 70)]);
}
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', buttons: 1, clickCount: 1 });
for (let i = 1; i < pts.length; i++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i][0], y: pts[i][1], button: 'left', buttons: 1 });
  await sleep(8);
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], button: 'left', buttons: 0, clickCount: 1 });
await sleep(60);

const info = await ev(`(() => {
  const el = window.__draw.scene.elements[0];
  const c = document.querySelector('canvas');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonbg = 0;
  for (let p = 0; p < d.length; p += 4) { if (d[p+3] > 0 && !(d[p]>245&&d[p+1]>245&&d[p+2]>245)) nonbg++; }
  return el ? { type: el.type, points: el.points.length, nonbg } : { nonbg };
})()`);

console.log('freedraw:', JSON.stringify(info));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-freedraw.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-freedraw.png');

const ok = info && info.type === 'freedraw' && info.points > 20 && info.nonbg > 500;
console.log(ok ? 'PASS: freedraw stroke captured + painted (perfect-freehand)' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
