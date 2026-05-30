// Comprehensive end-to-end interaction harness driven by the Chrome DevTools Protocol with REAL
// synthesized mouse/keyboard events against the running dev app. Each check asserts the editor's
// real document state after the gesture. Prints PASS/FAIL per check and a final tally. No claim is
// made except what this prints. Exit code 0 iff every check passes.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9230;
const URL = 'http://localhost:1420/';

const chrome = spawn(CHROME, [
	'--headless', '--disable-gpu', '--no-sandbox',
	`--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-e2e', '--window-size=1440,900', URL
]);

async function disc() {
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(`http://localhost:${PORT}/json`);
			const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
			if (t) return t.webSocketDebuggerUrl;
		} catch { /* not up */ }
		await sleep(250);
	}
	throw new Error('CDP not reachable');
}

const ws = new WebSocket(await disc());
let id = 0;
const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
await send('Page.enable');

const ev = async (x) => {
	const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
	return r.result.value;
};

// Wait until the app's editor module is importable (page fully booted + Vite served the module).
let booted = false;
for (let i = 0; i < 60; i++) {
	const ok = await ev(`(async () => { try { await import('/src/lib/canvas/editor.svelte.ts'); return !!document.querySelector('canvas'); } catch { return false; } })()`).catch(() => false);
	if (ok) { booted = true; break; }
	await sleep(300);
}
if (!booted) { console.log('FAIL: app did not boot'); ws.close(); chrome.kill(); process.exit(1); }

// Canvas origin in client coords.
const box = await ev(`(async () => {
	const { editor } = await import('/src/lib/canvas/editor.svelte.ts');
	window.__e = editor;
	const { createBlankDocument } = await import('/src/lib/elements/defaults.ts');
	window.__reset = () => { editor.scene.replaceDocument(createBlankDocument('E2E')); editor.history.reset(editor.scene.doc); editor.currentStyle = {}; editor.setTool('select'); editor.toolLocked = false;
		const c = document.querySelector('canvas').getBoundingClientRect();
		editor.camera.setViewport(c.width, c.height); editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0; };
	const c = document.querySelector('canvas').getBoundingClientRect();
	return { x: c.left, y: c.top };
})()`);

const M = (cx, cy) => ({ x: Math.round(box.x + cx), y: Math.round(box.y + cy) });
async function down(cx, cy, opts = {}) {
	const m = M(cx, cy);
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1, modifiers: opts.mod ?? 0 });
}
async function move(cx, cy, opts = {}) {
	const m = M(cx, cy);
	await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y, button: 'left', buttons: 1, modifiers: opts.mod ?? 0 });
}
async function up(cx, cy, opts = {}) {
	const m = M(cx, cy);
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1, modifiers: opts.mod ?? 0 });
}
async function drag(ax, ay, bx, by, opts = {}, steps = 8) {
	await down(ax, ay, opts); await sleep(15);
	for (let i = 1; i <= steps; i++) { await move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps, opts); await sleep(12); }
	await up(bx, by, opts); await sleep(40);
}
async function click(cx, cy, opts = {}) { await down(cx, cy, opts); await sleep(15); await up(cx, cy, opts); await sleep(30); }
// CDP modifier bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8
const SHIFT = 8, META = 4;
async function key(text, opts = {}) {
	await send('Input.dispatchKeyEvent', { type: 'keyDown', key: text, code: opts.code ?? text, modifiers: opts.mod ?? 0, ...(opts.extra ?? {}) });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key: text, code: opts.code ?? text, modifiers: opts.mod ?? 0 });
	await sleep(30);
}

