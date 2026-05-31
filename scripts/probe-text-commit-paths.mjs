// Locks in the text-tool fix: every commit path KEEPS typed text (Escape commits like Excalidraw's
// textWysiwyg handleSubmit, blur commits, Cmd+Enter commits), empty box is discarded, double-click
// re-enters edit. The original bug: Escape called cancelTextEdit() and threw the typed text away.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9313, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-tcp', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : undefined; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }
const box = await ev(`(async()=>{const e=(await import('/src/lib/canvas/editor.svelte.ts')).editor;window.__e=e;window.__D=await import('/src/lib/elements/defaults.ts');const reset=()=>{e.scene.replaceDocument(window.__D.createBlankDocument('tcp'));e.history.reset(e.scene.doc);const c=document.querySelector('canvas').getBoundingClientRect();e.camera.setViewport(c.width,c.height);e.camera.zoom=1;e.camera.panX=0;e.camera.panY=0;e.setTool('text');};window.__reset=reset;reset();const c=document.querySelector('canvas').getBoundingClientRect();return {x:c.left,y:c.top};})()`);
const M = (x, y) => ({ x: Math.round(box.x + x), y: Math.round(box.y + y) });
async function click(x, y) { const m = M(x, y); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(20); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(120); }
async function dbl(x, y) { const m = M(x, y); for (let i = 0; i < 2; i++) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: i + 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: i + 1 }); await sleep(20); } await sleep(120); }
async function type(s) { await send('Input.insertText', { text: s }); await sleep(60); }
async function esc() { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(150); }
const content = () => ev(`(()=>{const ids=Object.keys(window.__e.scene.doc.elements);const el=ids[0]?window.__e.scene.get(ids[0]):null;return {count:ids.length,content:el?el.content:'<none>'};})()`);
let pass = 0, fail = 0; const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

await ev(`window.__reset()`); await click(300, 200); await type('Alpha'); await esc();
let r = await content(); ck('Escape COMMITS typed text (the fixed bug)', r.content === 'Alpha' && r.count === 1, JSON.stringify(r));
await ev(`window.__reset()`); await click(300, 200); await type('Beta'); await click(800, 550);
r = await content(); ck('click-away (blur) commits typed text', r.content === 'Beta' && r.count === 1, JSON.stringify(r));
await ev(`window.__reset()`); await click(300, 200); await type('Gamma');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', modifiers: 4 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', modifiers: 4 }); await sleep(150);
r = await content(); ck('Cmd+Enter commits typed text', r.content === 'Gamma' && r.count === 1, JSON.stringify(r));
await ev(`window.__reset()`); await click(300, 200); await esc();
r = await content(); ck('empty text box discarded on commit', r.count === 0, JSON.stringify(r));
await ev(`window.__reset()`); await click(300, 200); await type('Delta'); await esc();
await ev(`window.__e.setTool('select')`); await sleep(60);
const el0 = await ev(`(()=>{const id=Object.keys(window.__e.scene.doc.elements)[0];const e=window.__e.scene.get(id);return {cx:e.x+e.width/2,cy:e.y+e.height/2};})()`);
await dbl(el0.cx, el0.cy);
ck('double-click existing text re-enters edit', await ev(`window.__e.editingTextId !== null`));

console.log(`\nTOTAL: ${pass}/${pass + fail} checks passed`);
ws.close(); chrome.kill();
process.exit(fail ? 1 : 0);
