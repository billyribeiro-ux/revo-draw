// Batch-12 verification: color shade-ramp picker + object/midpoint snapping toggles.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9268;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b12', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const click = async (x, y) => { await m2('mouseMoved', x, y, 0); await sleep(15); await m2('mousePressed', x, y, 1); await sleep(20); await m2('mouseReleased', x, y, 0); await sleep(50); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// 1) shade ramp: open the stroke picker → the shade-ramp rows render
await ev(`window.__draw.setTool('rectangle')`); await m2('mouseMoved', 400, 300, 0); await sleep(15); await m2('mousePressed', 400, 300, 1); await sleep(20); await m2('mouseMoved', 480, 360, 1); await sleep(20); await m2('mouseReleased', 480, 360, 0); await sleep(40);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll();`);
// click the custom stroke swatch to open the picker
const opened = await ev(`(() => { const b = document.querySelector('.swatch.custom[aria-label="custom stroke color"]'); if (b) { b.click(); return true; } return false; })()`);
await sleep(120);
const shadeCount = await ev(`document.querySelectorAll('.shade-ramp .swatch.shade').length`);
// pick a specific shade (blue 600 = #228be6) and assert the element took it
const picked = await ev(`(() => { const b = [...document.querySelectorAll('.shade-ramp .swatch.shade')].find(el => el.getAttribute('aria-label')?.includes('#228be6')); if (b) { b.click(); return true; } return false; })()`);
await sleep(80);
const strokeAfter = await ev(`window.__draw.strokeColor`);

// 2) snapping toggles
const objBefore = await ev(`window.__draw.objectsSnapMode`);
await ev(`window.__draw.toggleObjectsSnapMode()`);
const objAfter = await ev(`window.__draw.objectsSnapMode`);
const midBefore = await ev(`window.__draw.midpointSnapping`);
await ev(`window.__draw.toggleMidpointSnapping()`);
const midAfter = await ev(`window.__draw.midpointSnapping`);

console.log('shade-ramp swatches:', shadeCount, '| opened:', opened, '| picked blue600:', picked, '-> strokeColor:', strokeAfter);
console.log('objectsSnap:', objBefore, '->', objAfter, '| midpointSnap:', midBefore, '->', midAfter);

const ok =
  opened === true && shadeCount >= 50 && picked === true && strokeAfter === '#228be6' &&
  objBefore === false && objAfter === true &&
  midBefore === true && midAfter === false;
console.log(ok ? 'PASS: shade-ramp picker + object/midpoint snapping toggles' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
