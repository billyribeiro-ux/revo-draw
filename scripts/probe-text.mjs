import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9251, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-text', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

const box = await ev(`(async () => {
	const { editor } = await import('/src/lib/canvas/editor.svelte.ts'); window.__e = editor;
	const { createBlankDocument } = await import('/src/lib/elements/defaults.ts');
	editor.scene.replaceDocument(createBlankDocument('txt')); editor.history.reset(editor.scene.doc);
	const c = document.querySelector('canvas').getBoundingClientRect();
	editor.camera.setViewport(c.width, c.height); editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0;
	editor.setTool('text'); editor.currentStyle = {};
	return { x: c.left, y: c.top };
})()`);

// Single click with the text tool active.
const X = Math.round(box.x + 350), Y = Math.round(box.y + 250);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: X, y: Y, button: 'left', buttons: 1, clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X, y: Y, button: 'left', buttons: 0, clickCount: 1 });
await sleep(100);

const afterClick = await ev(`(() => {
	const e = window.__e;
	const ta = document.querySelector('.text-overlay');
	return {
		editing: e.editingTextId !== null,
		overlayExists: !!ta,
		overlayFocused: document.activeElement === ta,
		tool: e.tool,
		textCount: Object.values(e.scene.doc.elements).filter(x => x.type === 'text').length
	};
})()`);

// Focus overlay and type immediately (no extra clicks), then commit.
await ev(`document.querySelector('.text-overlay')?.focus()`);
await send('Input.insertText', { text: 'Hello there' });
await sleep(40);
const typed = await ev(`document.querySelector('.text-overlay')?.value`);
await ev(`(() => { const id = window.__e.editingTextId; if (id) window.__e.commitTextEdit(id, document.querySelector('.text-overlay').value); })()`);
await sleep(40);
const committed = await ev(`(() => { const t = Object.values(window.__e.scene.doc.elements).find(e=>e.type==='text'); return t ? t.content : null; })()`);

console.log('after single click with text tool:', JSON.stringify(afterClick));
console.log('overlay value after typing:', JSON.stringify(typed));
console.log('committed content:', JSON.stringify(committed));
const pass = afterClick.editing === true && afterClick.overlayExists === true && afterClick.overlayFocused === true && typed === 'Hello there' && committed === 'Hello there';
console.log(pass ? 'RESULT: PASS — text tool: click → type immediately works' : 'RESULT: FAIL');
ws.close(); chrome.kill();
process.exit(pass ? 0 : 1);
