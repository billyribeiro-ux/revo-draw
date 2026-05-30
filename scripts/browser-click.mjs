// Drives the running dev server (http://localhost:1420) in headless Chrome via the DevTools
// Protocol: selects the Card tool, dispatches a real pointerdown/up at a known screen point on the
// canvas, then reads back the created element's world coords from the live editor singleton.
// Proves "draw lands where you click" end-to-end in a browser. No test framework — raw CDP.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const URL = 'http://localhost:1420/';

const chrome = spawn(CHROME, [
	'--headless',
	'--disable-gpu',
	'--no-sandbox',
	`--remote-debugging-port=${PORT}`,
	'--user-data-dir=/tmp/lf-cdp-profile',
	'--window-size=1440,900',
	URL
]);

async function cdp() {
	// Discover the page target's websocket debugger URL.
	for (let i = 0; i < 40; i++) {
		try {
			const res = await fetch(`http://localhost:${PORT}/json`);
			const targets = await res.json();
			const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
			if (page) return page.webSocketDebuggerUrl;
		} catch {
			/* not up yet */
		}
		await sleep(250);
	}
	throw new Error('Chrome CDP not reachable');
}

async function main() {
	const wsUrl = await cdp();
	const ws = new WebSocket(wsUrl);
	let id = 0;
	const pending = new Map();
	const send = (method, params = {}) =>
		new Promise((resolve) => {
			const mid = ++id;
			pending.set(mid, resolve);
			ws.send(JSON.stringify({ id: mid, method, params }));
		});
	await new Promise((r) => (ws.onopen = r));
	ws.onmessage = (m) => {
		const msg = JSON.parse(m.data.toString());
		if (msg.id && pending.has(msg.id)) {
			pending.get(msg.id)(msg.result);
			pending.delete(msg.id);
		}
	};

	await send('Runtime.enable');
	await send('Page.enable');
	// Wait for the editor singleton to be importable on the page.
	await sleep(2500);

	const evalExpr = async (expr) => {
		const r = await send('Runtime.evaluate', {
			expression: expr,
			awaitPromise: true,
			returnByValue: true
		});
		if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
		return r.result.value;
	};

	// Expose the editor on window for the driver (the app does not normally, so import it).
	const setup = await evalExpr(`
		(async () => {
			const mod = await import('/src/lib/canvas/editor.svelte.ts');
			window.__editor = mod.editor;
			const e = window.__editor;
			// Make the camera deterministic for the assertion.
			e.camera.setViewport(1440, 854);
			e.camera.zoom = 1; e.camera.panX = 0; e.camera.panY = 0;
			e.setTool('card');
			const before = Object.keys(e.scene.doc.elements).length;
			return { before, tool: e.tool, zoom: e.camera.zoom };
		})()
	`);

	// Dispatch a real click at canvas screen point (600, 400).
	const canvasBox = await evalExpr(`
		(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
			return { x: r.left, y: r.top, w: r.width, h: r.height }; })()
	`);
	const sx = Math.round(canvasBox.x + 600);
	const sy = Math.round(canvasBox.y + 300);

	for (const type of ['mousePressed', 'mouseReleased']) {
		await send('Input.dispatchMouseEvent', {
			type,
			x: sx,
			y: sy,
			button: 'left',
			clickCount: 1,
			buttons: type === 'mousePressed' ? 1 : 0
		});
		await sleep(40);
	}

	const after = await evalExpr(`
		(() => {
			const e = window.__editor;
			const els = Object.values(e.scene.doc.elements);
			const created = els.find(el => el.type === 'card');
			// world point under the click (canvas-local 600,300 → world)
			const c = document.querySelector('canvas').getBoundingClientRect();
			const world = e.camera.toWorld({ x: 600, y: 300 });
			return {
				count: els.length,
				createdType: created?.type ?? null,
				cx: created ? created.x + created.width/2 : null,
				cy: created ? created.y + created.height/2 : null,
				worldX: world.x, worldY: world.y
			};
		})()
	`);

	console.log('SETUP:', JSON.stringify(setup));
	console.log('CANVAS rect:', JSON.stringify(canvasBox), 'clicked screen', sx, sy);
	console.log('AFTER:', JSON.stringify(after));
	if (after.createdType === 'card') {
		const dx = Math.abs(after.cx - after.worldX);
		const dy = Math.abs(after.cy - after.worldY);
		console.log(`DELTA center-vs-clickWorld: dx=${dx.toFixed(2)} dy=${dy.toFixed(2)}`);
		console.log(dx < 1 && dy < 1 ? 'RESULT: PASS — element created centered on click' : 'RESULT: FAIL — off by >1px');
	} else {
		console.log('RESULT: FAIL — no card created');
	}
	ws.close();
	chrome.kill();
}

main().catch((e) => {
	console.error('DRIVER ERROR:', e.message);
	chrome.kill();
	process.exit(1);
});
