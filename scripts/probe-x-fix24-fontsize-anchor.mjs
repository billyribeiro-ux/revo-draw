// Fix-24 verification — Bug #24: changing font size must re-anchor the text so it
// grows from its anchor instead of jumping down-right from the top-left. Excalidraw
// applies offsetElementAfterFontResize (actionProperties.tsx:230-249): for a
// center-aligned, auto-resizing text the CENTER stays fixed; for right-aligned the
// right edge stays fixed; left keeps x. y always re-centers by the height delta.
//
// DIFFERENTIAL PROOF: capture a center-aligned text's center, grow the font, assert
// the center is preserved (within tolerance) and the new x/y equal the upstream
// formula. Pre-fix x/y were unchanged → center drifted down-right.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9303;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix24', '--window-size=1440,900', URL]);
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

// create a center-aligned text element
await ev(`window.__draw.setTool('text'); window.__draw.pointerDown(400,300,{}); window.__draw.setEditingText('Hello World'); window.__draw.commitText(); window.__draw.setTool('selection');`);
await ev(`window.__draw.selectAll(); window.__draw.setTextAlign('center');`); await sleep(40);

const before = JSON.parse(await ev(`(() => { const t = window.__draw.scene.elements.find(e=>e.type==='text'); return JSON.stringify({ x:t.x, y:t.y, w:t.width, h:t.height, fs:t.fontSize, align:t.textAlign, autoResize:t.autoResize }); })()`));
const centerBefore = { cx: before.x + before.w / 2, cy: before.y + before.h / 2 };

// grow font size substantially
await ev(`window.__draw.selectAll(); window.__draw.setFontSize(48);`); await sleep(40);

const after = JSON.parse(await ev(`(() => { const t = window.__draw.scene.elements.find(e=>e.type==='text'); return JSON.stringify({ x:t.x, y:t.y, w:t.width, h:t.height, fs:t.fontSize }); })()`));
const centerAfter = { cx: after.x + after.w / 2, cy: after.y + after.h / 2 };

// upstream formula for center-aligned + autoResize:
//   x = prevX + (prevW - newW)/2 ; y = prevY + (prevH - newH)/2
const expX = before.x + (before.w - after.w) / 2;
const expY = before.y + (before.h - after.h) / 2;

const tol = 1.5;
const near = (a, b) => Math.abs(a - b) <= tol;
const grew = after.w > before.w && after.h > before.h && after.fs === 48;
const xy_matches_formula = near(after.x, expX) && near(after.y, expY);
const center_preserved = near(centerAfter.cx, centerBefore.cx) && near(centerAfter.cy, centerBefore.cy);

const ok = before.align === 'center' && before.autoResize && grew && xy_matches_formula && center_preserved;
console.log('--- Bug #24 differential: font-size change re-anchors center-aligned text ---');
console.log(`  before x,y=(${before.x},${before.y}) wh=(${before.w},${before.h}) center=(${centerBefore.cx.toFixed(1)},${centerBefore.cy.toFixed(1)})`);
console.log(`  after  x,y=(${after.x},${after.y}) wh=(${after.w},${after.h}) center=(${centerAfter.cx.toFixed(1)},${centerAfter.cy.toFixed(1)})`);
console.log(`  expected x,y by formula=(${expX.toFixed(1)},${expY.toFixed(1)}) | matches=${xy_matches_formula} | centerPreserved=${center_preserved} | grew=${grew}`);
console.log(ok ? 'PASS: center-aligned text grows symmetrically (center fixed, matches offsetElementAfterFontResize)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
