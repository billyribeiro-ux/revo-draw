// Phase 2→3 interaction verification: drive the /x canvas with synthesized mouse drags and assert
// the generic-create gesture actually creates correctly-sized shapes, then screenshot the result.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9243;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xdraw',
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

const drag = async (x1, y1, x2, y2) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1, button: 'none', buttons: 0 });
  await sleep(20);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(30);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x2, y: y2, button: 'left', buttons: 1 });
  await sleep(30);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(40);
};

// wait for the controller to be exposed
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
// fresh scene: clear any element restored from a prior run’s localStorage
await ev(`window.__draw.clear()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200, y: 200, button: 'none', buttons: 0 });

const results = [];
const shapes = [
  { tool: 'rectangle', box: [420, 180, 640, 320] },
  { tool: 'ellipse', box: [720, 190, 900, 350] },
  { tool: 'diamond', box: [470, 420, 670, 560] }
];

for (const s of shapes) {
  await ev(`window.__draw.setTool(${JSON.stringify(s.tool)})`);
  const toolBefore = await ev('window.__draw.activeTool');
  await drag(...s.box);
  const last = await ev(`(() => {
    const els = window.__draw.scene.elements;
    const e = els[els.length - 1];
    return e ? { type: e.type, w: Math.round(e.width), h: Math.round(e.height), count: els.length } : null;
  })()`);
  const toolAfter = await ev('window.__draw.activeTool');
  results.push({ tool: s.tool, toolBefore, drawn: last, revertedTo: toolAfter });
}

console.log('draw results:', JSON.stringify(results, null, 2));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-draw.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-draw.png');

const finalCount = await ev('window.__draw.scene.elements.length');
const ok =
  finalCount === 3 &&
  results.every((r) => r.drawn && r.drawn.type === r.tool && r.drawn.w > 150 && r.drawn.h > 100 && r.revertedTo === 'selection');
console.log(ok ? 'PASS: drew 3 sized shapes; tool reverts to selection' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
