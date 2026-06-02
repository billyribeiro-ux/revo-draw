// Phase 3 line/arrow verification: draw a line and an arrow, assert the linear elements exist
// (2 points, arrow has an end arrowhead) and the canvas painted strokes. Screenshot the result.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9250;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xlin', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await mouse('mousePressed', x1, y1, 1); await sleep(25); await mouse('mouseMoved', (x1+x2)/2, (y1+y2)/2, 1); await sleep(20); await mouse('mouseMoved', x2, y2, 1); await sleep(25); await mouse('mouseReleased', x2, y2, 0); await sleep(40); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

await ev(`window.__draw.setTool('line')`);
await drag(150, 200, 360, 320);
await ev(`window.__draw.setTool('arrow')`);
await drag(420, 220, 640, 360);

const info = await ev(`(() => {
  const els = window.__draw.scene.elements;
  const c = document.querySelectorAll('canvas')[0];
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonbg = 0; for (let p = 0; p < d.length; p += 4) { if (d[p+3] > 0 && !(d[p]>245&&d[p+1]>245&&d[p+2]>245)) nonbg++; }
  return els.map(e => ({ type: e.type, pts: e.points ? e.points.length : 0, end: e.endArrowhead ?? null })).concat([{ nonbg }]);
})()`);

console.log('elements:', JSON.stringify(info));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-linear.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-linear.png');

const els = info.slice(0, -1);
const nonbg = info[info.length - 1].nonbg;
const line = els.find((e) => e.type === 'line');
const arrow = els.find((e) => e.type === 'arrow');
const ok = els.length === 2 && line && line.pts === 2 && arrow && arrow.pts === 2 && arrow.end === 'arrow' && nonbg > 300;
console.log(ok ? 'PASS: line + arrow drawn (arrow has arrowhead) and painted' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
