import { describe, expect, it } from 'vitest';
import { Camera } from './camera.svelte.js';
import { SceneGraph } from './scene-graph.svelte.js';
import { Editor } from './editor.svelte.js';
import { hitTestPoint } from './hit-test.js';
import { createElement } from '../elements/defaults.js';
import type { Element } from '../elements/types.js';
import type { Vec2 as V } from './geometry.js';

/**
 * geometry.md diagnostic — proves the coordinate-system contract end to end.
 * STEP 3 invariants: round-trip, click-locates-element, drag-identity, pan/zoom-doesn't-mutate.
 */

const POINTS: V[] = [];
for (const x of [-500, -1, 0, 1, 37.5, 800, 4000]) {
	for (const y of [-300, 0, 0.25, 123, 900, 3000]) POINTS.push({ x, y });
}
const STATES = [
	{ zoom: 1, panX: 0, panY: 0 },
	{ zoom: 0.05, panX: -1234, panY: 567 },
	{ zoom: 0.5, panX: 100, panY: -50 },
	{ zoom: 2, panX: -2000, panY: 333 },
	{ zoom: 8, panX: 9999, panY: -8888 },
	{ zoom: 1.333, panX: 0.5, panY: -0.5 }
];

describe('geometry contract — transform round-trip', () => {
	it('screenToWorld(worldToScreen(p)) ≈ p and inverse, for every point × camera state', () => {
		const cam = new Camera();
		for (const s of STATES) {
			cam.zoom = s.zoom;
			cam.panX = s.panX;
			cam.panY = s.panY;
			for (const p of POINTS) {
				const r1 = cam.toWorld(cam.toScreen(p));
				expect(Math.abs(r1.x - p.x)).toBeLessThan(1e-6);
				expect(Math.abs(r1.y - p.y)).toBeLessThan(1e-6);
				const r2 = cam.toScreen(cam.toWorld(p));
				expect(Math.abs(r2.x - p.x)).toBeLessThan(1e-6);
				expect(Math.abs(r2.y - p.y)).toBeLessThan(1e-6);
			}
		}
	});
});

describe('geometry contract — click locates element', () => {
	it('a screen point over an element’s center hit-tests to that element, under every camera state', () => {
		const scene = new SceneGraph();
		scene.replaceDocument({
			schemaVersion: 1,
			id: 'g',
			name: 'g',
			createdAt: '',
			updatedAt: '',
			canvas: { width: 1440, height: 900, background: '#fff' },
			elements: {},
			rootOrder: []
		});
		const el = createElement('card', { x: 300, y: 200, width: 120, height: 80 });
		scene.addElement(el as Element);

		const cam = new Camera();
		const centerWorld: V = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
		for (const s of STATES) {
			cam.zoom = s.zoom;
			cam.panX = s.panX;
			cam.panY = s.panY;
			const screen = cam.toScreen(centerWorld); // where the renderer would draw the center
			const backToWorld = cam.toWorld(screen); // what hit-test would receive
			const hit = hitTestPoint(scene.ordered, backToWorld);
			expect(hit?.id).toBe(el.id);
		}
	});
});

describe('geometry contract — create lands where you click', () => {
	it('creating an element at a screen point centers it on that point in world space', () => {
		const editor = new Editor();
		editor.scene.replaceDocument({
			schemaVersion: 1,
			id: 'c',
			name: 'c',
			createdAt: '',
			updatedAt: '',
			canvas: { width: 1440, height: 900, background: '#fff' },
			elements: {},
			rootOrder: []
		});
		editor.camera.setViewport(1440, 900);
		// A non-trivial camera so we'd catch a transform mismatch.
		editor.camera.zoom = 1.5;
		editor.camera.panX = 200;
		editor.camera.panY = -100;

		const clickScreen: V = { x: 600, y: 400 };
		const clickWorld = editor.camera.toWorld(clickScreen);

		editor.setTool('card');
		editor.pointerDown(clickScreen, { shift: false, alt: false, space: false, middle: false });
		editor.pointerUp();

		// Exactly one element created, centered on the click in WORLD space.
		const els = Object.values(editor.scene.doc.elements);
		expect(els.length).toBe(1);
		const el = els[0]!;
		const cx = el.x + el.width / 2;
		const cy = el.y + el.height / 2;
		expect(Math.abs(cx - clickWorld.x)).toBeLessThan(0.5);
		expect(Math.abs(cy - clickWorld.y)).toBeLessThan(0.5);
	});
});

describe('geometry contract — drag identity & pan/zoom purity', () => {
	function freshEditorWithCard(): { editor: Editor; id: string } {
		const editor = new Editor();
		editor.scene.replaceDocument({
			schemaVersion: 1,
			id: 'd',
			name: 'd',
			createdAt: '',
			updatedAt: '',
			canvas: { width: 1440, height: 900, background: '#fff' },
			elements: {},
			rootOrder: []
		});
		editor.camera.setViewport(1440, 900);
		const el = createElement('card', { x: 300, y: 200, width: 120, height: 80 });
		editor.scene.addElement(el as Element);
		return { editor, id: el.id };
	}

	it('pointer-down then pointer-up with zero movement leaves x/y/w/h byte-identical', () => {
		const { editor, id } = freshEditorWithCard();
		const before = JSON.stringify($state.snapshot(editor.scene.get(id)!));
		const centerScreen = editor.camera.toScreen({ x: 360, y: 240 });
		editor.pointerDown(centerScreen, { shift: false, alt: false, space: false, middle: false });
		editor.pointerUp();
		const after = JSON.stringify($state.snapshot(editor.scene.get(id)!));
		expect(after).toBe(before);
	});

	it('panning and zooming change NO element’s stored x/y/w/h', () => {
		const { editor, id } = freshEditorWithCard();
		const before = JSON.stringify($state.snapshot(editor.scene.get(id)!));
		editor.camera.panBy(321, -123);
		editor.camera.zoomBy(2.5, { x: 700, y: 350 });
		editor.camera.zoomBy(0.2, { x: 100, y: 100 });
		const after = JSON.stringify($state.snapshot(editor.scene.get(id)!));
		expect(after).toBe(before);
	});
});
