// Phase 6 verification: (1) localStorage persistence survives a page reload; (2) dark mode toggle
// applies the theme--dark class + the canvas invert filter. Screenshot the dark-mode result.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9253;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xfinish', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable'); await send('Page.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (type, x, y, b) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: b, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await m2('mouseMoved', x1, y1, 0); await sleep(15); await m2('mousePressed', x1, y1, 1); await sleep(25); await m2('mouseMoved', x2, y2, 1); await sleep(25); await m2('mouseReleased', x2, y2, 0); await sleep(40); };
const ready = async () => { for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) return; await sleep(250); } };

await ready();
// clear any prior persisted state for a clean run, then draw
await ev(`localStorage.clear()`);
await ev(`location.reload()`); await sleep(1500); await ready();
await ev(`window.__draw.setStrokeColor('#1971c2'); window.__draw.setTool('rectangle')`);
await drag(400, 250, 640, 420);
const before = await ev(`window.__draw.scene.elements.length`);

// reload → should restore from localStorage
await ev(`location.reload()`); await sleep(1500); await ready();
const afterReload = await ev(`window.__draw.scene.elements.length`);

// dark mode toggle
await ev(`window.__draw.toggleTheme()`); await sleep(150);
const dark = await ev(`(() => {
  const root = document.querySelector('.excalidraw');
  const layer = document.querySelector('.canvas-wrap canvas');
  const filter = getComputedStyle(layer).filter;
  return { hasDarkClass: !!root && root.classList.contains('theme--dark'), filter, theme: window.__draw.theme };
})()`);

console.log(`persistence: before reload=${before}, after reload=${afterReload}`);
console.log('dark mode:', JSON.stringify(dark));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-finish.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-finish.png');

const ok = before >= 1 && afterReload === before && dark.hasDarkClass && dark.theme === 'dark' && dark.filter && dark.filter !== 'none';
console.log(ok ? 'PASS: persistence survives reload + dark mode inverts canvas' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
