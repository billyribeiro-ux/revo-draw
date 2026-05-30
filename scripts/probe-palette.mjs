import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9250, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-pal', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

// Create + select an element so the StylePanel renders.
await ev(`(async () => {
	const { editor } = await import('/src/lib/canvas/editor.svelte.ts');
	const { createBlankDocument } = await import('/src/lib/elements/defaults.ts');
	editor.scene.replaceDocument(createBlankDocument('pal')); editor.history.reset(editor.scene.doc);
	const c = document.querySelector('canvas').getBoundingClientRect();
	editor.camera.setViewport(c.width, c.height); editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0;
	const idc = editor.commands.createAt('card', { x: 200, y: 200, width: 200, height: 140 });
	editor.scene.selectOne(idc); editor.gestureActive = false;
})()`);
await sleep(120); // let the panel render

// Click the stroke "more" trigger to open the palette grid.
const opened = await ev(`(() => {
	const panel = document.querySelector('.style-panel'); if (!panel) return { err: 'no panel' };
	const moreBtns = panel.querySelectorAll('.more .current');
	if (!moreBtns.length) return { err: 'no more trigger' };
	moreBtns[0].click();
	return { clicked: true };
})()`);
await sleep(120);

const rects = await ev(`(() => {
	const panel = document.querySelector('.style-panel');
	const pop = document.querySelector('.grid-pop');
	if (!panel) return { err: 'no panel' };
	if (!pop) return { err: 'no popover (did it open?)' };
	const pr = panel.getBoundingClientRect();
	const gr = pop.getBoundingClientRect();
	return {
		panel: { left: Math.round(pr.left), right: Math.round(pr.right), top: Math.round(pr.top), bottom: Math.round(pr.bottom) },
		pop: { left: Math.round(gr.left), right: Math.round(gr.right), top: Math.round(gr.top), bottom: Math.round(gr.bottom) },
		viewportW: window.innerWidth
	};
})()`);

console.log('opened:', JSON.stringify(opened));
console.log('rects:', JSON.stringify(rects, null, 1));
if (!rects.pop) { console.log('RESULT: FAIL — popover not found'); ws.close(); chrome.kill(); process.exit(1); }
// The popover must stay within the panel's right edge AND within the viewport.
const insideRight = rects.pop.right <= rects.panel.right + 1;
const insideViewport = rects.pop.right <= rects.viewportW && rects.pop.left >= 0;
console.log(`popover.right=${rects.pop.right}  panel.right=${rects.panel.right}  → withinPanelRight=${insideRight}, withinViewport=${insideViewport}`);
console.log(insideRight && insideViewport ? 'RESULT: PASS — palette stays inside the box' : 'RESULT: FAIL — palette overflows');
ws.close(); chrome.kill();
process.exit(insideRight && insideViewport ? 0 : 1);
