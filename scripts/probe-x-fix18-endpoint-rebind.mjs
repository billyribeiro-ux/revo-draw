// Fix-18/19 verification — dragging an arrow ENDPOINT during point-editing must
// re-bind (onto a shape) or un-bind (off a shape) the endpoint, using per-endpoint
// inside/orbit geometry and honouring isBindingEnabled. Mirrors Excalidraw's
// actionFinalize (actionFinalize.tsx:88-123) → bindOrUnbindBindingElement.
//
// DIFFERENTIAL PROOF: arrow with a FREE end (no binding). Enter line-edit, drag the
// free end onto a shape → endBinding becomes set. Drag it back off → endBinding
// clears. Pre-fix, #linearPointerUp never touched bindings so endBinding stayed
// unchanged through both drags.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9307;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix18', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
await send('Page.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && buttons === 0 ? 'none' : 'left', buttons, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await mouse('mouseMoved', x1, y1, 0); await mouse('mousePressed', x1, y1, 1); await sleep(30); await mouse('mouseMoved', (x1 + x2) / 2, (y1 + y2) / 2, 1); await sleep(20); await mouse('mouseMoved', x2, y2, 1); await sleep(30); await mouse('mouseReleased', x2, y2, 0); await sleep(50); };
const click = async (x, y) => { await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await sleep(20); await mouse('mouseReleased', x, y, 0); await sleep(40); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await mouse('mouseMoved', 200, 200, 0);

const off = await ev(`(()=>{const cs=document.querySelectorAll('.canvas-wrap canvas.layer');const r=cs[cs.length-1].getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top)};})()`);
const vp = (sx, sy) => [sx + off.left, sy + off.top];

// a filled target shape far from the arrow's free end
await ev(`window.__draw.setTool('rectangle'); window.__draw.setBackgroundColor('#a5d8ff'); window.__draw.setFillStyle('solid');`);
await drag(...vp(680, 300), ...vp(760, 380));
// an arrow whose END (point 1) is in EMPTY space (not bound)
await ev(`window.__draw.setTool('arrow');`);
await drag(...vp(420, 340), ...vp(540, 340));
await ev(`window.__draw.setTool('selection');`);
await click(...vp(480, 340)); // select arrow body
await ev(`window.__draw.enterLineEditor();`); await sleep(30);

const arrowEl = () => `window.__draw.scene.elements.find(e=>e.type==='arrow')`;
const endBindingOf = async () => ev(`(() => { const a=${arrowEl()}; return a && a.endBinding ? a.endBinding.elementId : null; })()`);
const tipGlobal = async () => JSON.parse(await ev(`(() => { const a=${arrowEl()}; const p=a.points[a.points.length-1]; return JSON.stringify({x:a.x+p[0], y:a.y+p[1]}); })()`));
const rectId = await ev(`window.__draw.scene.elements.find(e=>e.type==='rectangle').id`);

const bindBefore = await endBindingOf(); // expect null (free end)

// select the END point so the drag moves it, then drag it ONTO the shape (~720,340)
let tip = await tipGlobal();
await drag(...vp(tip.x, tip.y), ...vp(720, 340)); await sleep(30);
const bindAfterOn = await endBindingOf(); // expect rectId (bound)

// drag the end back OFF the shape into empty space (~540,340)
tip = await tipGlobal();
await drag(...vp(tip.x, tip.y), ...vp(540, 340)); await sleep(30);
const bindAfterOff = await endBindingOf(); // expect null (un-bound)

const startedFree = bindBefore === null;
const boundOnDragOnto = bindAfterOn === rectId;
const unboundOnDragOff = bindAfterOff === null;

const ok = startedFree && boundOnDragOnto && unboundOnDragOff;
console.log('--- Bug #18/#19 differential: endpoint drag re-binds / un-binds ---');
console.log(`  endBinding: free=${bindBefore} -> dragOntoShape=${bindAfterOn} (want ${rectId}) -> dragOff=${bindAfterOff} (want null)`);
console.log(`  startedFree=${startedFree} boundOnDragOnto=${boundOnDragOnto} unboundOnDragOff=${unboundOnDragOff}`);
console.log(ok ? 'PASS: dragging an endpoint onto a shape binds it; off a shape un-binds it' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
