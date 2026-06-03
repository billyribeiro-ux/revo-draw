// Milestone F (part 2): arrow binding.
//  - draw an arrow whose endpoints land on two shapes → start/end bindings + boundElements are set
//  - move a bound shape → the arrow re-routes to follow it (updateBoundElements)
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9278;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xbinding',
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

// A (300-400), B (600-700); arrow from inside A to inside B → both endpoints bind
await ev(`(() => {
  const d = window.__draw;
  d.setTool('rectangle'); d.pointerDown(300,200); d.pointerMove(400,300); d.pointerUp();
  d.setTool('rectangle'); d.pointerDown(600,200); d.pointerMove(700,300); d.pointerUp();
  d.setTool('arrow');     d.pointerDown(390,250); d.pointerMove(610,250); d.pointerUp();
})()`);

const info = await ev(`(() => {
  const els = window.__draw.scene.elements;
  const a = els[0], b = els[1], arrow = els[2];
  const endGlobalY = arrow.y + arrow.points[arrow.points.length-1][1];
  return {
    n: els.length,
    aId: a.id, bId: b.id,
    arrowType: arrow.type,
    startBoundTo: arrow.startBinding?.elementId ?? null,
    endBoundTo: arrow.endBinding?.elementId ?? null,
    aBound: (a.boundElements || []).some(be => be.id === arrow.id),
    bBound: (b.boundElements || []).some(be => be.id === arrow.id),
    endGlobalY: Math.round(endGlobalY),
  };
})()`);
const bindOk = info.n === 3 && info.startBoundTo === info.aId && info.endBoundTo === info.bId &&
  info.aBound && info.bBound;

// move B down by 120 → arrow end should follow. Grab B's TOP edge (650,200), clear of the
// arrow (which runs at y≈250), so we drag B and not the arrow.
await ev(`(() => { const d=window.__draw; d.selectAt(650,200); d.pointerDown(650,200); d.pointerMove(650,320,{shiftKey:false,altKey:false,ctrlKey:false,metaKey:false}); d.pointerUp(); })()`);
const after = await ev(`(() => {
  const arrow = window.__draw.scene.elements[2];
  return { endGlobalY: Math.round(arrow.y + arrow.points[arrow.points.length-1][1]), bMoved: Math.round(window.__draw.scene.elements[1].y) };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-binding.png', Buffer.from(shot.data, 'base64'));

const followed = after.endGlobalY - info.endGlobalY > 80; // arrow end tracked B's +120 move

console.log('bindings:', JSON.stringify(info), '=>', bindOk);
console.log('after move B (y->', after.bMoved, '): arrow endY', info.endGlobalY, '->', after.endGlobalY, 'followed:', followed);
console.log('screenshot -> /tmp/x-binding.png');

const ok = bindOk && followed;
console.log(ok ? 'PASS: arrow binds both shapes; moving a shape re-routes the arrow' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
