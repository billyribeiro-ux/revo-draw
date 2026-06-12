// Batch-7 verification: canvas background color + scroll-back-to-content.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9263;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b7', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await m2('mouseMoved', x1, y1, 0); await sleep(15); await m2('mousePressed', x1, y1, 1); await sleep(25); await m2('mouseMoved', x2, y2, 1); await sleep(25); await m2('mouseReleased', x2, y2, 0); await sleep(40); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// 1) canvas background color
const bgBefore = await ev(`window.__draw.viewBackgroundColor`);
await ev(`window.__draw.setViewBackgroundColor('#fffce8')`);
const bgAfter = await ev(`window.__draw.viewBackgroundColor`);

// 2) scroll-back-to-content: draw a shape, pan far away, scrollToContent re-centers it
await ev(`window.__draw.setTool('rectangle')`); await drag(300, 300, 400, 360);
await ev(`window.__draw.setTool('selection')`);
// pan far so the shape is off-screen
await ev(`window.__draw.panBy(5000, 5000)`);
const scrollFar = await ev(`({ x: Math.round(window.__draw.appState.current.scrollX), y: Math.round(window.__draw.appState.current.scrollY) })`);
// element bbox center is off-screen now
await ev(`window.__draw.scrollToContent()`);
const scrollBack = await ev(`({ x: Math.round(window.__draw.appState.current.scrollX), y: Math.round(window.__draw.appState.current.scrollY) })`);
// after scrollToContent, the element's screen position should be within the viewport
const onScreen = await ev(`(() => {
  const a = window.__draw.appState.current;
  const el = window.__draw.scene.elements[0];
  const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
  const sx = (cx + a.scrollX) * a.zoom.value, sy = (cy + a.scrollY) * a.zoom.value;
  return sx > 0 && sx < a.width && sy > 0 && sy < a.height;
})()`);

console.log('canvas bg:', bgBefore, '->', bgAfter);
console.log('scroll far:', JSON.stringify(scrollFar), '-> back:', JSON.stringify(scrollBack));
console.log('element on-screen after scrollToContent:', onScreen);

const ok =
  bgAfter === '#fffce8' && bgBefore !== bgAfter &&
  (scrollFar.x !== scrollBack.x || scrollFar.y !== scrollBack.y) &&
  onScreen === true;
console.log(ok ? 'PASS: canvas background + scroll-to-content' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
