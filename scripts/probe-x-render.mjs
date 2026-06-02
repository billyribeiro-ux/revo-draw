// Phase 2 visual verification: load /x in headless Chrome, prove the static renderer actually
// painted hand-drawn shapes by counting non-background canvas pixels, and save a screenshot.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9242;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-xprobe',
  '--window-size=1440,900',
  URL
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
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: pr }));
  });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data.toString());
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};
await send('Runtime.enable');
await send('Page.enable');

const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
};

// Count canvas pixels that differ from the (near-white) background — i.e. drawn shapes.
const probe = `(() => {
  const c = document.querySelector('canvas');
  if (!c || !c.width) return null;
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonbg = 0;
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2], a = d[p + 3];
    if (a > 0 && !(r > 245 && g > 245 && b > 245)) nonbg++;
  }
  return { width: c.width, height: c.height, nonbg };
})()`;

let info = null;
for (let i = 0; i < 80; i++) {
  info = await ev(probe);
  if (info && typeof info === 'object' && info.nonbg > 500) break;
  await sleep(250);
}

console.log('canvas render:', JSON.stringify(info));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-render.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-render.png');

const ok = info && typeof info === 'object' && info.nonbg > 500;
console.log(ok ? 'PASS: shapes rendered' : 'FAIL: canvas blank or missing');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
