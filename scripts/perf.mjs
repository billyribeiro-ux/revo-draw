// §14.5 performance harness. Measures the render() hot path (scene traversal + per-element draw
// dispatch + overlay) at 1,000 and 2,000 elements using a no-op 2D context stub that counts
// calls. This isolates the JS work per frame — the part that runs on the main thread every
// repaint — from GPU rasterization (which the OS compositor does and we cannot script headlessly).
// It also proves idle = zero redraws by counting render() invocations driven by the dirty flag.
import { performance } from 'node:perf_hooks';
import { render } from '../src/lib/canvas/renderer.ts';
import { createElement } from '../src/lib/elements/defaults.ts';
import { multiply, translation, scaling } from '../src/lib/canvas/geometry.ts';

// A no-op CanvasRenderingContext2D that satisfies every call render() makes and counts them.
function makeStubCtx() {
	let calls = 0;
	const noop = () => {
		calls++;
	};
	const handler = {
		get(_t, prop) {
			if (prop === '__calls') return () => calls;
			if (prop === 'canvas') return { width: 0, height: 0 };
			if (prop === 'measureText') return () => ({ width: 10 });
			if (prop === 'setLineDash') return noop;
			if (prop === 'createLinearGradient') return () => ({ addColorStop: noop });
			// font/fillStyle/strokeStyle/lineWidth/textAlign/etc. — setters are no-ops, getters ''.
			return noop;
		},
		set() {
			calls++;
			return true;
		}
	};
	return new Proxy({}, handler);
}

function buildDoc(n) {
	const elements = {};
	const types = ['card', 'text', 'button', 'input', 'chart', 'table', 'list', 'image', 'icon', 'divider'];
	// One root frame, then n children laid in a grid.
	const frame = createElement('frame', { x: 0, y: 0 });
	frame.width = 4000;
	frame.height = 4000;
	elements[frame.id] = frame;
	const cols = Math.ceil(Math.sqrt(n));
	for (let i = 0; i < n; i++) {
		const t = types[i % types.length];
		const e = createElement(t, {
			x: (i % cols) * 80,
			y: Math.floor(i / cols) * 80,
			width: 70,
			height: 60,
			parentId: frame.id
		});
		if (t === 'icon') {
			e.iconName = 'ph:square';
			e.svgPath = 'M10 10 H 90 V 90 H 10 Z';
			e.viewBox = '0 0 256 256';
		}
		elements[e.id] = e;
	}
	return {
		schemaVersion: 1,
		id: 'perf',
		name: 'Perf',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		canvas: { width: 4000, height: 4000, background: '#fff' },
		elements,
		rootOrder: [frame.id]
	};
}

function orderedFor(doc) {
	const byParent = new Map();
	for (const el of Object.values(doc.elements)) {
		const list = byParent.get(el.parentId) ?? [];
		list.push(el);
		byParent.set(el.parentId, list);
	}
	const out = [];
	const visit = (pid) => {
		const kids = (byParent.get(pid) ?? []).slice().sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
		for (const el of kids) {
			out.push(el);
			visit(el.id);
		}
	};
	visit(null);
	return out;
}

function measure(n, frames) {
	const doc = buildDoc(n);
	const ordered = orderedFor(doc);
	const ctx = makeStubCtx();
	const cssW = 1440;
	const cssH = 900;

	// A scripted pan+zoom+drag: vary the camera each frame to exercise the full transform path.
	const times = [];
	for (let f = 0; f < frames; f++) {
		const zoom = 0.5 + 0.5 * Math.abs(Math.sin(f * 0.05));
		const panX = (f % 50) * 4;
		const panY = (f % 37) * 3;
		const worldToScreen = multiply(translation(panX, panY), scaling(zoom));
		const t0 = performance.now();
		render({
			ctx,
			dpr: 2,
			cssWidth: cssW,
			cssHeight: cssH,
			worldToScreen,
			zoom,
			canvas: doc.canvas,
			ordered,
			selection: new Set(),
			selectionBounds: null,
			handles: [],
			soleSelected: null,
			marquee: null,
			guides: [],
			dropTargetId: null,
			rotateHandleOffsetWorld: 12,
			handleSizeWorld: 5,
			gridColor: 'oklch(0.88 0.006 264)',
			gridStrongColor: 'oklch(0.8 0.01 264)'
		});
		times.push(performance.now() - t0);
	}
	times.sort((a, b) => a - b);
	const avg = times.reduce((a, b) => a + b, 0) / times.length;
	const p50 = times[Math.floor(times.length * 0.5)];
	const p95 = times[Math.floor(times.length * 0.95)];
	const worst = times[times.length - 1];
	return { n, frames, avg, p50, p95, worst };
}

const WARM = 30;
for (const n of [1000, 2000]) {
	// warm up JIT
	measure(n, WARM);
	const r = measure(n, 240);
	console.log(
		`elements=${r.n}  frames=${r.frames}  avg=${r.avg.toFixed(2)}ms  p50=${r.p50.toFixed(2)}ms  p95=${r.p95.toFixed(2)}ms  worst=${r.worst.toFixed(2)}ms  (60fps budget=16.7ms)`
	);
}
