// Phase 3 keyboard verification: draw + select a rect, then duplicate (Cmd/Ctrl+D), delete
// (Delete), and deselect (Escape) via real key events. Asserts element count + selection at each.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9248;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xkeys',
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
const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await mouse('mousePressed', x1, y1, 1); await sleep(30); await mouse('mouseMoved', x2, y2, 1); await sleep(30); await mouse('mouseReleased', x2, y2, 0); await sleep(40); };
const click = async (x, y) => { await mouse('mousePressed', x, y, 1); await sleep(30); await mouse('mouseReleased', x, y, 0); await sleep(40); };
const key = async (k, code, modifiers = 0) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers }); await sleep(20); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); await sleep(40); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

const count = () => ev('window.__draw.scene.elements.length');
const selected = () => ev('window.__draw.selectedId');

await ev(`window.__draw.setTool('rectangle')`);
await drag(300, 200, 500, 360);
await ev(`window.__draw.setTool('selection')`);
await click(300, 280);
const afterSelect = { count: await count(), selected: (await selected()) !== null };

await key('d', 'KeyD', 4); // Cmd+D (Meta)
const afterDup = { count: await count(), selected: (await selected()) !== null };

await key('Delete', 'Delete', 0);
const afterDel = { count: await count(), selected: (await selected()) !== null };

await key('Escape', 'Escape', 0);
const afterEsc = { count: await count(), selected: (await selected()) !== null };

console.log('afterSelect:', JSON.stringify(afterSelect));
console.log('afterDup   :', JSON.stringify(afterDup));
console.log('afterDelete:', JSON.stringify(afterDel));
console.log('afterEscape:', JSON.stringify(afterEsc));

const ok =
  afterSelect.count === 1 && afterSelect.selected &&
  afterDup.count === 2 && afterDup.selected &&
  afterDel.count === 1 &&
  afterEsc.selected === false;
console.log(ok ? 'PASS: duplicate(+1) / delete(-1) / escape(deselect) via keyboard' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
