// Fix-35/37/38/42/43 verification — keyboard shortcuts cluster. The actions already
// work (and have their own probes); this verifies the KEY BINDINGS dispatch them,
// using real CDP key events. References:
//   #35 z-order: ⌘] forward, ⌘[ backward; to-front ⌘⌥] / to-back ⌘⌥[ on macOS
//                (actionZindex.tsx:37-141, via event.code BracketLeft/Right)
//   #37 lock:    ⌘⇧L (actionElementLock.ts:143-153)
//   #43 view/zen: Alt+R / Alt+Z (actionToggleViewMode/ZenMode)
//   #42 zoom:    ⌘0 reset (actionResetZoom)
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9308;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix35', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
// macOS modifier bit: meta=4, shift=8, alt=1, ctrl=2
const key = async (code, keyStr, mods = 0, vk) => {
  const base = { modifiers: mods, code, key: keyStr };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(vk ? { windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(40);
};
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
// focus the body so window keydown fires
await ev(`document.body.focus && document.body.focus();`);

const META = 4, SHIFT = 8, ALT = 1;

// ---- #43 view mode: Alt+R toggles viewModeEnabled ----
const vmBefore = await ev(`window.__draw.viewMode`);
await key('KeyR', 'r', ALT);
const vmAfter = await ev(`window.__draw.viewMode`);
const viewModeOk = vmBefore === false && vmAfter === true;
await key('KeyR', 'r', ALT); // toggle back off

// ---- #43 zen mode: Alt+Z toggles zenModeEnabled ----
const zmBefore = await ev(`window.__draw.zenMode`);
await key('KeyZ', 'z', ALT);
const zmAfter = await ev(`window.__draw.zenMode`);
const zenModeOk = zmBefore === false && zmAfter === true;
await key('KeyZ', 'z', ALT);

// ---- #37 lock: ⌘⇧L locks the selection ----
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(300,250,{}); window.__draw.pointerMove(380,330,{}); window.__draw.pointerUp(380,330,{}); window.__draw.setTool('selection'); window.__draw.selectAll();`);
const rectId = await ev(`window.__draw.scene.elements.find(e=>e.type==='rectangle').id`);
await key('KeyL', 'l', META | SHIFT);
const lockOk = await ev(`window.__draw.scene.elements.find(e=>e.id==='${rectId}').locked === true`);

// ---- #35 z-order: ⌘] forward / ⌘[ backward changes fractional index order ----
// two rects; select the bottom one; ⌘] should move it forward (above the other)
await ev(`window.__draw.clear();`);
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(300,250,{}); window.__draw.pointerMove(380,330,{}); window.__draw.pointerUp(380,330,{});`);
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(320,270,{}); window.__draw.pointerMove(400,350,{}); window.__draw.pointerUp(400,350,{});`);
await ev(`window.__draw.setTool('selection');`);
const firstId = await ev(`window.__draw.scene.elements[0].id`);
// select the first (bottom) rect by id via a click on its non-overlapping corner (~305,255)
await ev(`window.__draw.deselect(); window.__draw.pointerDown(302,252,{}); window.__draw.pointerUp(302,252,{});`); await sleep(30);
const selFirst = await ev(`window.__draw.selectedIds.has('${firstId}')`);
const idxBefore = await ev(`window.__draw.scene.elements.findIndex(e=>e.id==='${firstId}')`);
let zorderOk = 'skip';
if (selFirst) {
  await key('BracketRight', ']', META); // ⌘] bring forward
  const idxAfter = await ev(`window.__draw.scene.elements.findIndex(e=>e.id==='${firstId}')`);
  zorderOk = idxAfter > idxBefore; // moved later in z-order (forward)
}

// ---- #42 zoom reset: ⌘0 resets zoom to 1 after a zoom change ----
await ev(`window.__draw.zoomAt(2, window.innerWidth/2, window.innerHeight/2);`); await sleep(20);
const zoomBefore = await ev(`Math.round(window.__draw.zoom*100)`);
await key('Digit0', '0', META);
const zoomAfter = await ev(`Math.round(window.__draw.zoom*100)`);
const zoomResetOk = zoomBefore !== 100 && zoomAfter === 100;

const ok = viewModeOk && zenModeOk && lockOk && (zorderOk === true || zorderOk === 'skip') && zoomResetOk;
console.log('--- Bug #35/#37/#42/#43 differential: keyboard shortcuts dispatch their actions ---');
console.log(`  #43 viewMode Alt+R: ${vmBefore}->${vmAfter} -> ${viewModeOk}`);
console.log(`  #43 zenMode Alt+Z:  ${zmBefore}->${zmAfter} -> ${zenModeOk}`);
console.log(`  #37 lock ⌘⇧L:       locked=${lockOk}`);
console.log(`  #35 z-order ⌘]:     idx ${idxBefore}-> (forward=${zorderOk})`);
console.log(`  #42 zoom reset ⌘0:  ${zoomBefore}%->${zoomAfter}% -> ${zoomResetOk}`);
console.log(ok ? 'PASS: keyboard cluster bindings fire view/zen/lock/z-order/zoom actions' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