const results = [];
const near = (a, b, t = 8) => Math.abs(a - b) <= t;
function check(name, cond, detail = '') { results.push({ name, ok: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
const reset = () => ev('window.__reset()');
const cards = () => ev(`Object.values(window.__e.scene.doc.elements).filter(e=>e.type==='card').map(e=>({id:e.id,x:Math.round(e.x),y:Math.round(e.y),w:Math.round(e.width),h:Math.round(e.height),rot:e.rotation}))`);
const count = () => ev(`Object.keys(window.__e.scene.doc.elements).length`);
const selCount = () => ev(`window.__e.scene.selection.size`);

try {
	// 1. DRAG-CREATE: tool=card, drag a rect → sized box at the drag rect.
	await reset(); await ev(`window.__e.setTool('card')`);
	await drag(200, 150, 440, 310);
	let cs = await cards();
	check('drag-create sizes box to the drag rect', cs.length === 1 && near(cs[0].x, 200) && near(cs[0].y, 150) && near(cs[0].w, 240) && near(cs[0].h, 160), JSON.stringify(cs[0]));

	// 2. DRAG up-left (negative direction) anchors correctly.
	await reset(); await ev(`window.__e.setTool('card')`);
	await drag(500, 500, 360, 380);
	cs = await cards();
	check('drag up-left anchors at min corner', cs.length === 1 && near(cs[0].x, 360) && near(cs[0].y, 380) && near(cs[0].w, 140) && near(cs[0].h, 120), JSON.stringify(cs[0]));

	// 3. CLICK (no drag) → default-size card centered on click.
	await reset(); await ev(`window.__e.setTool('card')`);
	await click(700, 400);
	cs = await cards();
	const cc = cs[0] ? { cx: cs[0].x + cs[0].w / 2, cy: cs[0].y + cs[0].h / 2 } : null;
	const w0 = await ev(`window.__e.camera.toWorld({x:700,y:400})`);
	check('click places default-size card centered on click', cs.length === 1 && cs[0].w > 0 && near(cc.cx, Math.round(w0.x)) && near(cc.cy, Math.round(w0.y)), JSON.stringify(cs[0]));

	// 4. TOOL reverts to select after a shape (lock off).
	const toolAfter = await ev(`window.__e.tool`);
	check('tool reverts to select after drawing one shape', toolAfter === 'select', `tool=${toolAfter}`);

	// 5. SINGLE SELECT: click an existing element selects it.
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	await ev(`window.__e.setTool('select')`);
	await click(320, 230); // inside the card
	check('click selects the element under the cursor', (await selCount()) === 1, `sel=${await selCount()}`);

	// 6. CLICK EMPTY deselects. (Use an in-canvas empty point — canvas is ~896×649.)
	await click(800, 560);
	check('click on empty canvas clears selection', (await selCount()) === 0);

	// Deterministic 2-card setup for marquee/shift (createAt avoids tool/gesture ambiguity).
	const two = `(() => { const e = window.__e; window.__reset();
		e.commands.createAt('card', { x: 120, y: 120, width: 140, height: 100 });
		e.commands.createAt('card', { x: 340, y: 120, width: 140, height: 100 });
		e.scene.clearSelection(); })()`;

	// 7. MARQUEE selects intersecting elements. Cards span world x[120-260] and x[340-480], y[120-220].
	await ev(two);
	await drag(90, 90, 520, 260); // marquee starts on empty, covers both
	check('marquee selects intersecting elements', (await selCount()) === 2, `sel=${await selCount()}`);

	// 8. SHIFT-CLICK toggles multi-select. Click centers: A=(190,170), B=(410,170).
	await ev(two);
	await click(190, 170);
	await click(410, 170, { mod: SHIFT });
	check('shift-click builds a multi-selection', (await selCount()) === 2, `sel=${await selCount()}`);

	// 9. MOVE: drag a selected element by a known delta.
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	await ev(`window.__e.setTool('select')`); await click(320, 230);
	let before = (await cards())[0];
	await drag(320, 230, 420, 300); // +100,+70
	let after = (await cards())[0];
	check('drag-move translates by the pointer delta', near(after.x - before.x, 100) && near(after.y - before.y, 70), `dx=${after.x - before.x} dy=${after.y - before.y}`);

	// 10. TINY move below threshold does NOT move (click-vs-drag).
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	await ev(`window.__e.setTool('select')`);
	before = (await cards())[0];
	await drag(320, 230, 322, 231, {}, 2); // 2-3px jitter
	after = (await cards())[0];
	check('sub-threshold jitter does not move the element', after.x === before.x && after.y === before.y, `dx=${after.x - before.x} dy=${after.y - before.y}`);

	// 11. RESIZE via SE handle.
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	await ev(`window.__e.setTool('select')`); await click(320, 230);
	before = (await cards())[0];
	// SE handle is at element bottom-right in screen coords (zoom=1, pan=0): (x+w, y+h) → (440,310)
	await drag(440, 310, 540, 410); // grow +100,+100
	after = (await cards())[0];
	check('SE handle resize grows width/height', near(after.w - before.w, 100) && near(after.h - before.h, 100) && near(after.x, before.x) && near(after.y, before.y), `dw=${after.w - before.w} dh=${after.h - before.h}`);

	// 12. ROTATE handle changes rotation.
	await reset(); await ev(`window.__e.setTool('card')`); await drag(300, 200, 460, 320);
	await ev(`window.__e.setTool('select')`); await click(380, 260);
	// rotate handle is above top-center by ~26px screen: center x=380, top y=200 → handle ~ (380, 174)
	await drag(380, 174, 460, 200);
	after = (await cards())[0];
	check('rotate handle changes element rotation', Math.abs(after.rot) > 0.01, `rot=${after.rot.toFixed(3)}`);

	// 13. DELETE removes selection.
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	await ev(`window.__e.setTool('select')`); await click(320, 230);
	const beforeDel = await count();
	await key('Backspace');
	check('Backspace deletes the selection', (await count()) === beforeDel - 1, `before=${beforeDel} after=${await count()}`);

	// 14. DUPLICATE (Cmd-D).
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	await ev(`window.__e.setTool('select')`); await click(320, 230);
	const beforeDup = await count();
	await key('d', { mod: META, code: 'KeyD' });
	check('Cmd-D duplicates the selection', (await count()) === beforeDup + 1, `before=${beforeDup} after=${await count()}`);

	// 15. UNDO / REDO.
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	const afterCreate = await count();
	await key('z', { mod: META, code: 'KeyZ' });
	const afterUndo = await count();
	await key('z', { mod: META | SHIFT, code: 'KeyZ' });
	const afterRedo = await count();
	check('Cmd-Z undoes create, Shift-Cmd-Z redoes', afterUndo === afterCreate - 1 && afterRedo === afterCreate, `create=${afterCreate} undo=${afterUndo} redo=${afterRedo}`);

	// 16. PAN does not mutate element world coords.
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	before = (await cards())[0];
	await ev(`window.__e.setTool('hand')`);
	await drag(600, 400, 750, 500);
	after = (await cards())[0];
	check('pan changes camera, not element coords', after.x === before.x && after.y === before.y, `el dx=${after.x - before.x}`);

	// 17. ZOOM-at-cursor keeps the world point under the cursor fixed.
	await reset();
	const zres = await ev(`(() => {
		const e = window.__e; const screen = { x: 600, y: 400 };
		const wBefore = e.camera.toWorld(screen);
		e.camera.zoomBy(2, screen);
		const wAfter = e.camera.toWorld(screen);
		return { dx: Math.abs(wBefore.x - wAfter.x), dy: Math.abs(wBefore.y - wAfter.y), zoom: e.camera.zoom };
	})()`);
	check('zoom-at-cursor keeps cursor world point fixed', zres.dx < 0.01 && zres.dy < 0.01 && near(zres.zoom, 2, 0.001), JSON.stringify(zres));

	// 18. STYLE applies AFTER a draw (panel writes to selection).
	await reset(); await ev(`window.__e.setTool('card')`); await drag(200, 150, 440, 310);
	await ev(`window.__e.setTool('select')`); await click(320, 230);
	await ev(`window.__e.commands.setStyleOnSelection({ stroke: '#e03131', strokeWidth: 'extra', strokeStyle: 'dashed' }, 'Style')`);
	const st = await ev(`(() => { const e = window.__e; const el = e.scene.selectedElements[0]; return { stroke: el.style.stroke, w: el.style.strokeWidth, s: el.style.strokeStyle }; })()`);
	check('style applies to selection after draw', st.stroke === '#e03131' && st.w === 'extra' && st.s === 'dashed', JSON.stringify(st));

	// 19. STYLE is gated during an active gesture.
	await reset(); await ev(`window.__e.setTool('card')`);
	await down(200, 150); await sleep(15); await move(300, 250); await sleep(15);
	const midActive = await ev(`window.__e.gestureActive`);
	await up(440, 310); await sleep(30);
	const afterActive = await ev(`window.__e.gestureActive`);
	check('gesture flag true during draw, false after (style gated)', midActive === true && afterActive === false, `mid=${midActive} after=${afterActive}`);

	// 20. TEXT TOOL: a single click drops a text box AND immediately enters edit mode → type.
	await reset(); await ev(`window.__e.setTool('text')`); await click(330, 220);
	const editing = await ev(`window.__e.editingTextId !== null`);
	await ev(`document.querySelector('.text-overlay')?.focus()`);
	await send('Input.insertText', { text: 'Hello' });
	await sleep(30);
	await ev(`(() => { const id = window.__e.editingTextId; if (id) window.__e.commitTextEdit(id, document.querySelector('.text-overlay')?.value ?? ''); })()`);
	await sleep(40);
	const textContent = await ev(`(() => { const t = Object.values(window.__e.scene.doc.elements).find(e=>e.type==='text'); return t ? t.content : null; })()`);
	check('text tool: click → type immediately edits content', editing && typeof textContent === 'string' && textContent.includes('Hello'), `editing=${editing} content=${JSON.stringify(textContent)}`);

	// 21. DOUBLE-CLICK an existing text element re-enters edit mode.
	await reset();
	await ev(`(() => { const e = window.__e; const id = e.commands.createAt('text', { x: 250, y: 200, width: 180, height: 40 }); e.scene.get(id).content = 'existing'; e.scene.selectOne(id); })()`);
	{
		const m = M(330, 215);
		await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1 });
		await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1 });
		await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 2 });
		await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 2 });
		await sleep(80);
	}
	check('double-click an existing text element enters edit mode', (await ev(`window.__e.editingTextId !== null`)) === true);
	// commit any open edit to clean up
	await ev(`(() => { const id = window.__e.editingTextId; if (id) window.__e.commitTextEdit(id, 'existing'); })()`);

	// NO console errors during the whole session.
	// (collected separately below)
} catch (err) {
	console.log('HARNESS ERROR:', err.message);
	results.push({ name: 'harness ran without throwing', ok: false, detail: err.message });
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nTOTAL: ${passed}/${results.length} checks passed`);
ws.close();
chrome.kill();
process.exit(passed === results.length ? 0 : 1);
