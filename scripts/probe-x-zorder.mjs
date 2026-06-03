// Milestone G (z-order): bring-to-front / send-to-back / forward / backward.
// scene.elements is ordered by fractional index (last = topmost). Draw A then B (B on top),
// then reorder the selection and assert the array order changes accordingly.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9274;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xzorder',
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
const order = () => ev(`window.__draw.scene.elements.map(e => e.id)`);

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear()`);

// draw A (left) then B (overlapping, drawn after → on top)
await ev(`(() => {
  const d = window.__draw;
  d.setStrokeColor('#e03131'); d.setTool('rectangle'); d.pointerDown(300,200); d.pointerMove(440,320); d.pointerUp();
  d.setStrokeColor('#1971c2'); d.setTool('rectangle'); d.pointerDown(380,250); d.pointerMove(520,370); d.pointerUp();
})()`);
const ids = await order();
const a = ids[0], b = ids[1];

// select A (its left edge at 300,250 is clear of B which starts at x=380)
await ev(`window.__draw.selectAt(300, 250)`);
const selA = await ev(`window.__draw.selectedId === ${JSON.stringify(a)}`);

await ev(`window.__draw.bringToFront()`);
const afterFront = await order(); // expect [b, a]

await ev(`window.__draw.sendToBack()`);
const afterBack = await order();  // expect [a, b]

await ev(`window.__draw.bringForward()`);
const afterFwd = await order();   // A was first → forward swaps → [b, a]

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-zorder.png', Buffer.from(shot.data, 'base64'));

console.log('initial [a,b]:', JSON.stringify([a, b].map((s) => s.slice(0, 4))));
console.log('selected A:', selA);
console.log('bringToFront ->', JSON.stringify(afterFront.map((s) => s.slice(0, 4))), '(expect [b,a])');
console.log('sendToBack   ->', JSON.stringify(afterBack.map((s) => s.slice(0, 4))), '(expect [a,b])');
console.log('bringForward ->', JSON.stringify(afterFwd.map((s) => s.slice(0, 4))), '(expect [b,a])');
console.log('screenshot -> /tmp/x-zorder.png');

const eq = (arr, x, y) => arr.length === 2 && arr[0] === x && arr[1] === y;
const ok = selA &&
  eq(afterFront, b, a) &&
  eq(afterBack, a, b) &&
  eq(afterFwd, b, a);
console.log(ok ? 'PASS: bring-to-front / send-to-back / bring-forward reorder correctly' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
