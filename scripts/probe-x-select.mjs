// Phase 3 selection verification: draw a rectangle, switch to the selection tool, click inside it,
// and assert (a) the controller selected the element and (b) the interactive overlay painted the
// selection box/handles. Screenshot the result.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9245;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xsel',
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
const click = async (x, y) => { await mouse('mousePressed', x, y, 1); await sleep(30); await mouse('mouseReleased', x, y, 0); await sleep(40); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// 1) draw a rectangle
await ev(`window.__draw.setTool('rectangle')`);
await drag(300, 200, 520, 360);
const drawn = await ev(`(() => { const e = window.__draw.scene.elements[0]; return e ? { type: e.type, w: Math.round(e.width), h: Math.round(e.height), id: e.id } : null; })()`);

// 2) select it — transparent shapes are hit on their OUTLINE (Excalidraw behavior), so click the
//    left edge (x≈300), not the interior.
await ev(`window.__draw.setTool('selection')`);
await click(300, 280);

const sel = await ev(`(() => {
  const c = window.__draw;
  const canvases = document.querySelectorAll('canvas');
  const overlay = canvases[1];
  const ctx = overlay.getContext('2d');
  const d = ctx.getImageData(0, 0, overlay.width, overlay.height).data;
  let painted = 0;
  for (let p = 0; p < d.length; p += 4) { if (d[p+3] > 0) painted++; }
  return { selectedId: c.selectedId, matchesDrawn: c.selectedId === ${JSON.stringify(drawn && drawn.id)}, overlayPainted: painted };
})()`);

console.log('drawn:', JSON.stringify(drawn));
console.log('selection:', JSON.stringify(sel));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-select.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-select.png');

const ok = drawn && sel && sel.matchesDrawn === true && sel.overlayPainted > 200;
console.log(ok ? 'PASS: element selected + selection overlay painted' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
