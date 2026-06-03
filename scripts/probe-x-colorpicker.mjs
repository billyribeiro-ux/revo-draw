// Milestone G (ColorPicker hex): typing a hex (without "#") into the stroke picker's input
// commits the colour to the current style AND the selected element.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9279;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xcp',
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
await ev(`window.__draw.clear()`);
await ev(`(() => { const d=window.__draw; d.setTool('rectangle'); d.pointerDown(320,220); d.pointerMove(460,340); d.pointerUp(); d.selectAt(320,280); })()`);

// open the stroke colour picker
const opened = await ev(`(() => {
  const b = document.querySelector('button[aria-label="custom stroke color"]');
  if (!b) return 'no-button';
  b.click();
  return true;
})()`);
await sleep(120);

// type a hex WITHOUT the leading '#', commit via change
const typed = await ev(`(() => {
  const input = document.querySelector('.hex-input');
  if (!input) return 'no-input';
  input.value = '00aa00';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
await sleep(100);

const result = await ev(`(() => {
  const d = window.__draw;
  return { strokeColor: d.strokeColor, elementStroke: d.selectedElements[0]?.strokeColor ?? null };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-colorpicker.png', Buffer.from(shot.data, 'base64'));

console.log('picker opened:', opened, 'typed:', typed);
console.log('result:', JSON.stringify(result));
console.log('screenshot -> /tmp/x-colorpicker.png');

const ok = opened === true && typed === true &&
  result.strokeColor === '#00aa00' && result.elementStroke === '#00aa00';
console.log(ok ? 'PASS: hex input (no #) commits to current style + selected element' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
