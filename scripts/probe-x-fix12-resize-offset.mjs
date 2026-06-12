// Fix-12 verification — Bug #12: grabbing a transform handle must keep the
// grabbed corner under the cursor (subtract the grab offset) instead of
// teleporting the corner to the cursor on first move. Excalidraw stores
// pointerDownState.resize.offset = getResizeOffsetXY(...) (App.tsx:8570-8580) and
// applies cursor - offset on every move (App.tsx:12589-12594).
//
// DIFFERENTIAL PROOF: grab the SE handle a few px INSIDE the exact corner, then
// move the cursor by a known delta. With the offset preserved, the SE corner ends
// at (originalCorner + delta). Without the fix it would jump so the corner lands
// at the cursor (= originalCorner + delta + grabGap). We assert the corner moved
// by EXACTLY the cursor delta, and that the residual gap equals the grab gap.
// Grid is turned OFF so the only effect under test is the offset subtraction.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9284;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix12', '--window-size=1440,900', URL]);
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

// ensure grid OFF so the offset subtraction is the only thing under test
await ev(`if (window.__draw.gridMode) window.__draw.toggleGrid();`);

// Draw a rectangle. Capture its SE corner (x2,y2) in SCENE coords.
await ev(`window.__draw.clear(); window.__draw.setTool('rectangle');`);
await ev(`window.__draw.pointerDown(300, 300, {});`);
await ev(`window.__draw.pointerMove(500, 440, {});`);
await ev(`window.__draw.pointerUp(500, 440, {});`);
await ev(`window.__draw.setTool('selection');`);
// select it
await ev(`window.__draw.selectAll();`);
const start = await ev(`(() => { const e = window.__draw.scene.elements.find(x=>x.type==='rectangle'); return { x:e.x, y:e.y, w:e.width, h:e.height, x2:e.x+e.width, y2:e.y+e.height }; })()`);

// The SE handle sits at the element's bottom-right corner in SCENE coords. The
// controller's pointer* API takes CLIENT coords; at zoom=1, scroll=0 the mapping
// is a constant translation, and the rectangle was drawn FROM client (300,300) TO
// (500,440) → its scene origin maps back. We grab the handle by clicking a few px
// INSIDE the exact SE client corner (500,440), creating a known grab gap.
const GRAB_GAP_X = 6, GRAB_GAP_Y = 4;       // click this far inside the corner
const grabClientX = 500 - GRAB_GAP_X;        // = 494
const grabClientY = 440 - GRAB_GAP_Y;        // = 436
const MOVE_DX = 80, MOVE_DY = 50;            // then drag the cursor by this delta

// pointerDown ON the handle (hit-test finds the SE handle near the corner)
await ev(`window.__draw.pointerDown(${grabClientX}, ${grabClientY}, {});`);
const grabbedHandle = await ev(`(() => { try { return window.__draw['#resizeHandle']; } catch(e){ return 'n/a'; } })()`);
await ev(`window.__draw.pointerMove(${grabClientX + MOVE_DX}, ${grabClientY + MOVE_DY}, {});`);
await ev(`window.__draw.pointerUp(${grabClientX + MOVE_DX}, ${grabClientY + MOVE_DY}, {});`);

const end = await ev(`(() => { const e = window.__draw.scene.elements.find(x=>x.type==='rectangle'); return { x2:e.x+e.width, y2:e.y+e.height }; })()`);

// Expected (offset preserved): the SE corner moves by EXACTLY the cursor delta.
const expX2 = start.x2 + MOVE_DX;
const expY2 = start.y2 + MOVE_DY;
// Buggy (offset lost): corner would jump to cursor = start corner + grabGap + delta,
// i.e. an extra (GRAB_GAP_X, GRAB_GAP_Y) beyond the cursor delta.
const buggyX2 = start.x2 + MOVE_DX + GRAB_GAP_X;
const buggyY2 = start.y2 + MOVE_DY + GRAB_GAP_Y;

const tol = 1.5; // sub-pixel rounding tolerance
const near = (a, b) => Math.abs(a - b) <= tol;
const matchesFixed = near(end.x2, expX2) && near(end.y2, expY2);
const matchesBuggy = near(end.x2, buggyX2) && near(end.y2, buggyY2);

const ok = matchesFixed && !matchesBuggy;
console.log('--- Bug #12 differential: grabbed corner tracks cursor (offset preserved) ---');
console.log(`  start SE corner = (${start.x2}, ${start.y2})  grab gap = (${GRAB_GAP_X}, ${GRAB_GAP_Y})  cursor delta = (${MOVE_DX}, ${MOVE_DY})`);
console.log(`  end SE corner   = (${end.x2}, ${end.y2})`);
console.log(`  expected(fixed) = (${expX2}, ${expY2})  -> match=${matchesFixed}`);
console.log(`  buggy(jump)     = (${buggyX2}, ${buggyY2}) -> match=${matchesBuggy}`);
console.log(ok ? 'PASS: corner moved by exactly the cursor delta (grab offset preserved, no jump)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
