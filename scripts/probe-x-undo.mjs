// Phase 3 undo/redo verification: draw two shapes, then Cmd+Z twice (undo both), Cmd+Shift+Z once
// (redo one), asserting the visible element count tracks the history stack. Screenshot the result.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9249;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xundo',
  '--window-size=1440,900', URL
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  throw new Error('no cdp');
}

const ws = new WebSocket(await discover());
let id = 0;
const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');

const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await mouse('mousePressed', x1, y1, 1); await sleep(25); await mouse('mouseMoved', x2, y2, 1); await sleep(25); await mouse('mouseReleased', x2, y2, 0); await sleep(40); };
const key = async (k, code, modifiers = 0) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers }); await sleep(20); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); await sleep(50); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
const count = () => ev('window.__draw.scene.elements.length');

await ev(`window.__draw.setTool('rectangle')`);
await drag(150, 150, 300, 270);
await ev(`window.__draw.setTool('ellipse')`);
await drag(380, 160, 540, 320);
const drew = await count();

await key('z', 'KeyZ', 4); // Cmd+Z (undo ellipse)
const undo1 = await count();
await key('z', 'KeyZ', 4); // Cmd+Z (undo rect)
const undo2 = await count();
await key('z', 'KeyZ', 4 | 8); // Cmd+Shift+Z (redo rect)
const redo1 = await count();

console.log(`drew=${drew} undo1=${undo1} undo2=${undo2} redo1=${redo1}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-undo.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-undo.png');

const ok = drew === 2 && undo1 === 1 && undo2 === 0 && redo1 === 1;
console.log(ok ? 'PASS: undo/redo tracks the history stack' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
