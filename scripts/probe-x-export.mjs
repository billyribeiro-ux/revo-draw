// Milestone D verification: PNG / SVG export.
// Draw 2 shapes, then exercise the controller's export methods:
//  - exportToPngBlob() → a valid, non-trivial PNG (magic bytes + size)
//  - exportToSvgString() → a real <svg> with a viewBox and rendered shape paths
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9270;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xexport',
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

const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear()`);

// draw a rectangle + an ellipse via direct controller calls (no mouse needed)
await ev(`(() => {
  const d = window.__draw;
  d.setStrokeColor('#e03131');
  d.setTool('rectangle'); d.pointerDown(300, 200); d.pointerMove(460, 320); d.pointerUp();
  d.setStrokeColor('#1971c2');
  d.setTool('ellipse');   d.pointerDown(520, 220); d.pointerMove(680, 360); d.pointerUp();
})()`);
const count = await ev(`window.__draw.scene.elements.length`);

// PNG: validate magic bytes + dimensions + size
const png = await ev(`(async () => {
  const blob = await window.__draw.exportToPngBlob(2);
  if (!blob) return null;
  const buf = new Uint8Array(await blob.arrayBuffer());
  const magic = [137,80,78,71,13,10,26,10];
  const magicOk = magic.every((b, i) => buf[i] === b);
  // PNG IHDR width/height are big-endian uint32 at byte offsets 16 and 20
  const w = (buf[16]<<24)|(buf[17]<<16)|(buf[18]<<8)|buf[19];
  const h = (buf[20]<<24)|(buf[21]<<16)|(buf[22]<<8)|buf[23];
  return { size: blob.size, type: blob.type, magicOk, w, h };
})()`);

// SVG: validate root + viewBox + rendered shape paths
const svg = await ev(`(async () => {
  const s = await window.__draw.exportToSvgString();
  if (!s) return null;
  return {
    len: s.length,
    hasSvg: s.includes('<svg'),
    hasViewBox: /viewBox="0 0 [0-9.]+ [0-9.]+"/.test(s),
    pathCount: (s.match(/<path/g) || []).length,
    hasRedStroke: s.includes('#e03131'),
  };
})()`);

console.log('elements:', count);
console.log('PNG:', JSON.stringify(png));
console.log('SVG:', JSON.stringify(svg));

const pngOk = png && png.magicOk && png.type === 'image/png' && png.size > 1000 && png.w > 100 && png.h > 100;
const svgOk = svg && svg.hasSvg && svg.hasViewBox && svg.pathCount >= 2 && svg.hasRedStroke;

const ok = count === 2 && pngOk && svgOk;
console.log(ok ? 'PASS: PNG (valid magic + sized) and SVG (viewBox + paths) exported' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
