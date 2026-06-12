// Batch-15 verification: command palette — open via ⌘/, filter, arrow-nav, Enter runs.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9271;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b15', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const key = async (k, code, mods = 0) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers: mods }); await sleep(20); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: mods }); await sleep(40); };
const typeText = async (s) => { for (const ch of s) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch }); await send('Input.dispatchKeyEvent', { type: 'char', text: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(20); } };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// open via Cmd+/ (modifiers: 4 = Meta)
await key('/', 'Slash', 4);
const opened = await ev(`!!document.querySelector('.cmdp')`);
const itemCount = await ev(`document.querySelectorAll('.cmdp-item').length`);

// filter: type "ellipse" → only matching items remain
await typeText('ellipse');
await sleep(80);
const filtered = await ev(`[...document.querySelectorAll('.cmdp-item .cmdp-label')].map(e => e.textContent)`);

// Enter runs the (single) Ellipse command → tool becomes ellipse + palette closes
await key('Enter', 'Enter');
await sleep(80);
const toolAfter = await ev(`window.__draw.activeTool`);
const closedAfterRun = await ev(`!document.querySelector('.cmdp')`);

// reopen + Escape closes
await key('/', 'Slash', 4);
const reopened = await ev(`!!document.querySelector('.cmdp')`);
await key('Escape', 'Escape');
await sleep(60);
const closedAfterEsc = await ev(`!document.querySelector('.cmdp')`);

console.log('opened:', opened, '| total items:', itemCount);
console.log('filter "ellipse":', JSON.stringify(filtered));
console.log('Enter ran → tool:', toolAfter, '| closed:', closedAfterRun);
console.log('reopen:', reopened, '| Escape closed:', closedAfterEsc);

const ok =
  opened === true && itemCount >= 25 &&
  filtered.length === 1 && filtered[0] === 'Ellipse' &&
  toolAfter === 'ellipse' && closedAfterRun === true &&
  reopened === true && closedAfterEsc === true;
console.log(ok ? 'PASS: command palette (open/filter/run/close)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
