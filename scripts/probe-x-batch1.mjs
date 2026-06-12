// Batch-1 gap-closing verification: tool-letter shortcuts, select-all (Cmd+A), flip (Shift+H),
// zoom-to-fit, view mode + zen mode (chrome hiding).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9256;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b1', '--window-size=1440,900', URL]);
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
const key = async (k, code, modifiers = 0) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers }); await sleep(20); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); await sleep(60); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0); // warm pointer

// 1) tool-letter shortcuts
await key('o', 'KeyO');                       // ellipse
const toolO = await ev('window.__draw.activeTool');
await key('r', 'KeyR');                        // rectangle
const toolR = await ev('window.__draw.activeTool');
await key('v', 'KeyV');                        // selection
const toolV = await ev('window.__draw.activeTool');

// 2) draw two shapes, select-all (Cmd+A)
await ev(`window.__draw.setTool('rectangle')`); await drag(300, 250, 440, 360);
await ev(`window.__draw.setTool('arrow')`); await drag(520, 250, 700, 380);
await ev(`window.__draw.setTool('selection')`);
await key('a', 'KeyA', 4); // Cmd+A
const selAll = await ev('window.__draw.selectedIds.size');

// 3) flip (Shift+H) on the selection — assert it runs + count stable
const beforeCount = await ev('window.__draw.scene.elements.length');
const flipRan = await ev(`(() => { try { window.__draw.flipSelected('horizontal'); return true; } catch(e){ return 'ERR '+e.message; } })()`);
const afterCount = await ev('window.__draw.scene.elements.length');

// 4) zoom-to-fit: zoom out then fit
await ev(`window.__draw.zoomAt(0.5, 700, 400)`);
const zOut = await ev('window.__draw.zoom');
await ev(`window.__draw.zoomToFit()`);
const zFit = await ev('window.__draw.zoom');

// 5) view mode + zen mode hide chrome
await ev(`window.__draw.toggleViewMode()`); await sleep(80);
const viewHidesPanel = await ev(`window.__draw.viewMode === true && getComputedStyle(document.querySelector('.properties')).display === 'none'`);
await ev(`window.__draw.toggleViewMode()`); // back
await ev(`window.__draw.toggleZenMode()`); await sleep(80);
const zenHidesStats = await ev(`window.__draw.zenMode === true && !document.body.innerText.includes('Stats')`);

console.log(`tools: o=${toolO} r=${toolR} v=${toolV}`);
console.log(`select-all=${selAll} | flip ran=${flipRan} count ${beforeCount}->${afterCount}`);
console.log(`zoom: out=${zOut.toFixed?.(2)} fit=${zFit.toFixed?.(2)} | viewHidesPanel=${viewHidesPanel} zenHidesStats=${zenHidesStats}`);

const ok = toolO === 'ellipse' && toolR === 'rectangle' && toolV === 'selection'
  && selAll === 2 && flipRan === true && afterCount === beforeCount
  && zFit !== zOut && viewHidesPanel === true && zenHidesStats === true;
console.log(ok ? 'PASS: tool keys + select-all + flip + zoom-to-fit + view/zen mode' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
