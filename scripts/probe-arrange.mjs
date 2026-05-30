// Proves the newly-ported Excalidraw arrangement functions through the REAL UI:
//  - align left/right via real clicks on the RightPanel align buttons
//  - distribute horizontally via the real Distribute H button
//  - flip horizontal via the real Flip H button AND via the ⇧H keybinding
//  - lock toggle via the real button
//  - copy/paste styles via the ⌘⌥C / ⌘⌥V keybindings
// All assertions read the actual scene state after the real interaction.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9270, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-arr', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : undefined; };
for (let i = 0; i < 60; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

async function clickAria(label) {
	// Scroll the button into view first (a real user scrolls the inspector), then click its center.
	const r = await ev(`(() => {
		const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(label)} || x.getAttribute('title') === ${JSON.stringify(label)});
		if (!b) return null;
		b.scrollIntoView({ block: 'center' });
		const rr = b.getBoundingClientRect();
		return { x: Math.round(rr.left + rr.width/2), y: Math.round(rr.top + rr.height/2) };
	})()`);
	if (!r) return false;
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
	await sleep(120);
	return true;
}
async function key(k, { shift = false, meta = false, alt = false } = {}) {
	const mods = (shift ? 8 : 0) | (meta ? 4 : 0) | (alt ? 1 : 0);
	await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: 'Key' + k.toUpperCase(), modifiers: mods });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'Key' + k.toUpperCase(), modifiers: mods });
	await sleep(120);
}

// Helper: rebuild a fresh scene with N cards at given positions, select them all.
async function scene(cards) {
	return ev(`(() => {
		const e = window.__e;
		const { createBlankDocument } = window.__defaults;
		e.scene.replaceDocument(createBlankDocument('arr')); e.history.reset(e.scene.doc);
		const c = document.querySelector('canvas').getBoundingClientRect();
		e.camera.setViewport(c.width, c.height); e.camera.zoom = 1; e.camera.panX = 0; e.camera.panY = 0;
		const ids = ${JSON.stringify(cards)}.map(p => e.commands.createAt('card', { x: p[0], y: p[1], width: p[2]||100, height: p[3]||60 }));
		e.scene.select(ids); e.gestureActive = false;
		window.__ids = ids;
		return ids;
	})()`);
}
const boxes = () => ev(`window.__ids.map(id => { const el = window.__e.scene.get(id); return { x: Math.round(el.x), r: Math.round(el.x+el.width) }; })`);
await ev(`(async () => { window.__e = (await import('/src/lib/canvas/editor.svelte.ts')).editor; window.__defaults = await import('/src/lib/elements/defaults.ts'); })()`);

const results = [];

// 1) ALIGN LEFT via real RightPanel button.
await scene([[0,0],[200,100],[500,300]]);
await clickAria('Align left');
const al = await boxes();
results.push(['align left (real button) → all x===0', al.every(b => b.x === 0)]);

// 2) ALIGN RIGHT via real button. cards right edges should all match selection max.
await scene([[0,0],[200,100],[500,300]]); // rights: 100,300,600 → max 600
await clickAria('Align right');
const ar = await boxes();
results.push(['align right (real button) → all right===600', ar.every(b => b.r === 600)]);

// 3) DISTRIBUTE H via real button (3 cards). gaps equal.
await scene([[0,0],[120,0],[500,0]]);
await clickAria('Distribute horizontally');
const dh = await boxes();
const gaps = [dh[1].x - dh[0].r, dh[2].x - dh[1].r];
results.push(['distribute H (real button) → equal gaps', gaps[0] === gaps[1]]);

// 4) FLIP H via real button — positions mirror about center.
await scene([[0,0],[400,0]]); // center 250
await clickAria('Flip horizontal (⇧H)');
const fb = await boxes();
results.push(['flip H (real button) → x swapped (400,0)', fb[0].x === 400 && fb[1].x === 0]);

// 5) FLIP H via ⇧H keybinding — flip back to (0,400). Canvas must have focus.
await ev(`document.querySelector('canvas').focus()`);
await key('h', { shift: true });
const fk = await boxes();
results.push(['flip H (⇧H key) → flipped back (0,400)', fk[0].x === 0 && fk[1].x === 400]);

// 6) LOCK via real button.
await scene([[10,10]]);
await ev(`window.__e.scene.selectOne(window.__ids[0]); window.__e.gestureActive=false;`);
await sleep(100);
await clickAria('Lock / unlock (⌘⇧L)');
const locked = await ev(`!!window.__e.scene.get(window.__ids[0]).locked`);
results.push(['lock (real button) → locked===true', locked === true]);

// 7) COPY/PASTE STYLES via ⌘⌥C / ⌘⌥V keybindings.
await scene([[0,0],[300,0]]);
await ev(`(() => { const e = window.__e; e.scene.selectOne(window.__ids[0]); e.gestureActive=false; e.commands.setStyleOnSelection({ stroke: '#e03131', fill: '#ffc9c9' }, 'set'); })()`);
await sleep(100);
await ev(`document.querySelector('canvas').focus()`);
await key('c', { meta: true, alt: true }); // copy styles from card 0
await ev(`window.__e.scene.selectOne(window.__ids[1]); window.__e.gestureActive=false;`);
await sleep(100);
await ev(`document.querySelector('canvas').focus()`);
await key('v', { meta: true, alt: true }); // paste styles to card 1
const pasted = await ev(`(() => { const s = window.__e.scene.get(window.__ids[1]).style; return { stroke: s?.stroke, fill: s?.fill }; })()`);
results.push(['copy/paste styles (⌘⌥C/⌘⌥V) → stroke+fill copied', pasted.stroke === '#e03131' && pasted.fill === '#ffc9c9']);

let pass = 0;
for (const [name, ok] of results) { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (ok) pass++; }
console.log(`\nTOTAL: ${pass}/${results.length} checks passed`);
ws.close(); chrome.kill();
process.exit(pass === results.length ? 0 : 1);
