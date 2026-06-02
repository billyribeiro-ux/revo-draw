// Wave-3 verification: pan/zoom (ctrl+wheel), right-click context menu, hamburger main menu, help.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9254;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xnav', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// draw a shape
await ev(`window.__draw.setTool('rectangle')`);
await m2('mouseMoved', 500, 350, 0); await sleep(15); await m2('mousePressed', 500, 350, 1); await sleep(25); await m2('mouseMoved', 720, 500, 1); await sleep(25); await m2('mouseReleased', 720, 500, 0); await sleep(40);

// zoom in via ctrl+wheel
const z0 = await ev(`window.__draw.zoom`);
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 600, y: 420, deltaX: 0, deltaY: -240, modifiers: 2 });
await sleep(80);
const z1 = await ev(`window.__draw.zoom`);

// right-click → context menu
await ev(`document.querySelectorAll('canvas')[1].dispatchEvent(new MouseEvent('contextmenu', { clientX: 600, clientY: 420, bubbles: true }))`);
await sleep(80);
const ctx = await ev(`document.body.innerText.includes('Duplicate') && document.body.innerText.includes('Delete')`);

// close context, open main menu (hamburger = first toolbar button)
await ev(`document.body.click()`); await sleep(40);
await ev(`[...document.querySelectorAll('.toolbar button')][0].click()`); await sleep(80);
const menu = await ev(`document.body.innerText.includes('Reset the canvas')`);

// help via ? key
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '?', code: 'Slash', modifiers: 8 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '?', code: 'Slash', modifiers: 8 });
await sleep(120);
const help = await ev(`/shortcut|keyboard|undo/i.test(document.body.innerText)`);

console.log(`zoom: ${z0} -> ${z1} | contextMenu=${ctx} | mainMenu=${menu} | help=${help}`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-nav.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-nav.png');

const ok = z1 > z0 && ctx === true && menu === true && help === true;
console.log(ok ? 'PASS: zoom + context menu + main menu + help all work' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
