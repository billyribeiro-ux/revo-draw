// Proves the divider (vertical/horizontal line) tool is fixed:
//   1. Dragging DOWN makes a VERTICAL line (orientation=vertical), 1px cross-axis (not a huge box).
//   2. Dragging RIGHT makes a HORIZONTAL line.
//   3. Dragging further does NOT inflate thickness — the rendered lineWidth comes from strokeWidth
//      (1/2/4 px / zoom), NOT the bbox height. We instrument the live canvas ctx.lineWidth used by
//      drawDivider and assert it stays thin regardless of how long the drag is.
//   4. A plain click drops a default horizontal divider.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9293, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-div2', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : undefined; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

const box = await ev(`(async () => {
	const e = (await import('/src/lib/canvas/editor.svelte.ts')).editor; window.__e = e; window.__d = await import('/src/lib/elements/defaults.ts');
	const c = document.querySelector('canvas').getBoundingClientRect();
	const reset = () => { e.scene.replaceDocument(window.__d.createBlankDocument('div')); e.history.reset(e.scene.doc); e.camera.setViewport(c.width, c.height); e.camera.zoom = 1; e.camera.panX = 0; e.camera.panY = 0; e.setTool('divider'); };
	window.__reset = reset; reset();
	return { x: c.left, y: c.top };
})()`);
const M = (x, y) => ({ x: Math.round(box.x + x), y: Math.round(box.y + y) });
async function drag(ax, ay, bx, by, steps = 12) {
	let m = M(ax, ay);
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(15);
	for (let i = 1; i <= steps; i++) { const q = M(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y, button: 'left', buttons: 1 }); await sleep(12); }
	m = M(bx, by);
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(50);
}
async function click(x, y) { const m = M(x, y); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(15); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(50); }
const firstEl = () => ev(`(() => { const e = window.__e; const id = Object.keys(e.scene.doc.elements)[0]; if (!id) return null; const x = e.scene.get(id); return { type: x.type, w: Math.round(x.width), h: Math.round(x.height), orientation: ('orientation' in x) ? x.orientation : '<<unset>>' }; })()`);

// Instrument the live canvas to capture the lineWidth actually used while drawing a divider.
await ev(`(() => { const ctx = document.querySelector('canvas').getContext('2d'); if (!ctx.__wrapped) { ctx.__wrapped = true; const o = ctx.stroke.bind(ctx); ctx.stroke = function () { (window.__lw ||= []).push(this.lineWidth); return o(); }; } })()`);

const results = [];

// 1) Drag DOWN → vertical line.
await ev(`window.__reset()`);
await drag(300, 150, 305, 420); // mostly vertical, long
const vert = await firstEl();
results.push(['drag down → VERTICAL line', vert && vert.orientation === 'vertical' && vert.h > vert.w]);
results.push(['vertical line cross-axis stays 1px (NOT a box)', vert && vert.w === 1]);

// 2) Drag RIGHT → horizontal line.
await ev(`window.__reset()`);
await drag(150, 300, 420, 305);
const horiz = await firstEl();
results.push(['drag right → HORIZONTAL line', horiz && horiz.orientation === 'horizontal' && horiz.w > horiz.h]);
results.push(['horizontal line cross-axis stays 1px', horiz && horiz.h === 1]);

// 3) Thickness must NOT balloon with length. Draw a very long vertical line, capture lineWidth.
await ev(`window.__reset(); window.__lw = [];`);
await drag(500, 100, 503, 500); // 400px-long line
await ev(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const lws = await ev(`[...new Set((window.__lw||[]).map(v => Math.round(v*100)/100))]`);
const maxLw = await ev(`Math.max(...(window.__lw||[1]))`);
// At zoom=1, a thin/bold/extra divider should paint at ~1.5px (base), definitely < 6px — never ~400.
results.push(['rendered line thickness stays thin regardless of length (<6px)', maxLw < 6]);
console.log('   captured divider lineWidths:', JSON.stringify(lws), ' max=', Math.round(maxLw * 100) / 100);

// 4) Plain click → default horizontal divider.
await ev(`window.__reset()`);
await click(300, 300);
const clicked = await firstEl();
results.push(['plain click drops a default divider', clicked && clicked.type === 'divider' && clicked.w > clicked.h]);

let pass = 0;
for (const [name, ok] of results) { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (ok) pass++; }
console.log(`\nTOTAL: ${pass}/${results.length} checks passed`);
ws.close(); chrome.kill();
process.exit(pass === results.length ? 0 : 1);
