// Milestone E verification: laser pointer (ephemeral animated trail).
//  - selecting the laser tool + stroking produces a non-empty SVG <path> in the .laser-layer
//  - the stroke adds NOTHING to scene.elements (not persisted, not in history) — the key invariant
//  - the laser tool stays active after a stroke (sticky), unlike shape tools
// rAF (AnimationController) sets the path `d` on the next frame, so we sample after a short wait.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9273;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xlaser',
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
// give the laser layer's dynamic import (startLaserLayer) time to resolve + mount
await sleep(400);
await ev(`window.__draw.clear()`);
const layerPresent = await ev(`!!document.querySelector('.laser-layer')`);

// stroke with the laser tool (direct controller calls; canvas-local coords)
await ev(`(() => {
  const d = window.__draw;
  d.setTool('laser');
  d.pointerDown(300, 300);
  d.pointerMove(360, 340);
  d.pointerMove(440, 300);
  d.pointerMove(520, 360);
  d.pointerMove(600, 300);
})()`);
// let AnimationController's rAF run a couple frames to populate the path `d`
await sleep(120);

const mid = await ev(`(() => {
  const p = document.querySelector('.laser-layer path');
  const d = p ? (p.getAttribute('d') || '') : '';
  return {
    pathPresent: !!p,
    dLen: d.length,
    fill: p ? p.getAttribute('fill') : null,
    elements: window.__draw.scene.elements.length,
    tool: window.__draw.activeTool,
  };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-laser.png', Buffer.from(shot.data, 'base64'));

// end the stroke; tool must remain 'laser' (sticky)
await ev(`window.__draw.pointerUp()`);
const after = await ev(`({ tool: window.__draw.activeTool, elements: window.__draw.scene.elements.length })`);

console.log('laser-layer present:', layerPresent);
console.log('mid-stroke:', JSON.stringify(mid));
console.log('after pointerUp:', JSON.stringify(after));
console.log('screenshot -> /tmp/x-laser.png');

const ok = layerPresent && mid.pathPresent && mid.dLen > 10 && mid.fill === 'red' &&
  mid.elements === 0 && mid.tool === 'laser' &&
  after.elements === 0 && after.tool === 'laser';
console.log(ok ? 'PASS: laser trail painted (SVG path), nothing persisted, tool sticky' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
