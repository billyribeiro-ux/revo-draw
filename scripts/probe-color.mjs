import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9253, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-color', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : undefined; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

const box = await ev(`(async () => {
	const { editor } = await import('/src/lib/canvas/editor.svelte.ts'); window.__e = editor;
	const { createBlankDocument } = await import('/src/lib/elements/defaults.ts');
	editor.scene.replaceDocument(createBlankDocument('col')); editor.history.reset(editor.scene.doc);
	const c = document.querySelector('canvas').getBoundingClientRect();
	editor.camera.setViewport(c.width, c.height); editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0;
	const idc = editor.commands.createAt('card', { x: 200, y: 200, width: 200, height: 140 });
	editor.scene.selectOne(idc); editor.gestureActive = false; window.__id = idc;
	return { x: c.left, y: c.top };
})()`);
await sleep(150); // panel render

const strokeOf = () => ev(`window.__e.scene.get(window.__id).style.stroke`);

// Path A: drive via the SAME command the panel button calls.
const before = await strokeOf();
await ev(`window.__e.commands.setStyleOnSelection({ stroke: '#e03131' }, 'Stroke')`);
const afterRed = await strokeOf();
await ev(`window.__e.commands.setStyleOnSelection({ stroke: '#1971c2' }, 'Stroke')`);
const afterBlue = await strokeOf();
await ev(`window.__e.commands.setStyleOnSelection({ stroke: '#2f9e44' }, 'Stroke')`);
const afterGreen = await strokeOf();
console.log('[command path] before=', before, '→red=', afterRed, '→blue=', afterBlue, '→green=', afterGreen);

// Path B: drive via REAL CLICKS on the panel swatch buttons (the actual UI the user uses).
// Reset selection state.
await ev(`window.__e.scene.selectOne(window.__id); window.__e.gestureActive=false;`);
await sleep(120);
async function clickSwatchByAria(label) {
	const r = await ev(`(() => {
		const btns = [...document.querySelectorAll('.style-panel .swatch')];
		const b = btns.find(x => (x.getAttribute('aria-label')||'') === ${JSON.stringify(label)});
		if (!b) return { found:false, labels: btns.map(x=>x.getAttribute('aria-label')) };
		const rr = b.getBoundingClientRect();
		return { found:true, x: Math.round(rr.left + rr.width/2), y: Math.round(rr.top + rr.height/2) };
	})()`);
	if (!r.found) { console.log('  swatch not found for', label, 'available:', JSON.stringify(r.labels)); return; }
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
	await sleep(60);
}
await clickSwatchByAria('Stroke #e03131');
const clickRed = await strokeOf();
await clickSwatchByAria('Stroke #1971c2');
const clickBlue = await strokeOf();
await clickSwatchByAria('Stroke #2f9e44');
const clickGreen = await strokeOf();
console.log('[real-click path] →red=', clickRed, '→blue=', clickBlue, '→green=', clickGreen);

const cmdOK = afterRed === '#e03131' && afterBlue === '#1971c2' && afterGreen === '#2f9e44';
const clickOK = clickRed === '#e03131' && clickBlue === '#1971c2' && clickGreen === '#2f9e44';
console.log('command-path sequential changes:', cmdOK ? 'PASS' : 'FAIL');
console.log('real-click sequential changes:', clickOK ? 'PASS' : 'FAIL');
console.log((cmdOK && clickOK) ? 'RESULT: PASS' : 'RESULT: FAIL');
ws.close(); chrome.kill(); process.exit(cmdOK && clickOK ? 0 : 1);
