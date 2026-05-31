import { describe, expect, it } from 'vitest';
import { SceneGraph } from '../canvas/scene-graph.svelte.ts';
import { History } from './history.svelte.ts';
import { Commands } from './commands.svelte.ts';
import { createBlankDocument } from '../elements/defaults.ts';
import { SEMANTIC_TYPES, type Element, type ElementId, type LayoutDocument } from '../elements/types.ts';

/**
 * §14.3 evidence: a ≥500-op randomized fuzz over EVERY mutating command, asserting the
 * do/undo/redo invariant deep-equals at every step back to empty and forward to final. The RNG is
 * seeded and the seed is printed so any failure reproduces. Run across multiple seeds.
 */

function structural(doc: LayoutDocument): string {
	const plain = $state.snapshot(doc) as LayoutDocument;
	return JSON.stringify({ elements: plain.elements, rootOrder: plain.rootOrder, name: plain.name });
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function runFuzz(seed: number, ops: number): { ops: number; checks: number; seed: number } {
	const rnd = mulberry32(seed);
	const scene = new SceneGraph();
	scene.replaceDocument(createBlankDocument('Fuzz'));
	const history = new History(scene);
	history.reset(scene.doc);
	const commands = new Commands(scene, history);

	const created: ElementId[] = [];
	const pick = (): ElementId | null => {
		const live = created.filter((id) => scene.has(id));
		if (live.length === 0) return null;
		return live[Math.floor(rnd() * live.length)] ?? null;
	};
	const allTypes = SEMANTIC_TYPES;

	const states: string[] = [structural(scene.doc)];
	let pasteBuf: ReturnType<Commands['copySelection']> = null;

	for (let i = 0; i < ops; i++) {
		const r = rnd();
		if (r < 0.28 || created.length === 0) {
			const t = allTypes[Math.floor(rnd() * allTypes.length)] ?? 'card';
			const id = commands.createAt(t, { x: Math.floor(rnd() * 1200), y: Math.floor(rnd() * 800) });
			created.push(id);
		} else {
			const id = pick();
			if (!id) continue;
			scene.select([id]);
			const k = rnd();
			if (k < 0.16) {
				commands.nudge(Math.floor(rnd() * 60) - 30, Math.floor(rnd() * 60) - 30);
			} else if (k < 0.3) {
				// resize via direct patch wrapped as one transaction (commands.patch)
				const el = scene.get(id) as Element;
				commands.patch(id, { width: Math.max(4, el.width + Math.floor(rnd() * 80 - 40)), height: Math.max(4, el.height + Math.floor(rnd() * 80 - 40)) }, 'Resize');
			} else if (k < 0.42) {
				commands.patch(id, { rotation: rnd() * Math.PI }, 'Rotate');
			} else if (k < 0.54) {
				commands.patch(id, { style: { fill: `oklch(${rnd().toFixed(2)} 0.1 200)`, opacity: +rnd().toFixed(2) } }, 'Restyle');
			} else if (k < 0.62) {
				const el = scene.get(id) as Element;
				if (el.type === 'text') commands.patch(id, { content: `t${i}` } as Partial<Element>, 'Text edit');
				else commands.patch(id, { label: `lbl${i}` }, 'Label');
			} else if (k < 0.72) {
				commands.bringToFront();
			} else if (k < 0.8) {
				commands.sendToBack();
			} else if (k < 0.88) {
				const ids = commands.duplicateSelection();
				created.push(...ids);
			} else if (k < 0.93) {
				pasteBuf = commands.copySelection();
				if (pasteBuf) created.push(...commands.paste(pasteBuf));
			} else if (k < 0.97) {
				// reparent into another container, if any
				const target = created.find((c) => {
					const e = scene.get(c);
					return e && c !== id && (e.type === 'container' || e.type === 'card' || e.type === 'frame');
				});
				if (target) commands.reparent(id, target);
			} else {
				commands.deleteSelection();
			}
		}
		const next = structural(scene.doc);
		if (next !== states.at(-1)) states.push(next);
	}

	const final = structural(scene.doc);
	let checks = 0;

	// Undo to the very start, asserting each intermediate state matches the recorded snapshot.
	for (let i = states.length - 1; i >= 1; i--) {
		expect(structural(scene.doc)).toBe(states[i]);
		checks++;
		if (history.canUndo) history.undo();
	}
	expect(structural(scene.doc)).toBe(states[0]);
	checks++;

	// Redo forward to the final state.
	for (let i = 1; i < states.length; i++) {
		if (history.canRedo) history.redo();
		expect(structural(scene.doc)).toBe(states[i]);
		checks++;
	}
	expect(structural(scene.doc)).toBe(final);
	checks++;

	return { ops, checks, seed };
}

describe('§14.3 undo/redo fuzz invariant', () => {
	const SEEDS = [1, 7, 42, 1337, 90210];
	for (const seed of SEEDS) {
		it(`do/undo/redo deep-equals at every step (seed=${seed}, 500 ops)`, () => {
			const res = runFuzz(seed, 500);
			// eslint-disable-next-line no-console
			console.log(`[fuzz] seed=${res.seed} ops=${res.ops} assertions=${res.checks} PASS`);
			expect(res.ops).toBe(500);
			expect(res.checks).toBeGreaterThan(900);
		});
	}
});

describe('§14.3 gesture coalescing — exactly one undo entry per gesture', () => {
	function setup() {
		const scene = new SceneGraph();
		scene.replaceDocument(createBlankDocument('G'));
		const history = new History(scene);
		history.reset(scene.doc);
		const commands = new Commands(scene, history);
		return { scene, history, commands };
	}

	// Undo-stack depth probe: count how many undos return to a baseline, then redo back.
	function undoDepth(history: History): number {
		let n = 0;
		while (history.canUndo && n < 100000) {
			history.undo();
			n++;
		}
		for (let i = 0; i < n; i++) history.redo();
		return n;
	}

	it('a multi-step drag (one begin/commit) is a single undo entry that fully reverts', () => {
		const { scene, history, commands } = setup();
		const id = commands.createAt('card', { x: 50, y: 50 });
		const before = structural(scene.doc);
		const depthBefore = undoDepth(history);

		// Simulate a drag gesture: one begin, many translate steps, one commit.
		history.begin('Move');
		for (let i = 0; i < 20; i++) scene.translateSubtree(id, 3, 2);
		history.commit();

		const depthAfter = undoDepth(history);
		expect(depthAfter - depthBefore).toBe(1); // exactly one entry for the whole drag
		history.undo();
		expect(structural(scene.doc)).toBe(before); // single undo fully reverts
	});

	it('a resize gesture (one begin/commit, many steps) is one undo entry', () => {
		const { scene, history, commands } = setup();
		const id = commands.createAt('card', { x: 0, y: 0 });
		const before = structural(scene.doc);
		const depthBefore = undoDepth(history);
		history.begin('Resize');
		for (let i = 0; i < 15; i++) scene.updateElement(id, { width: 100 + i * 5, height: 80 + i * 3 });
		history.commit();
		expect(undoDepth(history) - depthBefore).toBe(1);
		history.undo();
		expect(structural(scene.doc)).toBe(before);
	});

	it('a rotate gesture is one undo entry', () => {
		const { scene, history, commands } = setup();
		const id = commands.createAt('image', { x: 0, y: 0 });
		const before = structural(scene.doc);
		const depthBefore = undoDepth(history);
		history.begin('Rotate');
		for (let i = 0; i < 30; i++) scene.updateElement(id, { rotation: i * 0.05 });
		history.commit();
		expect(undoDepth(history) - depthBefore).toBe(1);
		history.undo();
		expect(structural(scene.doc)).toBe(before);
	});

	it('a multi-element move is one undo entry', () => {
		const { scene, history, commands } = setup();
		const a = commands.createAt('card', { x: 0, y: 0 });
		const b = commands.createAt('card', { x: 400, y: 0 });
		scene.select([a, b]);
		const before = structural(scene.doc);
		const depthBefore = undoDepth(history);
		history.begin('Move');
		for (let i = 0; i < 10; i++) {
			scene.translateSubtree(a, 5, 0);
			scene.translateSubtree(b, 5, 0);
		}
		history.commit();
		expect(undoDepth(history) - depthBefore).toBe(1);
		history.undo();
		expect(structural(scene.doc)).toBe(before);
	});

	it('an inline text edit is one undo entry', () => {
		const { scene, history, commands } = setup();
		const id = commands.createAt('text', { x: 0, y: 0 });
		const before = structural(scene.doc);
		const depthBefore = undoDepth(history);
		commands.patch(id, { content: 'Edited copy' } as Partial<Element>, 'Edit text');
		expect(undoDepth(history) - depthBefore).toBe(1);
		history.undo();
		expect(structural(scene.doc)).toBe(before);
	});

	it('interrupt safety: a cancelled gesture reverts state and adds no undo entry', () => {
		const { scene, history, commands } = setup();
		const id = commands.createAt('card', { x: 10, y: 10 });
		const before = structural(scene.doc);
		const depthBefore = undoDepth(history);
		history.begin('Move');
		for (let i = 0; i < 12; i++) scene.translateSubtree(id, 9, 9);
		history.cancel(); // simulates Escape / window blur mid-drag
		expect(structural(scene.doc)).toBe(before);
		expect(undoDepth(history)).toBe(depthBefore);
	});
});
