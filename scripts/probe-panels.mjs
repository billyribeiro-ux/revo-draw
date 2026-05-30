// Proves the Excalidraw panel model end-to-end through the REAL DOM:
//  1. On blank load the Layers panel and Inspector are NOT mounted (canvas owns the viewport).
//  2. The Inspector auto-mounts when an element is selected (Excalidraw showSelectedShapeActions).
//  3. The Inspector unmounts again when selection clears.
//  4. The Layers panel is opt-in via the toolbar toggle, and toggles back off.
//  5. The color palette popover closes on an OUTSIDE click and on Escape (Excalidraw Popover).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9261, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-panels', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : undefined; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

// Fresh, EMPTY document — nothing selected, nothing drawn (true blank load).
await ev(`(async () => {
	const { editor } = await import('/src/lib/canvas/editor.svelte.ts'); window.__e = editor;
	const { createBlankDocument } = await import('/src/lib/elements/defaults.ts');
	editor.scene.replaceDocument(createBlankDocument('panels')); editor.history.reset(editor.scene.doc);
	editor.layersOpen = false; editor.inspectorPinned = false; editor.setTool('select');
	const c = document.querySelector('canvas').getBoundingClientRect();
	editor.camera.setViewport(c.width, c.height); editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0;
})()`);
await sleep(150);

const present = () => ev(`({ layers: !!document.querySelector('.left-panel'), inspector: !!document.querySelector('.right-panel'), style: !!document.querySelector('.style-panel') })`);

// 1) Blank load: nothing mounted.
const blank = await present();

// 2) Select an element → Inspector must auto-mount.
await ev(`(() => { const id = window.__e.commands.createAt('card', { x: 200, y: 200, width: 200, height: 140 }); window.__e.scene.selectOne(id); window.__e.gestureActive = false; window.__id = id; })()`);
await sleep(150);
const selected = await present();

// 3) Clear selection → Inspector unmounts again (tool is select, not pinned).
await ev(`window.__e.scene.clearSelection()`);
await sleep(150);
const cleared = await present();

// 4) Layers opt-in toggle — driven by a REAL click on the toolbar button (the user's path).
async function clickByAria(label) {
	const r = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!b) return null; const rr = b.getBoundingClientRect(); return { x: Math.round(rr.left + rr.width/2), y: Math.round(rr.top + rr.height/2) }; })()`);
	if (!r) return false;
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
	await sleep(180);
	return true;
}
await clickByAria('Toggle Layers panel');
const layersOn = await present();
await clickByAria('Toggle Layers panel');
const layersOff = await present();

// 5) Palette close-on-outside + Escape. Re-select so the style panel shows, open stroke popover.
await ev(`(() => { window.__e.scene.selectOne(window.__id); window.__e.gestureActive = false; })()`);
await sleep(120);
async function openStrokePopover() {
	const r = await ev(`(() => { const b = document.querySelector('.style-panel .more .current'); if (!b) return null; b.click(); return true; })()`);
	await sleep(100);
	return r;
}
async function popoverOpen() { return ev(`!!document.querySelector('.style-panel .grid-pop')`); }
// 5a) open, then click OUTSIDE (canvas center) → must close.
await openStrokePopover();
const openedA = await popoverOpen();
const cb = await ev(`(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: Math.round(c.left + c.width/2), y: Math.round(c.top + c.height/2) }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cb.x, y: cb.y, button: 'left', buttons: 1, clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cb.x, y: cb.y, button: 'left', buttons: 0, clickCount: 1 });
await sleep(120);
const closedByOutside = !(await popoverOpen());
// 5b) re-select (outside click cleared selection), open again, press Escape → must close.
await ev(`(() => { window.__e.scene.selectOne(window.__id); window.__e.gestureActive = false; })()`);
await sleep(120);
await openStrokePopover();
const openedB = await popoverOpen();
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(120);
const closedByEsc = !(await popoverOpen());

console.log('1) blank load          ', JSON.stringify(blank));
console.log('2) after select        ', JSON.stringify(selected));
console.log('3) after clear         ', JSON.stringify(cleared));
console.log('4) layers ON / OFF     ', JSON.stringify(layersOn), '/', JSON.stringify(layersOff));
console.log('5) palette open(out)=', openedA, ' closedByOutside=', closedByOutside, ' | open(esc)=', openedB, ' closedByEsc=', closedByEsc);

const checks = [
	['blank load: no layers',        blank.layers === false],
	['blank load: no inspector',     blank.inspector === false],
	['blank load: no style panel',   blank.style === false],
	['select mounts inspector',      selected.inspector === true],
	['select mounts style panel',    selected.style === true],
	['clear unmounts inspector',     cleared.inspector === false],
	['layers toggle ON mounts',      layersOn.layers === true],
	['layers toggle OFF unmounts',   layersOff.layers === false],
	['palette opened (outside test)',openedA === true],
	['palette closes on outside',    closedByOutside === true],
	['palette opened (esc test)',    openedB === true],
	['palette closes on Escape',     closedByEsc === true]
];
let pass = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (ok) pass++; }
console.log(`\nTOTAL: ${pass}/${checks.length} checks passed`);
ws.close(); chrome.kill();
process.exit(pass === checks.length ? 0 : 1);
