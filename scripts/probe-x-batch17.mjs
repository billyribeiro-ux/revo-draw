// Batch-17 verification: embeddable elements — place → URL dialog → submit sets the
// link + renders an iframe; YouTube normalizes; cancel removes the placeholder; an
// invalid URL is rejected.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9273;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b17', '--window-size=1440,900', URL]);
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
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// 1) embeddable tool: drag a box → pending embed + dialog opens
await ev(`window.__draw.setTool('embeddable')`);
await m2('mouseMoved', 400, 300, 0); await sleep(15); await m2('mousePressed', 400, 300, 1); await sleep(20); await m2('mouseMoved', 700, 470, 1); await sleep(20); await m2('mouseReleased', 700, 470, 0); await sleep(60);
const pendingSet = await ev(`!!window.__draw.pendingEmbed`);
const dialogOpen = await ev(`!!document.querySelector('.embed-dialog')`);
const embCount = await ev(`window.__draw.scene.elements.filter(e => e.type === 'embeddable').length`);

// 2) submit a YouTube URL → link normalized to /embed/ + iframe rendered
const accepted = await ev(`window.__draw.setEmbedLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')`);
await sleep(80);
const link = await ev(`window.__draw.scene.elements.find(e => e.type === 'embeddable')?.link`);
const iframeRendered = await ev(`!!document.querySelector('iframe.embed-frame')`);
const iframeSrc = await ev(`document.querySelector('iframe.embed-frame')?.getAttribute('src')`);
const pendingClearedAfterSubmit = await ev(`window.__draw.pendingEmbed === null`);

// 3) invalid URL is rejected (dialog stays / returns false)
await ev(`window.__draw.setTool('embeddable')`);
await m2('mouseMoved', 300, 550, 0); await sleep(15); await m2('mousePressed', 300, 550, 1); await sleep(20); await m2('mouseReleased', 300, 550, 0); await sleep(60); // click → default box
const rejected = await ev(`window.__draw.setEmbedLink('not a url at all')`);
const stillPending = await ev(`!!window.__draw.pendingEmbed`);

// 4) cancel removes the placeholder
await ev(`window.__draw.cancelEmbed()`);
const afterCancel = await ev(`window.__draw.scene.elements.filter(e => e.type === 'embeddable').length`);

console.log('place: pending=', pendingSet, 'dialog=', dialogOpen, 'embeddables=', embCount);
console.log('submit YT: accepted=', accepted, '| link=', JSON.stringify(link), '| iframe=', iframeRendered, 'src=', JSON.stringify(iframeSrc));
console.log('invalid rejected=', rejected, '| still pending=', stillPending);
console.log('after cancel: embeddables=', afterCancel);

const ok =
  pendingSet === true && dialogOpen === true && embCount === 1 &&
  accepted === true && typeof link === 'string' && link.includes('youtube.com/embed/dQw4w9WgXcQ') &&
  iframeRendered === true && (iframeSrc ?? '').includes('youtube.com/embed/') &&
  pendingClearedAfterSubmit === true &&
  rejected === false && stillPending === true &&
  afterCancel === 1; // the YT one remains; the rejected placeholder was cancelled
console.log(ok ? 'PASS: embeddables (place + dialog + YT normalize + iframe + reject + cancel)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
