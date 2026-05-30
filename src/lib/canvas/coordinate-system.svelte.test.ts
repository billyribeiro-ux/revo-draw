import { describe, expect, it } from 'vitest';
import { Commands } from '../commands/commands.svelte.js';
import { History } from '../commands/history.svelte.js';
import { createBlankDocument, createElement } from '../elements/defaults.js';
import type { Element, LayoutDocument } from '../elements/types.js';
import { Camera } from './camera.svelte.js';
import { Editor } from './editor.svelte.js';
import { hitTestPoint } from './hit-test.js';
import { SceneGraph } from './scene-graph.svelte.js';
import { approxEqual, bboxCenter, rotate, type BBox, type Vec2 } from './geometry.js';

function expectPointClose(actual: Vec2, expected: Vec2, eps = 1e-8): void {
	expect(approxEqual(actual.x, expected.x, eps), `x ${actual.x} ~= ${expected.x}`).toBe(true);
	expect(approxEqual(actual.y, expected.y, eps), `y ${actual.y} ~= ${expected.y}`).toBe(true);
}

function structuralGeometry(doc: LayoutDocument): string {
	const plain = $state.snapshot(doc) as LayoutDocument;
	const geometry = Object.values(plain.elements)
		.map((el) => ({
			id: el.id,
			parentId: el.parentId,
			x: el.x,
			y: el.y,
			width: el.width,
			height: el.height,
			rotation: el.rotation
		}))
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return JSON.stringify(geometry);
}

function cameraStates(): Array<{ panX: number; panY: number; zoom: number }> {
	return [
		{ panX: 0, panY: 0, zoom: 1 },
		{ panX: 180, panY: -72, zoom: 0.25 },
		{ panX: -840, panY: 390, zoom: 2.5 },
		{ panX: 12000, panY: -9000, zoom: 0.05 },
		{ panX: -320, panY: 240, zoom: 8 }
	];
}

function samplePoints(): Vec2[] {
	return [
		{ x: 0, y: 0 },
		{ x: 100, y: 100 },
		{ x: -250.5, y: 640.25 },
		{ x: 1440, y: 900 },
		{ x: 98765.4321, y: -12345.6789 }
	];
}

describe('coordinate-system contract', () => {
	it('camera world/screen transforms are exact inverses across pan and zoom states', () => {
		for (const state of cameraStates()) {
			const camera = new Camera();
			camera.panX = state.panX;
			camera.panY = state.panY;
			camera.zoom = state.zoom;
			for (const world of samplePoints()) {
				const screen = camera.toScreen(world);
				expectPointClose(camera.toWorld(screen), world);
				expectPointClose(camera.toScreen(camera.toWorld(screen)), screen);
			}
		}
	});

	it('click-locates-element after exactly one screen-to-world conversion', () => {
		for (const state of cameraStates()) {
			const camera = new Camera();
			camera.panX = state.panX;
			camera.panY = state.panY;
			camera.zoom = state.zoom;
			const el = createElement('card', {
				x: 240,
				y: 180,
				width: 160,
				height: 100,
				label: 'Target'
			}) as Element;
			el.rotation = Math.PI / 7;
			const screenCenter = camera.toScreen({ x: el.x + el.width / 2, y: el.y + el.height / 2 });
			const worldFromPointer = camera.toWorld(screenCenter);
			expect(hitTestPoint([el], worldFromPointer)?.id).toBe(el.id);
		}
	});

	it('zero-movement drag leaves element geometry byte-identical', () => {
		const editor = new Editor();
		const doc = createBlankDocument('Drag identity');
		editor.scene.replaceDocument(doc);
		editor.history.reset(doc);
		editor.setTool('select');
		editor.camera.panX = -350;
		editor.camera.panY = 220;
		editor.camera.zoom = 1.75;
		const id = editor.commands.createAt('card', { x: 180, y: 140, width: 160, height: 100 });
		const el = editor.scene.get(id);
		if (!el) throw new Error('expected element');
		const before = structuralGeometry(editor.scene.doc);
		const screenCenter = editor.camera.toScreen({ x: el.x + el.width / 2, y: el.y + el.height / 2 });
		editor.pointerDown(screenCenter, { shift: false, alt: false, space: false, middle: false });
		editor.pointerUp();
		expect(structuralGeometry(editor.scene.doc)).toBe(before);
	});

	it('pan and zoom mutate only the camera, never stored world geometry', () => {
		const scene = new SceneGraph();
		const history = new History(scene);
		const commands = new Commands(scene, history);
		const doc = createBlankDocument('Camera-only changes');
		scene.replaceDocument(doc);
		history.reset(doc);
		commands.createAt('card', { x: 320, y: 260, width: 160, height: 100 });
		commands.createAt('text', { x: 520, y: 360, width: 240, height: 40 });
		const before = structuralGeometry(scene.doc);
		const camera = new Camera();
		camera.setViewport(1440, 900);
		camera.panBy(500, -250);
		camera.zoomBy(2.2, { x: 720, y: 450 });
		camera.fit(scene.contentBounds, 80);
		expect(structuralGeometry(scene.doc)).toBe(before);
	});

	it('rotation uses the element center consistently for corners and hit-testing', () => {
		const box: BBox = { x: 100, y: 80, width: 120, height: 60 };
		const center = bboxCenter(box);
		const angle = Math.PI / 3;
		const visualCenter = rotate(center, angle, center);
		expectPointClose(visualCenter, center);
		const el = { ...createElement('image', box), rotation: angle } as Element;
		expect(hitTestPoint([el], center)?.id).toBe(el.id);
	});
});
