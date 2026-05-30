import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9252, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-text2', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

await ev(`(async () => {
	const { editor } = await import('/src/lib/canvas/editor.svelte.ts'); window.__e = editor;
	const { createBlankDocument } = await import('/src/lib/elements/defaults.ts');
	editor.scene.replaceDocument(createBlankDocument('t')); editor.history.reset(editor.scene.doc);
	const c = document.querySelector('canvas').getBoundingClientRect();
	editor.camera.setViewport(c.width, c.height); editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0;
	editor.setTool('text');
})()`);

// Call #createTextAndEdit directly via the public pointerDown path is not possible (private),
// so simulate the editor entry exactly as the canvas does, but WITHOUT canvas.focus(), to isolate.
const a = await ev(`(() => {
	const e = window.__e;
	const c = document.querySelector('canvas').getBoundingClientRect();
	// directly invoke pointerDown like the canvas would (no canvas.focus())
	e.pointerDown({ x: 350, y: 250 }, { shift:false, alt:false, space:false, middle:false });
	return { editingTextId: e.editingTextId, tool: e.tool, textCount: Object.values(e.scene.doc.elements).filter(x=>x.type==='text').length };
})()`);
console.log('immediately after pointerDown (no canvas.focus):', JSON.stringify(a));
await ev(`window.__e.pointerUp()`);
await sleep(60);
const b = await ev(`(() => { const e=window.__e; return { editingTextId: e.editingTextId, overlayExists: !!document.querySelector('.text-overlay'), textCount: Object.values(e.scene.doc.elements).filter(x=>x.type==='text').length }; })()`);
console.log('after pointerUp + render tick:', JSON.stringify(b));
ws.close(); chrome.kill(); process.exit(0);
