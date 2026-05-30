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
async function pickSwatch(aria) { const r = await ev(`(()=>{const b=[...document.querySelectorAll('.style-panel .swatch')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(aria)});if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`); if (!r) return false; await clickClient(r.x, r.y); return true; }
// Sample the LIVE on-screen canvas pixel at the card's top edge (world≈(285,150) → screen).
async function livePixel() {
	return ev(`(() => {
		const e = window.__e; const id = [...e.scene.selection][0]; const el = e.scene.get(id);
		const top = e.camera.toScreen({ x: el.x + el.width/2, y: el.y });
		const cv = document.querySelector('canvas');
		const dpr = window.devicePixelRatio || 1;
		const ctx = cv.getContext('2d');
		const px = Math.round(top.x * dpr), py = Math.round((top.y + 1) * dpr);
		const d = ctx.getImageData(px, py, 1, 1).data;
		return [d[0], d[1], d[2], d[3]];
	})()`);
}
const okRed = await pickSwatch('Stroke #e03131'); const strokeRed = await ev(`window.__e.scene.get([...window.__e.scene.selection][0]).style.stroke`); const pxRed = await livePixel();
const okBlue = await pickSwatch('Stroke #1971c2'); const strokeBlue = await ev(`window.__e.scene.get([...window.__e.scene.selection][0]).style.stroke`); const pxBlue = await livePixel();
const okGreen = await pickSwatch('Stroke #2f9e44'); const strokeGreen = await ev(`window.__e.scene.get([...window.__e.scene.selection][0]).style.stroke`); const pxGreen = await livePixel();

console.log('selected after click =', sel);
console.log('RED   stroke=', strokeRed, ' livePixel=', JSON.stringify(pxRed));
console.log('BLUE  stroke=', strokeBlue, ' livePixel=', JSON.stringify(pxBlue));
console.log('GREEN stroke=', strokeGreen, ' livePixel=', JSON.stringify(pxGreen));
const closeTo = (px, r, g, b) => Math.abs(px[0]-r) < 40 && Math.abs(px[1]-g) < 40 && Math.abs(px[2]-b) < 40;
const stateOK = sel === 1 && strokeRed === '#e03131' && strokeBlue === '#1971c2' && strokeGreen === '#2f9e44';
const pxOK = closeTo(pxRed, 224,49,49) && closeTo(pxBlue, 25,113,194) && closeTo(pxGreen, 47,158,68);
console.log('state changes:', stateOK ? 'PASS' : 'FAIL', '| live canvas pixel changes:', pxOK ? 'PASS' : 'FAIL');
console.log((stateOK && pxOK) ? 'RESULT: PASS' : 'RESULT: FAIL');
ws.close(); chrome.kill(); process.exit(stateOK && pxOK ? 0 : 1);
