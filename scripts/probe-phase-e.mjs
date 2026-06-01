// Phase E probes: every new semantic type round-trips through commands.createAt + scene.get,
// the Markdown export contains a recognizable token per new type, and the unified icon field
// attaches via commands.patch onto a stat-card. Port 9235 (unique to Phase E).
//
// Mirrors `probe-icons.mjs` for boot/CDP plumbing and the per-field plucking required to read
// past Svelte's $state Proxy (CDP `returnByValue:true` serializes the proxy to `{}`).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9235;
const URL = 'http://localhost:1420/';

const chrome = spawn(CHROME, [
	'--headless',
	'--disable-gpu',
	'--no-sandbox',
	`--remote-debugging-port=${PORT}`,
	'--user-data-dir=/tmp/lf-phase-e',
	'--window-size=1440,900',
	URL
]);

async function disc() {
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(`http://localhost:${PORT}/json`);
			const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
			if (t) return t.webSocketDebuggerUrl;
		} catch {
			/* not up */
		}
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

// Boot wait + expose singleton + reset helper (matches probe-icons.mjs).
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
  const md = await import('/src/lib/export/to-markdown.ts');
  window.__compileToMarkdown = md.compileToMarkdown;
  window.__reset = () => {
    editor.scene.replaceDocument(createBlankDocument('PE'));
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

const NEW_TYPES = [
	'checkbox',
	'radio',
	'toggle',
	'slider',
	'dropdown',
	'stat-card',
	'badge',
	'progress',
	'avatar',
	'alert',
	'tooltip',
	'breadcrumb',
	'pagination',
	'stepper',
	'accordion',
	'section-header',
	'hero',
	'feature-grid',
	'testimonial',
	'cta-section'
];

// Per-type export token (case-insensitive regex). These match what
// `src/lib/export/to-markdown.ts` emits in Phase E.
const EXPORT_TOKENS = {
	checkbox: /checkbox/i,
	radio: /radio/i,
	toggle: /toggle/i,
	slider: /slider/i,
	dropdown: /select/i,
	'stat-card': /statcard/i,
	badge: /badge/i,
	progress: /progress/i,
	avatar: /avatar/i,
	alert: /alert/i,
	tooltip: /tooltip/i,
	breadcrumb: /breadcrumb/i,
	pagination: /pagination/i,
	stepper: /stepper/i,
	accordion: /accordion/i,
	// Multi-word types may appear as the dashed semantic id (containers' `### header` line) OR as
	// the PascalCase descriptor (leaf bullets like `SectionHeader`, `FeatureGrid`). Accept either.
	'section-header': /section-header|sectionheader/i,
	hero: /hero/i,
	'feature-grid': /feature-grid|featuregrid/i,
	testimonial: /testimonial/i,
	'cta-section': /cta-section|ctasection/i
};

// --- Probe A: createAt round-trip for every new semantic type ----------------------------------
// Drop each type at a non-overlapping world position so auto-parenting into a hero/accordion
// already created in this loop doesn't kick in (the canvas is large enough to spread 20 items).
let aThrew = false;
let aMismatches = [];
try {
	await ev(`(() => { window.__reset();
    const e = window.__e;
    const ids = {};
    const types = ${JSON.stringify(NEW_TYPES)};
    types.forEach((t, i) => {
      // Spread so containers (hero/accordion/feature-grid) created early don't swallow later drops.
      const x = -4000 + i * 220;
      const y = -4000 + i * 40;
      const id = e.commands.createAt(t, { x, y });
      ids[t] = id;
    });
    window.__createdIds = ids;
    window.__readTypes = {};
    for (const [t, id] of Object.entries(ids)) {
      const el = e.scene.get(id);
      window.__readTypes[t] = el?.type ?? null;
    }
  })()`);
} catch (err) {
	aThrew = true;
	console.log('FAIL  A: createAt threw — ' + err.message);
	fail++;
}
if (!aThrew) {
	const readTypes = await ev('window.__readTypes');
	for (const t of NEW_TYPES) {
		if (readTypes?.[t] !== t) aMismatches.push(`${t}→${readTypes?.[t] ?? 'null'}`);
	}
	check(
		'A: createAt round-trips every new semantic type',
		aMismatches.length === 0,
		aMismatches.length ? `mismatches: ${aMismatches.join(', ')}` : `${NEW_TYPES.length} types ok`
	);
}

// --- Probe B: Markdown export contains a recognizable token per new type -----------------------
// Reuse the doc from Probe A so we know each type is present. `$state.snapshot` is a Svelte
// compiler macro (only inside .svelte/.svelte.ts modules), so from a raw browser eval we strip
// the Proxy via JSON round-trip — the doc graph is plain JSON-serializable by design.
const markdown = await ev(`(() => {
  const e = window.__e;
  const snap = JSON.parse(JSON.stringify(e.scene.doc));
  return window.__compileToMarkdown(snap);
})()`);

const missingTokens = [];
if (typeof markdown !== 'string' || markdown.length === 0) {
	check('B: compileToMarkdown returned a non-empty string', false, `len=${markdown?.length}`);
} else {
	check('B: compileToMarkdown returned a non-empty string', true, `len=${markdown.length}`);
	for (const t of NEW_TYPES) {
		const re = EXPORT_TOKENS[t];
		if (!re.test(markdown)) missingTokens.push(t);
	}
	check(
		'B: every new semantic type emits a recognizable token in the Markdown export',
		missingTokens.length === 0,
		missingTokens.length ? `missing: ${missingTokens.join(', ')}` : `${NEW_TYPES.length} tokens ok`
	);
}

// --- Probe C: unified icon attaches to a stat-card via commands.patch --------------------------
// Pluck primitive fields individually — CDP `returnByValue:true` flattens Svelte $state Proxies
// to `{}` (see probe-icons.mjs for the canonical example).
await ev(`(() => { window.__reset();
  const e = window.__e;
  const sid = e.commands.createAt('stat-card', { x: 100, y: 100 });
  window.__statId = sid;
  e.commands.patch(sid, { icon: { name: 'ph:trending-up', svgPath: 'M0 0', viewBox: '0 0 256 256' } }, 'Attach icon');
  const el = e.scene.get(sid);
  window.__statIconName = el?.icon?.name;
  window.__statIconSvgPath = el?.icon?.svgPath;
  window.__statIconViewBox = el?.icon?.viewBox;
})()`);
const statIconName = await ev('window.__statIconName');
const statIconSvgPath = await ev('window.__statIconSvgPath');
const statIconViewBox = await ev('window.__statIconViewBox');
check(
	'C: commands.patch attaches an IconRef onto a stat-card',
	statIconName === 'ph:trending-up' &&
		statIconSvgPath === 'M0 0' &&
		statIconViewBox === '0 0 256 256',
	`name=${statIconName} svgPath=${statIconSvgPath} viewBox=${statIconViewBox}`
);

console.log(`\nTOTAL: ${pass}/${pass + fail} checks passed`);
chrome.kill();
process.exit(fail === 0 ? 0 : 1);
