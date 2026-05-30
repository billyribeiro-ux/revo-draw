/**
 * Undo/redo via immutable, fully-cloned document snapshots.
 *
 * CHOICE & JUSTIFICATION (required by §7):
 * Full-document snapshots, not a typed command/inverse pattern. The document is a bounded JSON
 * object (hundreds–low-thousands of small elements); a snapshot is a cheap `structuredClone`.
 * Correctness is automatic — every undo restores a known-good prior state verbatim, so an inverse
 * command can never drift out of sync with its forward command (the classic undo-corruption bug).
 *
 * Each snapshot is a COMPLETE deep clone (no structural sharing). An earlier version shared
 * unchanged element objects between adjacent snapshots to save memory; a fuzz test (≥500 ops over
 * every command, 5 seeds) proved that sharing could alias a stale element across snapshots and
 * corrupt an undo. The fix is to never share: clone everything. Memory is bounded by
 * MAX_HISTORY × document size, which is trivial at this scale, and the invariant now holds.
 *
 * COALESCING (one undo entry per gesture): mutations run inside `transact()` (or an explicit
 * `begin()`/`commit()` for interactive gestures). The pre-gesture state is captured once at the
 * outermost `begin`; exactly one entry is pushed at `commit` iff the document actually changed.
 * Nested transactions collapse into the outermost one.
 */
import type { LayoutDocument } from '../elements/types.js';
import type { SceneGraph } from '../canvas/scene-graph.svelte.js';

interface Snapshot {
	doc: LayoutDocument;
	label: string;
}

const MAX_HISTORY = 1000;

/** A complete, detached deep clone of the document — no shared references with the live scene. */
function cloneDocument(doc: LayoutDocument): LayoutDocument {
	return structuredClone($state.snapshot(doc)) as LayoutDocument;
}

/**
 * Canonical serialization for change-detection: sorts element keys and object keys so the string
 * depends only on document *content*, never on insertion order or proxy identity.
 */
function canonical(doc: LayoutDocument): string {
	const plain = $state.snapshot(doc) as LayoutDocument;
	const ids = Object.keys(plain.elements).sort();
	const elements = ids.map((id) => stableStringify(plain.elements[id]));
	return JSON.stringify({
		name: plain.name,
		canvas: plain.canvas,
		rootOrder: plain.rootOrder,
		elements
	});
}

/** JSON.stringify with object keys sorted recursively, so equal content yields equal strings. */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export class History {
	#scene: SceneGraph;
	#past: Snapshot[] = $state([]);
	#future: Snapshot[] = $state([]);
	#depth = 0;
	#pendingLabel = '';
	/** Deep clone of the document as it was at the start of the current/last committed state. */
	#baseline: LayoutDocument;
	/** Canonical string of `#baseline`, cached so commit's no-op check is cheap. */
	#baselineKey: string;

	constructor(scene: SceneGraph) {
		this.#scene = scene;
		this.#baseline = cloneDocument(scene.doc);
		this.#baselineKey = canonical(scene.doc);
	}

	readonly canUndo: boolean = $derived(this.#past.length > 0);
	readonly canRedo: boolean = $derived(this.#future.length > 0);
	readonly undoLabel: string = $derived(this.#past.at(-1)?.label ?? '');
	readonly redoLabel: string = $derived(this.#future.at(-1)?.label ?? '');
	/** Current undo-stack depth (used by tests to assert one-entry-per-gesture). */
	get depth(): number {
		return this.#past.length;
	}

	/** Run a mutating operation as a single atomic undo entry. Nested calls collapse. */
	transact(label: string, fn: () => void): void {
		this.begin(label);
		try {
			fn();
		} finally {
			this.commit();
		}
	}

	/**
	 * Begin a deferred transaction (for interactive gestures). Captures the CURRENT scene as the
	 * pre-gesture baseline at the outermost begin, so `commit` records the true before-state and
	 * `cancel` restores exactly what existed when the gesture started. Re-snapshotting here (rather
	 * than trusting a previously-stored baseline) is what makes the system robust to any scene
	 * change that happened outside a transaction — the root cause of the "click deletes my element"
	 * bug was a baseline that predated such a change.
	 */
	begin(label: string): void {
		if (this.#depth === 0) {
			this.#pendingLabel = label;
			this.#baseline = cloneDocument(this.#scene.doc);
			this.#baselineKey = canonical(this.#scene.doc);
		}
		this.#depth++;
	}

	/** Commit: push exactly one entry iff the document changed since the baseline. */
	commit(): void {
		if (this.#depth === 0) return;
		this.#depth--;
		if (this.#depth > 0) return;

		const afterKey = canonical(this.#scene.doc);
		if (afterKey === this.#baselineKey) {
			return; // no effective change — nothing to record, baseline already current
		}

		// Record the PRE-state (the current baseline) as an undo entry, then advance the baseline.
		this.#past.push({ doc: this.#baseline, label: this.#pendingLabel });
		if (this.#past.length > MAX_HISTORY) this.#past.shift();
		this.#future = [];
		this.#baseline = cloneDocument(this.#scene.doc);
		this.#baselineKey = afterKey;
	}

	/** Abort an in-flight gesture without recording history (Escape / window blur mid-drag). */
	cancel(): void {
		if (this.#depth === 0) return;
		this.#depth = 0;
		// Restore the document to the baseline (the pre-gesture state).
		this.#scene.replaceDocument(cloneDocument(this.#baseline), { keepDirty: true });
		this.#baselineKey = canonical(this.#scene.doc);
		this.#baseline = cloneDocument(this.#scene.doc);
	}

	undo(): void {
		if (this.#depth !== 0) return; // never undo mid-gesture
		const prev = this.#past.pop();
		if (!prev) return;
		// Save the current (post) state for redo, then restore the popped pre-state.
		this.#future.push({ doc: this.#baseline, label: prev.label });
		this.#baseline = prev.doc;
		this.#baselineKey = canonical(prev.doc);
		this.#scene.replaceDocument(cloneDocument(prev.doc), { keepDirty: true });
	}

	redo(): void {
		if (this.#depth !== 0) return;
		const next = this.#future.pop();
		if (!next) return;
		this.#past.push({ doc: this.#baseline, label: next.label });
		this.#baseline = next.doc;
		this.#baselineKey = canonical(next.doc);
		this.#scene.replaceDocument(cloneDocument(next.doc), { keepDirty: true });
	}

	/** Reset history to a fresh baseline (on open/new). */
	reset(doc: LayoutDocument): void {
		this.#past = [];
		this.#future = [];
		this.#depth = 0;
		this.#baseline = cloneDocument(doc);
		this.#baselineKey = canonical(doc);
	}
}
