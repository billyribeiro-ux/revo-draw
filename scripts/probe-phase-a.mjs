// Smoke probes for Phase A Excalidraw-parity additions: hyperlink (⌘K), grid toggle (⌘'),
// eraser tool (E + drag-delete), group/ungroup (⌘G / ⌘⇧G). Real CDP against the dev app.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9233;
const URL = 'http://localhost:1420/';

const chrome = spawn(CHROME, [
	'--headless', '--disable-gpu', '--no-sandbox',
	`--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-phase-a', '--window-size=1440,900', URL
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
	return r.result?.value;
};
const wait = (ms) => sleep(ms);

// Wait for the editor to boot, then expose the singleton + reset helper (same shape as e2e.mjs).
let booted = false;
for (let i = 0; i < 60; i++) {
	const ok = await ev(`(async () => { try { await import('/src/lib/canvas/editor.svelte.ts'); return !!document.querySelector('canvas'); } catch { return false; } })()`).catch(() => false);
	if (ok) { booted = true; break; }
	await wait(300);
}
if (!booted) { console.log('FAIL: app did not boot'); chrome.kill(); process.exit(1); }
await ev(`(async () => {
  const { editor } = await import('/src/lib/canvas/editor.svelte.ts');
  window.__e = editor;
  const { createBlankDocument } = await import('/src/lib/elements/defaults.ts');
  window.__reset = () => {
    editor.scene.replaceDocument(createBlankDocument('PA'));
    editor.history.reset(editor.scene.doc);
    editor.setTool('select');
    const c = document.querySelector('canvas').getBoundingClientRect();
    editor.camera.setViewport(c.width, c.height);
    editor.camera.zoom = 1; editor.camera.panX = 0; editor.camera.panY = 0;
  };
})()`);

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
	if (cond) { pass++; console.log(`PASS  ${name}${detail ? '  — ' + detail : ''}`); }
	else { fail++; console.log(`FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
}

// --- Phase A.1: hyperlink field round-trips through commands.patch ---
await ev(`(() => { window.__reset();
  const e = window.__e;
  const id = e.commands.createAt('card', { x: 50, y: 50, width: 100, height: 80 });
  e.commands.patch(id, { url: 'https://example.com' }, 'Set link');
  window.__r = e.scene.get(id);
})()`);
const urlSet = await ev('window.__r.url');
check('hyperlink: url field round-trips through patch()', urlSet === 'https://example.com', `url="${urlSet}"`);

// --- Phase A.2: grid toggle flips the editor flag ---
await ev('window.__e.gridVisible = true');
const before = await ev('window.__e.gridVisible');
await ev('window.__e.gridVisible = !window.__e.gridVisible');
const after = await ev('window.__e.gridVisible');
check('grid toggle: flips gridVisible', before === true && after === false, `before=${before} after=${after}`);

// --- Phase A.3: eraser tool removes element on pointer-down ---
await ev(`(() => { window.__reset();
  const e = window.__e;
  e.commands.createAt('card', { x: 100, y: 100, width: 200, height: 100 });
  e.commands.createAt('card', { x: 400, y: 100, width: 200, height: 100 });
  e.setTool('eraser');
  e.pointerDown({ x: 150, y: 130 }, { shift: false, alt: false, space: false, middle: false });
  e.pointerUp();
})()`);
const aliveAfterErase = await ev('Object.values(window.__e.scene.doc.elements).length');
check('eraser: pointer-down on a card removes it', aliveAfterErase === 1, `remaining=${aliveAfterErase}`);

// --- Phase A.3b: eraser drag-stroke removes multiple as ONE undo entry ---
await ev(`(() => { window.__reset();
  const e = window.__e;
  e.commands.createAt('card', { x: 100, y: 100, width: 100, height: 100 });
  e.commands.createAt('card', { x: 250, y: 100, width: 100, height: 100 });
  e.commands.createAt('card', { x: 400, y: 100, width: 100, height: 100 });
  e.setTool('eraser');
  const depthBefore = e.history.depth ?? e.history['#past']?.length ?? 0;
  e.pointerDown({ x: 130, y: 150 }, { shift: false, alt: false, space: false, middle: false });
  e.pointerMove({ x: 280, y: 150 }, { alt: false, shift: false });
  e.pointerMove({ x: 430, y: 150 }, { alt: false, shift: false });
  e.pointerUp();
  window.__alive = Object.values(e.scene.doc.elements).length;
})()`);
const aliveAfterStroke = await ev('window.__alive');
check('eraser: drag-stroke deletes everything under the path', aliveAfterStroke === 0, `remaining=${aliveAfterStroke}`);
// Undo should restore all three (one entry per gesture).
await ev('window.__e.history.undo()');
const aliveAfterUndo = await ev('Object.values(window.__e.scene.doc.elements).length');
check('eraser: single undo restores the whole stroke', aliveAfterUndo === 3, `remaining=${aliveAfterUndo}`);

// --- Phase A.4: group wraps selection in a new container ---
await ev(`(() => { window.__reset();
  const e = window.__e;
  const a = e.commands.createAt('card', { x: 100, y: 100, width: 100, height: 100 });
  const b = e.commands.createAt('card', { x: 250, y: 100, width: 100, height: 100 });
  e.scene.select([a, b]);
  e.commands.group();
})()`);
const groupResult = await ev(`(() => {
  const e = window.__e;
  const all = Object.values(e.scene.doc.elements);
  const containers = all.filter((x) => x.type === 'container');
  const containerId = containers[0]?.id;
  const kidsOfContainer = all.filter((x) => x.parentId === containerId).length;
  const selSize = e.scene.selection.size;
  const selIsContainer = containerId && e.scene.selection.has(containerId);
  return { totalEls: all.length, containerCount: containers.length, kidsOfContainer, selSize, selIsContainer };
})()`);
check(
	'group: wraps selection in one container with both children',
	groupResult.totalEls === 3 && groupResult.containerCount === 1 && groupResult.kidsOfContainer === 2 && groupResult.selSize === 1 && groupResult.selIsContainer,
	JSON.stringify(groupResult)
);

// --- Phase A.4b: ungroup dissolves the container ---
await ev('window.__e.commands.ungroup()');
const ungroupResult = await ev(`(() => {
  const e = window.__e;
  const all = Object.values(e.scene.doc.elements);
  const containers = all.filter((x) => x.type === 'container');
  const selSize = e.scene.selection.size;
  return { totalEls: all.length, containerCount: containers.length, selSize };
})()`);
check(
	'ungroup: removes the container and reselects its former children',
	ungroupResult.totalEls === 2 && ungroupResult.containerCount === 0 && ungroupResult.selSize === 2,
	JSON.stringify(ungroupResult)
);

console.log(`\nTOTAL: ${pass}/${pass + fail} checks passed`);
chrome.kill();
process.exit(fail === 0 ? 0 : 1);
