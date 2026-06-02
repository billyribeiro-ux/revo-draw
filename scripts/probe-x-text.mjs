// Phase 3 text verification: pick the text tool, click to place, type via the textarea overlay,
// commit (blur), and assert the text element holds the typed string + the canvas painted it.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9251;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xtext', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 }); await sleep(20); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(30); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(60); };

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// Start text editing via the controller (the CDP mouse→pointer path for a tool that immediately
// focuses an overlay is flaky in headless; the real on-canvas handler is exercised in dbg/synthetic
// tests). This still drives the real overlay + oninput + commit + render pipeline below.
await ev(`window.__draw.setTool('text'); window.__draw.pointerDown(300, 250);`);
await sleep(80);
const editing = await ev(`!!window.__draw.editingText && document.activeElement && document.activeElement.tagName === 'TEXTAREA'`);

// type into the focused textarea overlay → its oninput → controller.setEditingText
await send('Input.insertText', { text: 'Hello revo' });
await sleep(60);
const liveText = await ev(`window.__draw.editingText ? window.__draw.editingText.text : null`);

await ev(`document.querySelector('.text-editor').blur()`);
await sleep(60);

const committed = await ev(`(() => {
  const e = window.__draw.scene.elements[0];
  const c = document.querySelectorAll('canvas')[0];
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonbg = 0; for (let p = 0; p < d.length; p += 4) { if (d[p+3] > 0 && !(d[p]>245&&d[p+1]>245&&d[p+2]>245)) nonbg++; }
  return e ? { type: e.type, text: e.text, nonbg } : { nonbg };
})()`);

console.log('focused textarea on click:', editing);
console.log('live text while typing  :', JSON.stringify(liveText));
console.log('committed element        :', JSON.stringify(committed));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-text.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-text.png');

const ok = editing === true && liveText === 'Hello revo' && committed.type === 'text' && committed.text === 'Hello revo' && committed.nonbg > 100;
console.log(ok ? 'PASS: text typed via overlay, committed, and painted' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
