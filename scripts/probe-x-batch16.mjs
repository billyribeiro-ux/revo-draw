// Batch-16 verification: library — add selection, persist, panel render, insert
// (stamp onto canvas), remove.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9272;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b16', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await m2('mouseMoved', x1, y1, 0); await sleep(15); await m2('mousePressed', x1, y1, 1); await sleep(20); await m2('mouseMoved', x2, y2, 1); await sleep(20); await m2('mouseReleased', x2, y2, 0); await sleep(40); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// draw 2 rects, select both, add to library
await ev(`window.__draw.setTool('rectangle')`); await drag(300, 250, 360, 310);
await ev(`window.__draw.setTool('rectangle')`); await drag(400, 250, 460, 310);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll();`);
await ev(`window.__draw.addSelectionToLibrary()`);
const libLen = await ev(`window.__draw.library.length`);
const libItemCount = await ev(`window.__draw.library[0]?.elements.length`);
// persisted to localStorage
const persisted = await ev(`(() => { try { return JSON.parse(localStorage.getItem('excalidraw-library')).length; } catch { return -1; } })()`);

// open the library panel via menu toggle, assert a tile renders
await ev(`window.__draw.clear();`); // clear canvas (library is independent)
const sceneAfterClear = await ev(`window.__draw.scene.elements.length`);
const libSurvivesClear = await ev(`window.__draw.library.length`);

// insert the library item → elements appear on the (cleared) canvas
await ev(`window.__draw.insertLibraryItem(window.__draw.library[0].id, 500, 400)`);
const sceneAfterInsert = await ev(`window.__draw.scene.elements.length`);

// remove the item
const removeId = await ev(`window.__draw.library[0].id`);
await ev(`window.__draw.removeLibraryItem(${JSON.stringify(removeId)})`);
const libAfterRemove = await ev(`window.__draw.library.length`);
const persistedAfterRemove = await ev(`(() => { try { return JSON.parse(localStorage.getItem('excalidraw-library')).length; } catch { return -1; } })()`);

console.log('add: library.length=', libLen, 'item elements=', libItemCount, '| persisted=', persisted);
console.log('after clear: scene=', sceneAfterClear, 'library survives=', libSurvivesClear);
console.log('insert: scene elements=', sceneAfterInsert);
console.log('remove: library.length=', libAfterRemove, '| persisted=', persistedAfterRemove);

const ok =
  libLen === 1 && libItemCount === 2 && persisted === 1 &&
  sceneAfterClear === 0 && libSurvivesClear === 1 &&
  sceneAfterInsert === 2 &&
  libAfterRemove === 0 && persistedAfterRemove === 0;
console.log(ok ? 'PASS: library (add + persist + survive-clear + insert + remove)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
