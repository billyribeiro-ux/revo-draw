// Batch-14 verification: welcome screen shows on empty canvas, hides once a shape
// is drawn, reappears after clear.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9270;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b14', '--window-size=1440,900', URL]);
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

// 1) empty canvas → welcome shown
const onEmpty = await ev(`!!document.querySelector('.welcome') && window.__draw.showWelcome`);
const heading = await ev(`document.querySelector('.welcome .heading')?.textContent`);
const hints = await ev(`document.querySelectorAll('.welcome .hint').length`);

// 2) draw a shape → welcome hides
await ev(`window.__draw.setTool('rectangle')`); await m2('mouseMoved', 400, 300, 0); await sleep(15); await m2('mousePressed', 400, 300, 1); await sleep(20); await m2('mouseMoved', 480, 360, 1); await sleep(20); await m2('mouseReleased', 480, 360, 0); await sleep(60);
const afterDraw = await ev(`!document.querySelector('.welcome') && window.__draw.showWelcome === false`);

// 3) clear → welcome returns
await ev(`window.__draw.clear()`); await sleep(60);
const afterClear = await ev(`!!document.querySelector('.welcome') && window.__draw.showWelcome`);

console.log('empty: welcome shown=', onEmpty, '| heading=', JSON.stringify(heading), '| hints=', hints);
console.log('after draw: hidden=', afterDraw);
console.log('after clear: shown again=', afterClear);

const ok =
  onEmpty === true && heading === 'Diagrams. Made. Simple.' && hints === 3 &&
  afterDraw === true && afterClear === true;
console.log(ok ? 'PASS: welcome screen (empty→shown, draw→hidden, clear→shown)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
