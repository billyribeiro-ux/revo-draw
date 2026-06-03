// Milestone G (clipboard): copy / cut / paste.
//  copy a rect, paste centered at a point (count→2, paste lands centered), cut (count→1), paste (→2).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9277;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xclip',
  '--window-size=1440,900', URL
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no cdp');
}

const ws = new WebSocket(await discover());
let id = 0;
const pending = new Map();
const send = (m, pr = {}) =>
  new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');

const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const count = () => ev(`window.__draw.scene.elements.length`);
const selGeom = () => ev(`(()=>{const id=window.__draw.selectedId;const e=window.__draw.scene.elements.find(e=>e.id===id);return e?{x:Math.round(e.x),y:Math.round(e.y)}:null;})()`);

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear()`);

// draw a 120x100 rect at (300,200); select it
await ev(`(() => { const d=window.__draw; d.setTool('rectangle'); d.pointerDown(300,200); d.pointerMove(420,300); d.pointerUp(); d.selectAt(300,250); })()`);
const c0 = await count();
const selBefore = await ev(`window.__draw.selectedIds.size`);

// copy, then paste centered at (600,250): bbox center (360,250) → dx=240,dy=0 → new rect at (540,200)
await ev(`window.__draw.copySelected()`);
await ev(`window.__draw.paste(600, 250)`);
const c1 = await count();
const pasted = await selGeom();
const pasteOk = c1 === 2 && pasted && pasted.x === 540 && pasted.y === 200;

// cut the pasted (currently selected) → count back to 1
await ev(`window.__draw.cutSelected()`);
const c2 = await count();

// paste again (offset default) → count 2
await ev(`window.__draw.paste()`);
const c3 = await count();

console.log('count after draw:', c0, 'selected:', selBefore);
console.log('after paste@600,250 -> count', c1, 'pasted-at', JSON.stringify(pasted), '(expect 540,200) =>', pasteOk);
console.log('after cut -> count', c2, '(expect 1)');
console.log('after paste -> count', c3, '(expect 2)');

const ok = c0 === 1 && selBefore === 1 && pasteOk && c2 === 1 && c3 === 2;
console.log(ok ? 'PASS: copy/paste (centered) + cut + paste work' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
