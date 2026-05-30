import { describe, expect, it } from 'vitest';
import { SceneGraph } from '../canvas/scene-graph.svelte.js';
import { History } from './history.svelte.js';
import { Commands } from './commands.svelte.js';
import { createBlankDocument } from '../elements/defaults.js';
import type { LayoutDocument } from '../elements/types.js';

/**
 * Data-integrity invariants for undo/redo (§13.2). We exercise the real SceneGraph + History +
 * Commands (rune-bearing, compiled by the Svelte plugin via vitest-svelte.config.ts) and assert:
 *   1. do -> undo returns to the prior serialized state, exactly.
 *   2. A random sequence of operations, fully undone, reconstructs the initial document.
 *   3. Re-applying redo to the end reconstructs the final document.
 * Serialized comparison ignores reactive-proxy identity and the non-document `updatedAt` stamp.
 */

function snap(doc: LayoutDocument): string {
	// Compare the *structural* document (elements + order + name), ignoring updatedAt which is a
	// bookkeeping stamp, not user content.
	const plain = $state.snapshot(doc) as LayoutDocument;
	return JSON.stringify({ elements: plain.elements, rootOrder: plain.rootOrder, name: plain.name });
}

function setup() {
	const scene = new SceneGraph();
	const doc = createBlankDocument('Fuzz');
	scene.replaceDocument(doc);
	const history = new History(scene);
	history.reset(scene.doc);
	const commands = new Commands(scene, history);
	return { scene, history, commands };
}

describe('undo/redo data integrity', () => {
	it('do -> undo restores the exact prior state for each command type', () => {
		const { scene, history, commands } = setup();
		const before = snap(scene.doc);

		// Add an element.
		const id = commands.createAt('card', { x: 100, y: 100 });
		expect(snap(scene.doc)).not.toBe(before);
		history.undo();
		expect(snap(scene.doc)).toBe(before);

		// Redo brings it back.
		history.redo();
		expect(scene.has(id)).toBe(true);

		// Move it, then undo.
		const afterAdd = snap(scene.doc);
		scene.select([id]);
		commands.nudge(50, -25);
		expect(snap(scene.doc)).not.toBe(afterAdd);
		history.undo();
		expect(snap(scene.doc)).toBe(afterAdd);
	});

	it('a random op sequence: undo-to-start reconstructs initial; redo-to-end reconstructs final', () => {
		const { scene, history, commands } = setup();
		const initial = snap(scene.doc);

		// Deterministic pseudo-random sequence (seeded LCG — no Math.random for reproducibility).
		let seed = 1234567;
		const rnd = (): number => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return seed / 0x7fffffff;
		};

		const types = ['frame', 'container', 'card', 'text', 'button', 'chart'] as const;
		const created: string[] = [];

		const OPS = 60;
		for (let i = 0; i < OPS; i++) {
			const roll = rnd();
			if (roll < 0.4 || created.length === 0) {
				const t = types[Math.floor(rnd() * types.length)] ?? 'card';
				const id = commands.createAt(t, { x: Math.floor(rnd() * 800), y: Math.floor(rnd() * 600) });
				created.push(id);
			} else if (roll < 0.6) {
				const id = created[Math.floor(rnd() * created.length)];
				if (id && scene.has(id)) {
					scene.select([id]);
					commands.nudge(Math.floor(rnd() * 40) - 20, Math.floor(rnd() * 40) - 20);
				}
			} else if (roll < 0.75) {
				const id = created[Math.floor(rnd() * created.length)];
				if (id && scene.has(id)) {
					scene.select([id]);
					commands.duplicateSelection();
				}
			} else if (roll < 0.88) {
				const id = created[Math.floor(rnd() * created.length)];
				if (id && scene.has(id)) {
					scene.select([id]);
					commands.patch(id, { label: `lbl-${i}` }, 'label');
				}
			} else {
				const id = created[Math.floor(rnd() * created.length)];
				if (id && scene.has(id)) {
					scene.select([id]);
					commands.bringToFront();
				}
			}
		}

		const finalState = snap(scene.doc);

		// Undo everything — should land back on the initial document.
		let steps = 0;
		while (history.canUndo && steps < 1000) {
			history.undo();
			steps++;
		}
		expect(snap(scene.doc)).toBe(initial);

		// Redo everything — should reconstruct the final document.
		steps = 0;
		while (history.canRedo && steps < 1000) {
			history.redo();
			steps++;
		}
		expect(snap(scene.doc)).toBe(finalState);
	});

	it('a cancelled gesture leaves a clean state (no torn mutation)', () => {
		const { scene, history, commands } = setup();
		const id = commands.createAt('card', { x: 10, y: 10 });
		const clean = snap(scene.doc);

		// Begin a gesture, mutate, then cancel — state must revert to the pre-gesture snapshot.
		history.begin('Move');
		scene.translateSubtree(id, 200, 200);
		history.cancel();
		expect(snap(scene.doc)).toBe(clean);
	});

	it('a no-op gesture records no history entry', () => {
		const { history, commands } = setup();
		commands.createAt('card', { x: 0, y: 0 });
		const undoDepthBefore = countUndos(history);

		// A transaction that does nothing should not push an entry.
		history.transact('noop', () => {
			/* intentionally empty */
		});
		expect(countUndos(history)).toBe(undoDepthBefore);
	});

	it('reparent moves an element under a container and is cycle-safe & undoable', () => {
		const { scene, history, commands } = setup();
		const container = commands.createAt('container', { x: 0, y: 0 });
		const card = commands.createAt('card', { x: 400, y: 400 });

		// The blank document has a root frame; both new elements auto-parent into it.
		const containerParentBefore = scene.get(container)?.parentId ?? null;

		commands.reparent(card, container);
		expect(scene.get(card)?.parentId).toBe(container);

		// A cycle (parent the container into its own child) must be rejected — no throw, no change.
		commands.reparent(container, card);
		expect(scene.get(container)?.parentId).toBe(containerParentBefore);

		// Reparent is undoable: the rejected cycle recorded nothing, so one undo reverts the real
		// reparent and the card returns to where it was.
		history.undo();
		expect(scene.get(card)?.parentId).not.toBe(container);
	});
});

function countUndos(history: History): number {
	let n = 0;
	while (history.canUndo && n < 10000) {
		history.undo();
		n++;
	}
	// restore
	let r = n;
	while (r-- > 0) history.redo();
	return n;
}
