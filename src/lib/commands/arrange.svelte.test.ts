import { describe, expect, it } from 'vitest';
import { SceneGraph } from '../canvas/scene-graph.svelte.js';
import { History } from './history.svelte.js';
import { Commands } from './commands.svelte.js';
import { createBlankDocument } from '../elements/defaults.js';
import type { ElementId } from '../elements/types.js';

/**
 * Parity tests for the Excalidraw arrangement functions ported into LayoutForge:
 * align (6), distribute (2), flip (2), lock/unlock, copy/paste styles.
 * Each asserts the exact post-condition the Excalidraw algorithm guarantees.
 */

function setup() {
	const scene = new SceneGraph();
	scene.replaceDocument(createBlankDocument('Arrange'));
	const history = new History(scene);
	history.reset(scene.doc);
	const commands = new Commands(scene, history);
	return { scene, history, commands };
}

/** Place a 0-rotation card at (x,y) sized w×h, return its id. */
function card(c: Commands, x: number, y: number, w = 100, h = 60): ElementId {
	const id = c.createAt('card', { x, y, width: w, height: h });
	return id;
}
const box = (c: Commands, id: ElementId) => {
	const el = c.scene.get(id)!;
	return { x: el.x, y: el.y, w: el.width, h: el.height, r: el.x + el.width, b: el.y + el.height };
};

describe('align', () => {
	it('alignLeft moves every selected box to the selection min-x', () => {
		const { scene, commands } = setup();
		const a = card(commands, 0, 0);
		const b = card(commands, 200, 100);
		const d = card(commands, 500, 300);
		scene.select([a, b, d]);
		commands.align('x', 'start');
		expect(box(commands, a).x).toBe(0);
		expect(box(commands, b).x).toBe(0);
		expect(box(commands, d).x).toBe(0);
	});

	it('alignRight matches the selection max-x on the right edge', () => {
		const { scene, commands } = setup();
		const a = card(commands, 0, 0, 100, 60); // right = 100
		const b = card(commands, 200, 100, 100, 60); // right = 300
		const d = card(commands, 500, 300, 100, 60); // right = 600 (selection max-x)
		scene.select([a, b, d]);
		commands.align('x', 'end');
		expect(box(commands, a).r).toBe(600);
		expect(box(commands, b).r).toBe(600);
		expect(box(commands, d).r).toBe(600);
	});

	it('alignVerticallyCentered centers boxes on the selection mid-y', () => {
		const { scene, commands } = setup();
		const a = card(commands, 0, 0, 100, 60); // y 0..60
		const b = card(commands, 200, 140, 100, 60); // y 140..200 → selection y 0..200, mid 100
		scene.select([a, b]);
		commands.align('y', 'center');
		// each box (h=60) centered on 100 → y = 70
		expect(box(commands, a).y).toBe(70);
		expect(box(commands, b).y).toBe(70);
	});

	it('is a no-op with fewer than 2 roots', () => {
		const { scene, commands } = setup();
		const a = card(commands, 33, 44);
		scene.select([a]);
		commands.align('x', 'start');
		expect(box(commands, a).x).toBe(33);
	});
});

describe('distribute', () => {
	it('distributeHorizontally equalizes the gaps between consecutive boxes', () => {
		const { scene, commands } = setup();
		// Three equal 100-wide boxes; outer two fixed at x=0 and x=500 (right=600).
		const a = card(commands, 0, 0, 100, 60); // 0..100
		const mid = card(commands, 120, 0, 100, 60); // 120..220 (will move)
		const c = card(commands, 500, 0, 100, 60); // 500..600
		scene.select([a, mid, c]);
		commands.distribute('x');
		// span = 300, selExtent = 600, step = (600-300)/2 = 150.
		// pos: a at 0 (0..100), then pos=100+150=250 → mid at 250 (250..350), then pos=350+150=500 → c at 500.
		expect(box(commands, a).x).toBe(0);
		expect(box(commands, mid).x).toBe(250);
		expect(box(commands, c).x).toBe(500);
		// Gaps now equal: 250-100 = 150, 500-350 = 150.
		expect(box(commands, mid).x - box(commands, a).r).toBe(150);
		expect(box(commands, c).x - box(commands, mid).r).toBe(150);
	});

	it('needs >= 3 roots (no-op otherwise)', () => {
		const { scene, commands } = setup();
		const a = card(commands, 0, 0);
		const b = card(commands, 300, 0);
		scene.select([a, b]);
		commands.distribute('x');
		expect(box(commands, b).x).toBe(300);
	});
});

describe('flip', () => {
	it('flipHorizontal mirrors box positions about the selection center', () => {
		const { scene, commands } = setup();
		const a = card(commands, 0, 0, 100, 60); // 0..100
		const b = card(commands, 400, 0, 100, 60); // 400..500 → selection 0..500, center 250
		scene.select([a, b]);
		commands.flip('x');
		// a: newX = 2*250 - (0+100) = 400 ; b: newX = 2*250 - (400+100) = 0
		expect(box(commands, a).x).toBe(400);
		expect(box(commands, b).x).toBe(0);
	});

	it('flipping twice is identity', () => {
		const { scene, commands } = setup();
		const a = card(commands, 10, 0, 100, 60);
		const b = card(commands, 400, 0, 100, 60);
		scene.select([a, b]);
		const ax0 = box(commands, a).x;
		commands.flip('x');
		commands.flip('x');
		expect(box(commands, a).x).toBe(ax0);
	});
});

describe('lock / unlock', () => {
	it('toggleLockSelection locks then unlocks', () => {
		const { scene, commands } = setup();
		const a = card(commands, 0, 0);
		scene.selectOne(a);
		commands.toggleLockSelection();
		expect(scene.get(a)!.locked).toBe(true);
		commands.toggleLockSelection();
		expect(scene.get(a)!.locked).toBe(false);
	});

	it('unlockAll clears every lock', () => {
		const { scene, commands } = setup();
		const a = card(commands, 0, 0);
		const b = card(commands, 200, 0);
		scene.select([a, b]);
		commands.toggleLockSelection();
		commands.unlockAll();
		expect(scene.get(a)!.locked).toBe(false);
		expect(scene.get(b)!.locked).toBe(false);
	});
});

describe('copy / paste styles', () => {
	it('captures the primary style and applies it to other selected elements', () => {
		const { scene, commands } = setup();
		const src = card(commands, 0, 0);
		const dst = card(commands, 200, 0);
		commands.setStyleOnSelection({ stroke: '#e03131' }, 'set'); // note: applies to whatever is selected
		scene.selectOne(src);
		commands.setStyleOnSelection({ stroke: '#e03131', fill: '#ffc9c9' }, 'set');
		const style = commands.copyStyles();
		expect(style?.stroke).toBe('#e03131');
		scene.selectOne(dst);
		commands.pasteStyles(style!);
		expect(scene.get(dst)!.style?.stroke).toBe('#e03131');
		expect(scene.get(dst)!.style?.fill).toBe('#ffc9c9');
	});
});

describe('undo integrity for arrangement ops', () => {
	it('align is one undoable transaction', () => {
		const { scene, history, commands } = setup();
		const a = card(commands, 0, 0);
		const b = card(commands, 200, 100);
		scene.select([a, b]);
		const beforeX = box(commands, b).x;
		commands.align('x', 'start');
		expect(box(commands, b).x).not.toBe(beforeX);
		history.undo();
		expect(box(commands, b).x).toBe(beforeX);
	});
});
