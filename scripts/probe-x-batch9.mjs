// Batch-9 verification: hand tool pan + space-drag pan + middle-mouse pan + lasso select.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9265;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b9', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const mouse = (t, x, y, b, btn = 'left') => send('Input.dispatchMouseEvent', { type: t, x, y, button: btn, buttons: b, clickCount: 1 });
const key = async (k, code, type) => send('Input.dispatchKeyEvent', { type, key: k, code });
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await mouse('mouseMoved', 200, 200, 0);

const scroll = () => ev(`({ x: Math.round(window.__draw.appState.current.scrollX), y: Math.round(window.__draw.appState.current.scrollY) })`);

// 1) hand-tool pan: select hand, drag → scroll changes
await ev(`window.__draw.setTool('hand')`);
const s0 = await scroll();
await mouse('mouseMoved', 400, 400, 0); await sleep(15);
await mouse('mousePressed', 400, 400, 1); await sleep(20);
await mouse('mouseMoved', 500, 460, 1); await sleep(20);
await mouse('mouseReleased', 500, 460, 0); await sleep(40);
const s1 = await scroll();

// 2) space-drag pan with the selection tool
await ev(`window.__draw.setTool('selection')`);
await key(' ', 'Space', 'keyDown'); await sleep(20);
await mouse('mouseMoved', 400, 400, 0); await sleep(15);
await mouse('mousePressed', 400, 400, 1); await sleep(20);
await mouse('mouseMoved', 340, 360, 1); await sleep(20);
await mouse('mouseReleased', 340, 360, 0); await sleep(40);
await key(' ', 'Space', 'keyUp');
const s2 = await scroll();

// 3) middle-mouse pan
await mouse('mouseMoved', 400, 400, 0); await sleep(15);
await mouse('mousePressed', 400, 400, 4, 'middle'); await sleep(20);
await mouse('mouseMoved', 470, 410, 4, 'middle'); await sleep(20);
await mouse('mouseReleased', 470, 410, 0, 'middle'); await sleep(40);
const s3 = await scroll();

// 4) lasso select: draw two rects, lasso a loop around the first only
await ev(`window.__draw.clear(); window.__draw.resetView();`);
await ev(`window.__draw.setTool('rectangle')`);
await mouse('mouseMoved', 300, 300, 0); await sleep(15); await mouse('mousePressed', 300, 300, 1); await sleep(20); await mouse('mouseMoved', 360, 360, 1); await sleep(20); await mouse('mouseReleased', 360, 360, 0); await sleep(40);
await ev(`window.__draw.setTool('rectangle')`);
await mouse('mouseMoved', 600, 300, 0); await sleep(15); await mouse('mousePressed', 600, 300, 1); await sleep(20); await mouse('mouseMoved', 660, 360, 1); await sleep(20); await mouse('mouseReleased', 660, 360, 0); await sleep(40);
const ids = await ev(`window.__draw.scene.elements.map(e => ({ id: e.id, x: Math.round(e.x) }))`);
// lasso a loop enclosing only the first rect (around 300-360)
await ev(`window.__draw.setTool('lasso')`);
await mouse('mouseMoved', 270, 270, 0); await sleep(15);
await mouse('mousePressed', 270, 270, 1); await sleep(15);
for (const [px, py] of [[400, 270], [400, 400], [270, 400], [270, 270]]) { await mouse('mouseMoved', px, py, 1); await sleep(20); }
await mouse('mouseReleased', 270, 270, 0); await sleep(40);
const lassoSel = await ev(`[...window.__draw.selectedIds]`);
const firstId = ids[0].x < ids[1].x ? ids[0].id : ids[1].id;
const onlyFirst = lassoSel.length === 1 && lassoSel[0] === firstId;

console.log('hand pan:', JSON.stringify(s0), '->', JSON.stringify(s1));
console.log('space pan ->', JSON.stringify(s2));
console.log('middle pan ->', JSON.stringify(s3));
console.log('lasso selected:', JSON.stringify(lassoSel), 'onlyFirstRect=', onlyFirst);

const ok =
  (s1.x !== s0.x || s1.y !== s0.y) &&
  (s2.x !== s1.x || s2.y !== s1.y) &&
  (s3.x !== s2.x || s3.y !== s2.y) &&
  onlyFirst;
console.log(ok ? 'PASS: hand pan + space pan + middle pan + lasso' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
