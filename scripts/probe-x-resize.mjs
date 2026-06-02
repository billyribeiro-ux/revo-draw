// Phase 3 resize/rotate verification: draw a rect, select it, grab the SE handle and drag to
// enlarge, then grab the rotation handle and drag to rotate. Asserts width/height grew and angle
// became non-zero. Screenshots the rotated+resized result.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9247;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xresize',
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
const drag = async (x1, y1, x2, y2) => { await mouse('mousePressed', x1, y1, 1); await sleep(30); await mouse('mouseMoved', (x1+x2)/2, (y1+y2)/2, 1); await sleep(20); await mouse('mouseMoved', x2, y2, 1); await sleep(30); await mouse('mouseReleased', x2, y2, 0); await sleep(40); };
const click = async (x, y) => { await mouse('mousePressed', x, y, 1); await sleep(30); await mouse('mouseReleased', x, y, 0); await sleep(40); };
const handle = (which) => ev(`(async () => {
  const { getTransformHandles } = await import('/src/lib/element/transformHandles.ts');
  const c = window.__draw; const el = c.scene.elements[0];
  const hs = getTransformHandles(el, c.appState.current.zoom, c.scene.scene.getNonDeletedElementsMap(), 'mouse');
  const h = hs[${JSON.stringify(which)}];
  return h ? { x: h[0] + h[2]/2, y: h[1] + h[3]/2 } : null;
})()`);

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// draw + select
await ev(`window.__draw.setTool('rectangle')`);
await drag(300, 200, 500, 360);
await ev(`window.__draw.setTool('selection')`);
await click(300, 280);
const before = await ev(`(() => { const e = window.__draw.scene.elements[0]; return { w: Math.round(e.width), h: Math.round(e.height), angle: e.angle }; })()`);

// resize via SE handle (+100,+100)
const se = await handle('se');
await drag(Math.round(se.x), Math.round(se.y), Math.round(se.x + 100), Math.round(se.y + 100));
const resized = await ev(`(() => { const e = window.__draw.scene.elements[0]; return { w: Math.round(e.width), h: Math.round(e.height) }; })()`);

// rotate via rotation handle (drag sideways)
const rot = await handle('rotation');
await drag(Math.round(rot.x), Math.round(rot.y), Math.round(rot.x + 90), Math.round(rot.y + 40));
const rotated = await ev(`(() => { const e = window.__draw.scene.elements[0]; return { angle: e.angle }; })()`);

console.log('before:', JSON.stringify(before));
console.log('se handle:', JSON.stringify(se), '-> resized:', JSON.stringify(resized));
console.log('rotation handle:', JSON.stringify(rot), '-> rotated angle:', JSON.stringify(rotated));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-resize.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-resize.png');

const ok = resized && rotated &&
  resized.w > before.w + 50 && resized.h > before.h + 50 &&
  Math.abs(rotated.angle) > 0.05;
console.log(ok ? 'PASS: resize enlarged + rotation applied' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
