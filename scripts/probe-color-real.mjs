// Fully realistic, zero-programmatic-state color trace: real drag-create, real click-select, real
// swatch clicks — assert the element's stroke AND the on-canvas rendered pixel change each time.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9258, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-cr', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (!r) return; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : undefined; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

const box = await ev(`(async () => { const { editor } = await import('/src/lib/canvas/editor.svelte.ts'); window.__e = editor; const { createBlankDocument } = await import('/src/lib/elements/defaults.ts'); editor.scene.replaceDocument(createBlankDocument('cr')); editor.history.reset(editor.scene.doc); const c = document.querySelector('canvas').getBoundingClientRect(); editor.camera.setViewport(c.width, c.height); editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0; editor.setTool('card'); return { x: c.left, y: c.top, w: c.width, h: c.height }; })()`);
const M = (cx, cy) => ({ x: Math.round(box.x + cx), y: Math.round(box.y + cy) });
async function drag(ax, ay, bx, by, steps = 8) { let m = M(ax, ay); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(15); for (let i = 1; i <= steps; i++) { const q = M(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y, button: 'left', buttons: 1 }); await sleep(12); } m = M(bx, by); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(40); }
async function click(cx, cy) { const m = M(cx, cy); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(15); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(60); }
async function clickClient(x, y) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(15); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(70); }

// 1) Real drag-create a card.
await drag(150, 150, 420, 320);
// 2) Real click to select it (inside).
await click(285, 235);
const sel = await ev(`window.__e.scene.selection.size`);
// 3) Pick RED via real swatch click, read element stroke + LIVE canvas pixel on the card's top border.
// Instrument the LIVE canvas 2D context to capture stroke colors actually painted on each redraw.
await ev(`(() => { const ctx = document.querySelector('canvas').getContext('2d'); if (!ctx.__wrapped) { ctx.__wrapped = true; const o = ctx.stroke.bind(ctx); ctx.stroke = function () { (window.__strokes ||= []).push(this.strokeStyle); return o(); }; } })()`);
async function pickSwatchAndCapture(aria) {
	const r = await ev(`(()=>{const b=[...document.querySelectorAll('.style-panel .swatch')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(aria)});if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
	if (!r) return { found: false };
	await ev(`window.__strokes = []`);
	await clickClient(r.x, r.y);
	await ev(`new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))`);
	const drawn = await ev(`[...new Set(window.__strokes)]`);
	const stroke = await ev(`window.__e.scene.get([...window.__e.scene.selection][0]).style.stroke`);
	return { found: true, drawn, stroke };
}
const red = await pickSwatchAndCapture('Stroke #e03131');
const blue = await pickSwatchAndCapture('Stroke #1971c2');
const green = await pickSwatchAndCapture('Stroke #2f9e44');

console.log('selected after click =', sel);
console.log('RED   stroke=', red.stroke, ' drawnColors=', JSON.stringify(red.drawn));
console.log('BLUE  stroke=', blue.stroke, ' drawnColors=', JSON.stringify(blue.drawn));
console.log('GREEN stroke=', green.stroke, ' drawnColors=', JSON.stringify(green.drawn));
const stateOK = sel === 1 && red.stroke === '#e03131' && blue.stroke === '#1971c2' && green.stroke === '#2f9e44';
const drawnOK = red.drawn.includes('#e03131') && blue.drawn.includes('#1971c2') && green.drawn.includes('#2f9e44');
console.log('state changes:', stateOK ? 'PASS' : 'FAIL', '| live canvas painted the chosen color:', drawnOK ? 'PASS' : 'FAIL');
console.log((stateOK && drawnOK) ? 'RESULT: PASS' : 'RESULT: FAIL');
ws.close(); chrome.kill(); process.exit(stateOK && drawnOK ? 0 : 1);
