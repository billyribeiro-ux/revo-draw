// Phase F probes: icon attach/remove via commands.patch, undo restoration, SvgElement
// creation/read-back, and a best-effort drag-from-IconPicker simulation. Port 9234 (unique).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9234;
const URL = 'http://localhost:1420/';

const chrome = spawn(CHROME, [
	'--headless', '--disable-gpu', '--no-sandbox',
	`--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-phase-f', '--window-size=1440,900', URL
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
const send = (m, pr = {}) =>
	new Promise((r) => {
		const i = ++id;
		pending.set(i, r);
		ws.send(JSON.stringify({ id: i, method: m, params: pr }));
	});
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
	const m = JSON.parse(e.data.toString());
	if (m.id && pending.has(m.id)) {
		pending.get(m.id)(m.result);
		pending.delete(m.id);
	}
};
await send('Runtime.enable');
await send('Page.enable');

const ev = async (x) => {
	const r = await send('Runtime.evaluate', {
		expression: x,
		awaitPromise: true,
		returnByValue: true
	});
	if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
	return r.result?.value;
};
const wait = (ms) => sleep(ms);

// Boot wait + expose singleton + reset helper (matches probe-phase-a.mjs)
let booted = false;
for (let i = 0; i < 60; i++) {
	const ok = await ev(
		`(async () => { try { await import('/src/lib/canvas/editor.svelte.ts'); return !!document.querySelector('canvas'); } catch { return false; } })()`
	).catch(() => false);
	if (ok) {
		booted = true;
		break;
	}
	await wait(300);
}
if (!booted) {
	console.log('FAIL: app did not boot');
	chrome.kill();
	process.exit(1);
}
await ev(`(async () => {
  const { editor } = await import('/src/lib/canvas/editor.svelte.ts');
  window.__e = editor;
  const { createBlankDocument } = await import('/src/lib/elements/defaults.ts');
  window.__reset = () => {
    editor.scene.replaceDocument(createBlankDocument('PF'));
    editor.history.reset(editor.scene.doc);
    editor.setTool('select');
    const c = document.querySelector('canvas').getBoundingClientRect();
    editor.camera.setViewport(c.width, c.height);
    editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0;
  };
})()`);

let pass = 0,
	fail = 0;
function check(name, cond, detail = '') {
	if (cond) {
		pass++;
		console.log(`PASS  ${name}${detail ? '  — ' + detail : ''}`);
	} else {
		fail++;
		console.log(`FAIL  ${name}${detail ? '  — ' + detail : ''}`);
	}
}

// --- Probe A: attach an icon via commands.patch -------------------------------------------------
// Pluck the icon's primitive fields individually rather than storing the whole proxy on window —
// CDP `returnByValue:true` serializes Svelte $state Proxy objects to `{}`, so a structural copy
// (or per-field read) is required to see the actual data.
await ev(`(() => { window.__reset();
  const e = window.__e;
  const cardId = e.commands.createAt('card', { x: 100, y: 100, width: 200, height: 120 });
  window.__cardId = cardId;
  e.commands.patch(cardId, { icon: { name: 'ph:trending-up', svgPath: 'M0 0L1 1', viewBox: '0 0 256 256' } }, 'Attach icon');
  const el = e.scene.get(cardId);
  window.__attachedName = el?.icon?.name;
  window.__attachedSvgPath = el?.icon?.svgPath;
  window.__attachedViewBox = el?.icon?.viewBox;
})()`);
const attachedName = await ev('window.__attachedName');
const attachedSvgPath = await ev('window.__attachedSvgPath');
const attachedViewBox = await ev('window.__attachedViewBox');
check(
	'A: commands.patch attaches an IconRef onto an element',
	attachedName === 'ph:trending-up' &&
		attachedSvgPath === 'M0 0L1 1' &&
		attachedViewBox === '0 0 256 256',
	`name=${attachedName} svgPath=${attachedSvgPath} viewBox=${attachedViewBox}`
);

// --- Probe B: remove the icon via commands.patch({ icon: undefined }) ---------------------------
await ev(`(() => {
  const e = window.__e;
  e.commands.patch(window.__cardId, { icon: undefined }, 'Remove icon');
  window.__afterRemove = e.scene.get(window.__cardId).icon;
})()`);
const afterRemove = await ev('window.__afterRemove');
check(
	'B: commands.patch({ icon: undefined }) clears the icon',
	afterRemove === undefined || afterRemove === null,
	`icon=${JSON.stringify(afterRemove)}`
);

// --- Probe C: re-attach, then undo restores the prior (undefined) state -------------------------
await ev(`(() => {
  const e = window.__e;
  // Re-attach so we have something to undo
  e.commands.patch(window.__cardId, { icon: { name: 'ph:gear', svgPath: 'M2 2', viewBox: '0 0 256 256' } }, 'Attach icon');
  window.__beforeUndoName = e.scene.get(window.__cardId)?.icon?.name;
  e.history.undo();
  window.__afterUndoName = e.scene.get(window.__cardId)?.icon?.name;
})()`);
const beforeUndoName = await ev('window.__beforeUndoName');
const afterUndoName = await ev('window.__afterUndoName');
check(
	'C: undo of an attach restores the prior (icon-less) state',
	beforeUndoName === 'ph:gear' && (afterUndoName === undefined || afterUndoName === null),
	`beforeUndo=${beforeUndoName} afterUndo=${afterUndoName}`
);

// --- Probe D: SvgElement creation + read-back ---------------------------------------------------
await ev(`(() => { window.__reset();
  const e = window.__e;
  const sid = e.commands.createAt('svg', {
    x: 100, y: 100, width: 100, height: 100,
    body: '<rect width="100" height="100" fill="red"/>',
    viewBox: '0 0 100 100'
  });
  window.__sid = sid;
  const el = e.scene.get(sid);
  window.__svgType = el?.type;
  window.__svgBody = el?.body;
  window.__svgViewBox = el?.viewBox;
})()`);
const svgType = await ev('window.__svgType');
const svgBody = await ev('window.__svgBody');
const svgViewBox = await ev('window.__svgViewBox');
check(
	'D: commands.createAt("svg", ...) produces a readable SvgElement',
	svgType === 'svg' &&
		svgBody === '<rect width="100" height="100" fill="red"/>' &&
		svgViewBox === '0 0 100 100',
	`type=${svgType} viewBox=${svgViewBox}`
);

// --- Probe E: drag-from-picker simulated (BEST EFFORT — see notes) ------------------------------
// HTML5 DnD via synthesized events is fragile in headless Chrome — the brief says: if this
// probe can't fire, mark as a known limitation and DO NOT fail the overall script.
let probeERan = false;
try {
	await ev(`(() => { window.__reset();
    const e = window.__e;
    const cardId = e.commands.createAt('card', { x: 200, y: 200, width: 200, height: 120 });
    window.__dropCardId = cardId;
  })()`);

	// Try to surface an icon cell in the DOM. The IconPicker is bound to a $state inside
	// +page.svelte which we can't flip from the outside without dispatching the open shortcut.
	// Dispatch a keyboard shortcut commonly bound to the icon picker; if it doesn't open we
	// skip gracefully.
	await ev(`(() => {
    // Best-effort: dispatch ⌘I (a plausible binding) — falls through if not bound.
    const ev = new KeyboardEvent('keydown', { key: 'i', code: 'KeyI', metaKey: true, bubbles: true });
    window.dispatchEvent(ev);
  })()`);
	await wait(200);

	const cell = await ev(
		`(() => {
      const sels = [
        '[data-icon-name]',
        '[data-icon]',
        '.icon-picker [draggable="true"]',
        '[draggable="true"][data-name]'
      ];
      for (const s of sels) { const el = document.querySelector(s); if (el) return s; }
      return null;
    })()`
	);

	if (!cell) {
		console.log('SKIP  E: drag-from-picker — IconPicker did not open / no icon cells in DOM (known limitation)');
	} else {
		probeERan = true;
		await ev(`(() => {
      const src = document.querySelector(${JSON.stringify(cell)});
      const canvas = document.querySelector('canvas');
      if (!src || !canvas) { window.__dragOk = false; return; }
      const r = canvas.getBoundingClientRect();
      const dt = new DataTransfer();
      const ds = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt });
      src.dispatchEvent(ds);
      const dragover = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 300, clientY: r.top + 260 });
      canvas.dispatchEvent(dragover);
      const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 300, clientY: r.top + 260 });
      canvas.dispatchEvent(drop);
      window.__dragOk = true;
    })()`);
		await wait(200);
		const droppedIcon = await ev('window.__e.scene.get(window.__dropCardId)?.icon');
		check(
			'E: drag-from-picker drop attaches icon to the card under the cursor',
			!!droppedIcon && typeof droppedIcon === 'object' && typeof droppedIcon.name === 'string',
			JSON.stringify(droppedIcon)
		);
	}
} catch (err) {
	console.log('SKIP  E: drag-from-picker — exception during synthesis (known limitation): ' + err.message);
}

if (!probeERan) {
	// Not counted as a failure — direct-patch probes A-D are the load-bearing checks.
}

console.log(`\nTOTAL: ${pass}/${pass + fail} checks passed`);
chrome.kill();
process.exit(fail === 0 ? 0 : 1);
