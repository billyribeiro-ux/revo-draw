// Batch-10 verification: image crop — double-click an image enters crop mode,
// dragging a crop handle sets element.crop + shrinks the visible bounds, Escape
// commits and exits.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9266;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b10', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// place a 200x200 PNG image at a known canvas spot via placeImage(File, clientX, clientY)
await ev(`(async () => {
  // a 2x2 red PNG, scaled by the element to a 200x200 box
  const c = document.createElement('canvas'); c.width = 200; c.height = 200;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#e03131'; ctx.fillRect(0,0,200,200);
  ctx.fillStyle = '#1971c2'; ctx.fillRect(0,0,100,100);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const file = new File([blob], 'img.png', { type: 'image/png' });
  await window.__draw.placeImage(file, 400, 300);
})()`);
await sleep(200);

const img0 = await ev(`(() => { const e = window.__draw.scene.elements.find(x => x.type === 'image'); return e ? { id: e.id, w: Math.round(e.width), h: Math.round(e.height), crop: e.crop } : null; })()`);

// double-click the image (canvas-local coords near its center) to enter crop mode
await ev(`window.__draw.setTool('selection')`);
const imgScreen = await ev(`(() => {
  const a = window.__draw.appState.current; const e = window.__draw.scene.elements.find(x => x.type === 'image');
  const sx = (e.x + a.scrollX) * a.zoom.value + a.offsetLeft;
  const sy = (e.y + a.scrollY) * a.zoom.value + a.offsetTop;
  return { x: Math.round(sx), y: Math.round(sy), w: Math.round(e.width * a.zoom.value), h: Math.round(e.height * a.zoom.value) };
})()`);
const cx = imgScreen.x + Math.round(imgScreen.w / 2);
const cy = imgScreen.y + Math.round(imgScreen.h / 2);
// dispatch a real dblclick at the image center
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', buttons: 0, clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 2 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', buttons: 0, clickCount: 2 });
await sleep(80);
const croppingId = await ev(`window.__draw.appState.current.croppingElementId`);
const isCropping = await ev(`window.__draw.isCropping`);

// drag the bottom-right crop handle inward to crop
const brX = imgScreen.x + imgScreen.w;
const brY = imgScreen.y + imgScreen.h;
await m2('mouseMoved', brX, brY, 0); await sleep(15);
await m2('mousePressed', brX, brY, 1); await sleep(20);
await m2('mouseMoved', brX - 60, brY - 60, 1); await sleep(20);
await m2('mouseMoved', brX - 60, brY - 60, 1); await sleep(20);
await m2('mouseReleased', brX - 60, brY - 60, 0); await sleep(40);
const img1 = await ev(`(() => { const e = window.__draw.scene.elements.find(x => x.type === 'image'); return { w: Math.round(e.width), h: Math.round(e.height), crop: e.crop ? { w: Math.round(e.crop.width), h: Math.round(e.crop.height) } : null }; })()`);

// Escape exits crop mode
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
await sleep(60);
const croppingAfterEsc = await ev(`window.__draw.appState.current.croppingElementId`);

console.log('image placed:', JSON.stringify(img0));
console.log('crop mode entered: id=', !!croppingId, 'isCropping=', isCropping);
console.log('after crop drag:', JSON.stringify(img1));
console.log('cropping after Escape:', croppingAfterEsc);

const ok =
  img0 && img0.crop === null &&
  !!croppingId && isCropping === true &&
  img1.crop !== null && (img1.w < img0.w || img1.h < img0.h) &&
  croppingAfterEsc === null;
console.log(ok ? 'PASS: image crop (enter on dblclick + handle-drag crops + Escape exits)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
