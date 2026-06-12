// Batch-8 verification: Toast (transient status) + HintViewer (contextual hint bar).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9264;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b8', '--window-size=1440,900', URL]);
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

// --- Toast: show one with a short duration → it renders, then auto-dismisses
await ev(`window.__draw.showToast('Hello toast', { duration: 600 })`);
await sleep(80);
const toastShown = await ev(`!!document.querySelector('.Toast') && document.querySelector('.Toast__message').textContent`);
const stateShown = await ev(`window.__draw.toastMessage`);
await sleep(900); // exceeds the 600ms duration
const toastGone = await ev(`!document.querySelector('.Toast') && window.__draw.toastMessage === null`);

// --- HintViewer: hint changes by tool
await ev(`window.__draw.setTool('arrow')`); await sleep(60);
const hintArrow = await ev(`window.__draw.hint`);
const hintArrowDom = await ev(`document.querySelector('.HintViewer')?.textContent?.trim()`);
await ev(`window.__draw.setTool('freedraw')`); await sleep(60);
const hintFree = await ev(`window.__draw.hint`);
await ev(`window.__draw.setTool('text')`); await sleep(60);
const hintText = await ev(`window.__draw.hint`);

console.log('toast shown:', JSON.stringify(toastShown), 'state:', JSON.stringify(stateShown), '| gone after duration:', toastGone);
console.log('hint arrow:', JSON.stringify(hintArrow), '| dom matches:', hintArrowDom === hintArrow);
console.log('hint freedraw:', JSON.stringify(hintFree));
console.log('hint text:', JSON.stringify(hintText));

const ok =
  toastShown === 'Hello toast' && stateShown === 'Hello toast' && toastGone === true &&
  typeof hintArrow === 'string' && hintArrow.includes('multiple points') && hintArrowDom === hintArrow &&
  typeof hintFree === 'string' && hintFree.includes('Click and drag') &&
  typeof hintText === 'string' && hintText.includes('double-clicking');
console.log(ok ? 'PASS: toast (auto-dismiss) + hint viewer (tool-aware)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
