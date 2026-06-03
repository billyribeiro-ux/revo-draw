// Phase 5 (start) verification: set stroke + background via the properties panel state, draw a
// shape, and assert it picked up the colors. Screenshot shows the panel + the colored shape.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9252;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xstyle', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (type, x, y, b) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: b, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await m2('mouseMoved', x1, y1, 0); await sleep(15); await m2('mousePressed', x1, y1, 1); await sleep(25); await m2('mouseMoved', x2, y2, 1); await sleep(25); await m2('mouseReleased', x2, y2, 0); await sleep(40); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
// fresh scene: clear any element restored from a prior run’s localStorage
await ev(`window.__draw.clear()`);

await ev(`window.__draw.setStrokeColor('#e03131'); window.__draw.setBackgroundColor('#a5d8ff'); window.__draw.setStrokeWidth(4);`);
await ev(`window.__draw.setTool('rectangle')`);
await drag(400, 250, 640, 420);

const el = await ev(`(() => { const e = window.__draw.scene.elements[0]; return e ? { type: e.type, stroke: e.strokeColor, bg: e.backgroundColor, w: e.strokeWidth } : null; })()`);
console.log('drawn element:', JSON.stringify(el));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-style.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-style.png');

const ok = el && el.type === 'rectangle' && el.stroke === '#e03131' && el.bg === '#a5d8ff' && el.w === 4;
console.log(ok ? 'PASS: shape drawn with chosen stroke/background/width' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
