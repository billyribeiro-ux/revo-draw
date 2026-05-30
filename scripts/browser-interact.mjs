// End-to-end browser interaction proof via Chrome DevTools Protocol. Exercises the real event
// pipeline (no test-only shims): drag-create a card, then drag-move it, asserting world coords at
// each step. Proves the canvas behaves like Excalidraw — draw where you drag, move where you drag.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;
const URL = 'http://localhost:1420/';

const chrome = spawn(CHROME, [
	'--headless', '--disable-gpu', '--no-sandbox',
	`--remote-debugging-port=${PORT}`,
	'--user-data-dir=/tmp/lf-cdp2', '--window-size=1440,900', URL
]);

async function discover() {
	for (let i = 0; i < 40; i++) {
		try {
			const r = await fetch(`http://localhost:${PORT}/json`);
			const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
			if (t) return t.webSocketDebuggerUrl;
		} catch { /* not up */ }
		await sleep(250);
	}
	throw new Error('CDP not reachable');
}

async function main() {
	const ws = new WebSocket(await discover());
	let id = 0;
	const pending = new Map();
	const send = (method, params = {}) => new Promise((res) => { const m = ++id; pending.set(m, res); ws.send(JSON.stringify({ id: m, method, params })); });
	await new Promise((r) => (ws.onopen = r));
	ws.onmessage = (m) => { const msg = JSON.parse(m.data.toString()); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); } };
	await send('Runtime.enable');
	await send('Page.enable');
	await sleep(2500);

	const evalExpr = async (expr) => {
		const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
		if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
		return r.result.value;
	};

	// Deterministic camera, select card tool with lock so we can do multiple creates.
	await evalExpr(`(async () => {
		const { editor } = await import('/src/lib/canvas/editor.svelte.ts');
		window.__e = editor;
		editor.camera.setViewport(1440, 854);
		editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0;
		editor.scene.replaceDocument((await import('/src/lib/elements/defaults.ts')).createBlankDocument('Test'));
		editor.history.reset(editor.scene.doc);
		editor.setTool('card');
		return true;
	})()`);

	const box = await evalExpr(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);

	// Helper to dispatch a real mouse drag (down at A, moves, up at B), canvas-local coords.
	async function drag(ax, ay, bx, by) {
		const sx = Math.round(box.x + ax), sy = Math.round(box.y + ay);
		const ex = Math.round(box.x + bx), ey = Math.round(box.y + by);
		await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1 });
		await sleep(20);
		const steps = 6;
		for (let i = 1; i <= steps; i++) {
			await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(sx + (ex - sx) * i / steps), y: Math.round(sy + (ey - sy) * i / steps), button: 'left', buttons: 1 });
			await sleep(15);
		}
		await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ex, y: ey, button: 'left', buttons: 0, clickCount: 1 });
		await sleep(40);
	}

	// 1) DRAG-CREATE a card from (200,150) to (440,310) → should be ~240×160 at (200,150).
	await drag(200, 150, 440, 310);
	const created = await evalExpr(`(() => {
		const e = window.__e; const els = Object.values(e.scene.doc.elements).filter(x => x.type === 'card');
		const c = els[els.length - 1];
		return c ? { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height), id: c.id } : null;
	})()`);

	// 2) Switch to select, DRAG-MOVE the created card by (+120, +60).
	await evalExpr(`window.__e.setTool('select')`);
	// Grab the card at its current center and drag it.
	const moved = created
		? await (async () => {
				const cx = created.x + created.w / 2, cy = created.y + created.h / 2;
				await drag(cx, cy, cx + 120, cy + 60);
				return evalExpr(`(() => { const c = window.__e.scene.get(${JSON.stringify(created.id)}); return c ? { x: Math.round(c.x), y: Math.round(c.y) } : null; })()`);
			})()
		: null;

	console.log('CANVAS origin:', JSON.stringify(box));
	console.log('CREATED:', JSON.stringify(created));
	console.log('MOVED:', JSON.stringify(moved));

	let pass = true;
	const near = (a, b, t = 6) => Math.abs(a - b) <= t;
	if (!created) { pass = false; console.log('FAIL: no card created by drag'); }
	else {
		if (!(near(created.x, 200) && near(created.y, 150))) { pass = false; console.log('FAIL: created origin off'); }
		if (!(near(created.w, 240) && near(created.h, 160))) { pass = false; console.log('FAIL: created size off (expected ~240x160)'); }
	}
	if (created && moved) {
		if (!(near(moved.x, created.x + 120) && near(moved.y, created.y + 60))) { pass = false; console.log('FAIL: move delta off'); }
	} else if (created) { pass = false; console.log('FAIL: move did not apply'); }

	console.log(pass ? 'RESULT: PASS — drag-create + drag-move behave correctly' : 'RESULT: FAIL');
	ws.close(); chrome.kill();
	process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('DRIVER ERROR:', e.message); chrome.kill(); process.exit(1); });
