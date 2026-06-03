// Wave-4 verification: eraser (drag removes elements) + image tool (placeImage loads + renders).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9255;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xie', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await m2('mouseMoved', x1, y1, 0); await sleep(15); await m2('mousePressed', x1, y1, 1); await sleep(25); await m2('mouseMoved', (x1+x2)/2, (y1+y2)/2, 1); await sleep(15); await m2('mouseMoved', x2, y2, 1); await sleep(25); await m2('mouseReleased', x2, y2, 0); await sleep(40); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// draw two shapes
await ev(`window.__draw.setTool('rectangle')`);
await drag(200, 250, 380, 400);
await ev(`window.__draw.setTool('ellipse')`);
await drag(460, 250, 620, 400);
const drew = await ev(`window.__draw.scene.elements.length`);

// eraser: drag across the rectangle (around x=290)
await ev(`window.__draw.setTool('eraser')`);
await drag(200, 260, 380, 390); // crosses the rect outline
const afterErase = await ev(`window.__draw.scene.elements.length`);

// image: synthesize a PNG File and placeImage directly
const imgResult = await ev(`(async () => {
  const c = document.createElement('canvas'); c.width = 120; c.height = 80;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ffa94d'; ctx.fillRect(0,0,120,80); ctx.fillStyle='#1971c2'; ctx.fillRect(20,20,80,40);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const file = new File([blob], 'test.png', { type: 'image/png' });
  await window.__draw.placeImage(file, 850, 320);
  const els = window.__draw.scene.elements;
  const img = els.find(e => e.type === 'image');
  return img ? { hasImage: true, count: els.length } : { hasImage: false, count: els.length };
})()`);

console.log(`drew=${drew} afterErase=${afterErase} image=${JSON.stringify(imgResult)}`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-imgerase.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-imgerase.png');

const ok = drew === 2 && afterErase === 1 && imgResult.hasImage === true;
console.log(ok ? 'PASS: eraser removed a shape + image placed/rendered' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
