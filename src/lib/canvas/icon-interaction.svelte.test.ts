import { describe, expect, it } from 'vitest';
import { createBlankDocument } from '../elements/defaults.ts';
import type { IconElement } from '../elements/types.ts';
import { Editor } from './editor.svelte.ts';
import { iconInk } from './renderer.ts';
import type { Vec2 } from './geometry.ts';

/**
 * Headless reproduction of the reported Phosphor-icon bug: "after adding an icon I can't drag it,
 * make it bigger, or change its color." Drives the real Editor controller (no DOM), mirroring how
 * `Canvas.svelte` wires pointer events — including the `finishCreate()` call after `pointerUp()`.
 *
 * If these pass, the controller logic is sound and any remaining failure lives in the DOM/render
 * layer (CSS, canvas paint, event capture) — which only an in-browser check can surface.
 */

const DOWN = { shift: false, alt: false, space: false, middle: false };
const MOVE = { alt: false, shift: false };
// A valid (non-empty) Phosphor "circle" path — interaction doesn't depend on the geometry, only on
// svgPath being a real path string the way the picker stores it (combinePaths output).
const CIRCLE_PATH =
	'M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88';

function freshEditor(): Editor {
	const editor = new Editor();
	const doc = createBlankDocument('Icon interaction');
	editor.scene.replaceDocument(doc);
	editor.history.reset(doc);
	editor.camera.setViewport(1440, 900);
	editor.camera.panX = 0;
	editor.camera.panY = 0;
	editor.camera.zoom = 1; // world == screen, so screen deltas equal world deltas
	editor.setTool('select');
	return editor;
}

/** Place an icon exactly the way the toolbar Icon-tool flow does: pendingIcon + click on canvas. */
function placeIconViaTool(editor: Editor, world: Vec2): IconElement {
	editor.setTool('icon');
	editor.pendingIcon = { name: 'ph:circle', svgPath: CIRCLE_PATH, viewBox: '0 0 256 256' };
	const screen = editor.camera.toScreen(world);
	editor.pointerDown(screen, DOWN);
	editor.pointerUp();
	editor.finishCreate(); // Canvas.svelte calls this after pointerUp when a creation tool was active
	const sole = editor.soleSelected;
	if (!sole || sole.type !== 'icon') throw new Error('icon was not placed + selected');
	return sole as IconElement;
}

describe('phosphor icon interaction (controller-level)', () => {
	it('toolbar Icon tool places a sized, selected icon carrying its svg body', () => {
		const editor = freshEditor();
		const icon = placeIconViaTool(editor, { x: 400, y: 300 });
		expect(icon.type).toBe('icon');
		expect(icon.iconName).toBe('ph:circle');
		expect(icon.svgPath).toBe(CIRCLE_PATH);
		expect(icon.width).toBeGreaterThan(0);
		expect(icon.height).toBeGreaterThan(0);
		expect(editor.scene.isSelected(icon.id)).toBe(true);
	});

	it('drag-from-picker drop creates a selected icon (Canvas.onCanvasDrop path)', () => {
		const editor = freshEditor();
		const id = editor.commands.createAt('icon', { x: 200, y: 200, width: 32, height: 32 });
		editor.commands.patch(
			id,
			{ iconName: 'ph:circle', svgPath: CIRCLE_PATH, viewBox: '0 0 256 256' } as Partial<IconElement>,
			'Place icon'
		);
		expect(editor.scene.isSelected(id)).toBe(true);
		const el = editor.scene.get(id) as IconElement;
		expect(el.svgPath).toBe(CIRCLE_PATH);
	});

	it('a placed icon can be dragged (moved) by its body', () => {
		const editor = freshEditor();
		const icon = placeIconViaTool(editor, { x: 400, y: 300 });
		const id = icon.id;
		const before = { x: icon.x, y: icon.y };
		const center = { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 };
		const startScreen = editor.camera.toScreen(center);
		editor.pointerDown(startScreen, DOWN);
		editor.pointerMove({ x: startScreen.x + 60, y: startScreen.y + 45 }, MOVE);
		editor.pointerUp();
		const after = editor.scene.get(id);
		if (!after) throw new Error('icon vanished');
		expect(after.x).toBeCloseTo(before.x + 60, 5);
		expect(after.y).toBeCloseTo(before.y + 45, 5);
	});

	it('a placed icon can be made bigger via its SE resize handle', () => {
		const editor = freshEditor();
		const icon = placeIconViaTool(editor, { x: 400, y: 300 });
		const id = icon.id;
		const w0 = icon.width;
		const h0 = icon.height;
		const se = editor.currentHandles().find((h) => h.kind === 'se');
		if (!se) throw new Error('no SE handle');
		const seScreen = editor.camera.toScreen(se.world);
		editor.pointerDown(seScreen, DOWN);
		editor.pointerMove({ x: seScreen.x + 50, y: seScreen.y + 50 }, MOVE);
		editor.pointerUp();
		const after = editor.scene.get(id);
		if (!after) throw new Error('icon vanished');
		expect(after.width).toBeGreaterThan(w0);
		expect(after.height).toBeGreaterThan(h0);
	});

	it('a placed icon can have its fill color changed', () => {
		const editor = freshEditor();
		const icon = placeIconViaTool(editor, { x: 400, y: 300 });
		const id = icon.id;
		editor.commands.patch(
			id,
			{ style: { ...icon.style, fill: 'oklch(0.6 0.2 20)' } } as Partial<IconElement>,
			'Edit style'
		);
		const after = editor.scene.get(id) as IconElement;
		expect(after.style?.fill).toBe('oklch(0.6 0.2 20)');
	});

	it('the Style panel Stroke control recolors an icon (stroke is the glyph ink)', () => {
		const editor = freshEditor();
		const icon = placeIconViaTool(editor, { x: 400, y: 300 });
		const id = icon.id;
		// Mirror StylePanel.setStroke -> commands.setStyleOnSelection({ stroke }).
		editor.scene.selectOne(id);
		editor.commands.setStyleOnSelection({ stroke: 'oklch(0.55 0.22 25)' }, 'Stroke color');
		const after = editor.scene.get(id) as IconElement;
		expect(after.style?.stroke).toBe('oklch(0.55 0.22 25)');
		// And the renderer resolves the glyph ink to that stroke.
		expect(iconInk(after.style)).toBe('oklch(0.55 0.22 25)');
	});
});

describe('iconInk resolution (renderer)', () => {
	it('falls back to the default INK when no color is set', () => {
		expect(iconInk(undefined)).toBe('oklch(0.24 0.014 264)');
		expect(iconInk({})).toBe('oklch(0.24 0.014 264)');
	});
	it('uses fill when only fill is set (back-compat with existing docs)', () => {
		expect(iconInk({ fill: 'oklch(0.6 0.2 20)' })).toBe('oklch(0.6 0.2 20)');
	});
	it('prefers stroke over fill (the intuitive recolor control wins)', () => {
		expect(iconInk({ stroke: 'blue', fill: 'red' })).toBe('blue');
	});
});
