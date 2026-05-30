import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9240, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-probe', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }
const box = await ev(`(async()=>{const {editor}=await import('/src/lib/canvas/editor.svelte.ts');window.__e=editor;const {createBlankDocument}=await import('/src/lib/elements/defaults.ts');editor.scene.replaceDocument(createBlankDocument('p'));editor.history.reset(editor.scene.doc);const c=document.querySelector('canvas').getBoundingClientRect();editor.camera.setViewport(c.width,c.height);editor.camera.zoom=1;editor.camera.panX=0;editor.camera.panY=0;editor.setTool('card');return {x:c.left,y:c.top,w:c.width,h:c.height};})()`);
console.log('canvas box:', JSON.stringify(box), 'tool=', await ev('window.__e.tool'));
const m = (cx, cy) => ({ x: Math.round(box.x + cx), y: Math.round(box.y + cy) });
let d = m(200, 150);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: d.x, y: d.y, button: 'left', buttons: 1, clickCount: 1 });
await sleep(40);
console.log('after down: count=', await ev('Object.keys(window.__e.scene.doc.elements).length'), 'gestureActive=', await ev('window.__e.gestureActive'), 'dragKind=', await ev('window.__e.constructor.name'));
let d2 = m(440, 310);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d2.x, y: d2.y, button: 'left', buttons: 1 });
await sleep(40);
console.log('after move: count=', await ev('Object.keys(window.__e.scene.doc.elements).length'), 'cards=', await ev(`JSON.stringify(Object.values(window.__e.scene.doc.elements).map(e=>({t:e.type,w:Math.round(e.width),h:Math.round(e.height)})))`));
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: d2.x, y: d2.y, button: 'left', buttons: 0, clickCount: 1 });
await sleep(40);
console.log('after up: count=', await ev('Object.keys(window.__e.scene.doc.elements).length'), 'tool=', await ev('window.__e.tool'));
ws.close(); chrome.kill(); process.exit(0);
