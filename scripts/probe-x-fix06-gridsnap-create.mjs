// Fix-06 verification — Bug #6: element creation must snap the origin to the grid
// when grid mode is on (Ctrl/Cmd bypasses), mirroring Excalidraw's
// createGenericElementOnPointerDown (App.tsx:9514-9520).
//
// DIFFERENTIAL PROOF: the expected snapped origin is computed from the SAME
// getGridPoint rule Excalidraw uses (round(coord/gridSize)*gridSize), reading the
// live gridSize from appState. We draw from a deliberately OFF-grid origin and
// assert the created element's x/y equal the snapped value; then assert Ctrl
// produces the RAW (unsnapped) origin.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9283;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix06', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// Note: the controller's pointerDown takes CLIENT coords and maps to scene via
// #toScene. At zoom=1, scroll=0 the canvas origin offset is constant; we read the
// actual scene origin the controller stamped rather than assuming the mapping, and
// compare it to getGridPoint(thatRawOrigin, gridSize). To get the RAW (pre-snap)
// scene origin we draw once with Ctrl held (bypass) and once without, at the SAME
// client point — the Ctrl draw reveals the raw scene origin; the non-Ctrl draw must
// equal getGridPoint(raw, gridSize).

// Enable grid mode; read the live grid size (controller.appState is public).
await ev(`if (!window.__draw.gridMode) window.__draw.toggleGrid();`);
const gridOn = await ev(`window.__draw.gridMode`);
const GS = await ev(`window.__draw.appState.current.gridSize`);

// Draw with Ctrl held → reveals the RAW scene origin (bypass snap)
const drawAt = async (cx, cy, ctrl) => {
  await ev(`window.__draw.clear(); window.__draw.setTool('rectangle');`);
  await ev(`window.__draw.pointerDown(${cx}, ${cy}, { ctrlKey:${ctrl}, metaKey:false, shiftKey:false, altKey:false })`);
  await ev(`window.__draw.pointerMove(${cx + 90}, ${cy + 70}, { ctrlKey:${ctrl}, metaKey:false })`);
  await ev(`window.__draw.pointerUp(${cx + 90}, ${cy + 70}, { ctrlKey:${ctrl}, metaKey:false })`);
  await ev(`window.__draw.setTool('selection')`);
  return ev(`(() => { const e = window.__draw.scene.elements.find(x => x.type==='rectangle'); return e ? { x: e.x, y: e.y } : null; })()`);
};

// pick a client point that maps to an off-grid scene origin
const CX = 237, CY = 181;
const raw = await drawAt(CX, CY, true);     // ctrl → raw scene origin
const snapped = await drawAt(CX, CY, false); // no ctrl → must be grid-snapped

const expected = raw && GS
  ? { x: Math.round(raw.x / GS) * GS, y: Math.round(raw.y / GS) * GS }
  : null;

const snapOk = snapped && expected && snapped.x === expected.x && snapped.y === expected.y;
// also require the snap actually MOVED the origin (else the test is vacuous)
const moved = raw && snapped && (raw.x !== snapped.x || raw.y !== snapped.y);
// and Ctrl-bypass must NOT be grid-aligned in at least one axis (proves bypass works)
const bypassOk = raw && GS && (raw.x % GS !== 0 || raw.y % GS !== 0);

const ok = gridOn === true && GS > 0 && snapOk && moved && bypassOk;
console.log('--- Bug #6 differential: creation origin snaps to grid (Ctrl bypasses) ---');
console.log(`  gridOn=${gridOn} gridSize=${GS}`);
console.log(`  raw(ctrl)=${JSON.stringify(raw)}  snapped(no-ctrl)=${JSON.stringify(snapped)}  expected=${JSON.stringify(expected)}`);
console.log(`  snapMatchesGetGridPoint=${snapOk}  snapActuallyMoved=${moved}  ctrlBypassRaw=${bypassOk}`);
console.log(ok ? 'PASS: creation origin grid-snapped per getGridPoint; Ctrl bypasses' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
