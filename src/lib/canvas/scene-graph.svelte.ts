/**
 * The document model and reactive scene graph.
 *
 * Holds the active `LayoutDocument` in `$state` and exposes typed read selectors plus the
 * low-level mutation primitives (add/update/remove/reparent/reorder). Mutations here are
 * "raw" — the undo/redo layer (`commands/history.svelte.ts`) is responsible for snapshotting
 * around user-facing operations so a drag becomes a single undo entry. Selection lives here
 * too because it is editor state that many subsystems read.
 *
 * Hierarchy: every element has a `parentId`. The order of children within a parent is given by
 * the parent's child list, which we maintain in `childOrder`. Top-level order is `rootOrder`.
 * Geometry (x/y/width/height) is always WORLD coordinates — children are NOT stored relative
 * to their parent, which keeps hit-testing and rendering simple; reparenting preserves world
 * position. Moving a parent moves children by walking the subtree (see `translateSubtree`).
 */
import { SvelteSet } from 'svelte/reactivity';
import {
	orientedBBox,
	unionBBox,
	type BBox,
	type Vec2
} from './geometry.ts';
import { createBlankDocument } from '../elements/defaults.ts';
import {
	isContainerType,
	type Element,
	type ElementId,
	type LayoutDocument
} from '../elements/types.ts';

export class SceneGraph {
	/** The active document. Reassigned wholesale on open/new/undo (raw replacement). */
	doc = $state<LayoutDocument>(createBlankDocument());

	/** Selected element ids. Editor state, not part of the document. A reactive SvelteSet so that
	 *  membership reads (`.has`/`.size`/iteration) inside `$derived`/`$effect` track correctly. */
	selection = $state<SvelteSet<ElementId>>(new SvelteSet());

	/** Marks the document dirty since last save (drives the title-bar indicator + autosave). */
	dirty = $state(false);

	/** Monotonic revision counter; bumped on every structural/visual change for the renderer. */
	revision = $state(0);

	/** All elements as an array, stable-ordered by depth-first traversal of the hierarchy. */
	readonly ordered: Element[] = $derived.by(() => this.collectOrdered());

	/** World-space bounds enclosing every element (for zoom-to-fit). */
	readonly contentBounds: BBox = $derived.by(() => {
		const boxes = Object.values(this.doc.elements).map((el) => orientedBBox(el, el.rotation));
		if (boxes.length === 0) {
			return { x: 0, y: 0, width: this.doc.canvas.width, height: this.doc.canvas.height };
		}
		return unionBBox(boxes);
	});

	/** Selected elements, resolved and order-stable. */
	readonly selectedElements: Element[] = $derived.by(() =>
		this.ordered.filter((el) => this.selection.has(el.id))
	);

	/** World-space union bounds of the current selection (axis-aligned). */
	readonly selectionBounds: BBox | null = $derived.by(() => {
		const els = this.selectedElements;
		if (els.length === 0) return null;
		return unionBBox(els.map((el) => orientedBBox(el, el.rotation)));
	});

	// ---- reads ------------------------------------------------------------------------------

	get(id: ElementId): Element | undefined {
		return this.doc.elements[id];
	}

	has(id: ElementId): boolean {
		return id in this.doc.elements;
	}

	/** Direct children of a parent (null = root), in z/explicit order. */
	childrenOf(parentId: ElementId | null): Element[] {
		const ids = parentId === null ? this.doc.rootOrder : this.childOrderOf(parentId);
		const out: Element[] = [];
		for (const id of ids) {
			const el = this.doc.elements[id];
			if (el) out.push(el);
		}
		return out;
	}

	/** Ordered child ids of a parent (null = root), derived from element.z then insertion. */
	childOrderOf(parentId: ElementId | null): ElementId[] {
		const kids = Object.values(this.doc.elements).filter((el) => el.parentId === parentId);
		kids.sort((a, b) => a.z - b.z);
		return kids.map((el) => el.id);
	}

	/** All transitive descendants of an element (excluding itself). */
	descendantsOf(id: ElementId): Element[] {
		const out: Element[] = [];
		const stack = [...this.childrenOf(id)];
		while (stack.length) {
			const el = stack.pop();
			if (!el) continue;
			out.push(el);
			if (isContainerType(el.type)) stack.push(...this.childrenOf(el.id));
		}
		return out;
	}

	/** Walk ancestors from the element up to the root. */
	ancestorsOf(id: ElementId): Element[] {
		const out: Element[] = [];
		let cur = this.doc.elements[id]?.parentId ?? null;
		while (cur !== null) {
			const el = this.doc.elements[cur];
			if (!el) break;
			out.push(el);
			cur = el.parentId;
		}
		return out;
	}

	isAncestor(maybeAncestor: ElementId, of: ElementId): boolean {
		return this.ancestorsOf(of).some((el) => el.id === maybeAncestor);
	}

	private collectOrdered(): Element[] {
		const out: Element[] = [];
		const visit = (id: ElementId): void => {
			const el = this.doc.elements[id];
			if (!el) return;
			out.push(el);
			if (isContainerType(el.type)) {
				for (const child of this.childOrderOf(id)) visit(child);
			}
		};
		for (const id of this.doc.rootOrder) visit(id);
		// Defensive: include any orphan not reachable from rootOrder (e.g. parent removed).
		for (const el of Object.values(this.doc.elements)) {
			if (!out.includes(el)) out.push(el);
		}
		return out;
	}

	// ---- raw mutations ----------------------------------------------------------------------

	private touch(): void {
		this.revision++;
		this.dirty = true;
		this.doc.updatedAt = new Date().toISOString();
	}

	/** Replace the whole document (open/new/undo/redo). Clears selection. */
	replaceDocument(doc: LayoutDocument, { keepDirty = false }: { keepDirty?: boolean } = {}): void {
		this.doc = doc;
		this.selection = new SvelteSet();
		this.revision++;
		if (!keepDirty) this.dirty = false;
	}

	addElement(el: Element, index?: number): void {
		this.doc.elements[el.id] = el;
		if (el.parentId === null) {
			const order = this.doc.rootOrder;
			if (index === undefined || index >= order.length) order.push(el.id);
			else order.splice(Math.max(0, index), 0, el.id);
		}
		this.touch();
	}

	/** Add several elements (e.g. a pasted subtree) preserving their parent links. */
	addElements(els: Element[]): void {
		for (const el of els) {
			this.doc.elements[el.id] = el;
			if (el.parentId === null && !this.doc.rootOrder.includes(el.id)) {
				this.doc.rootOrder.push(el.id);
			}
		}
		this.touch();
	}

	/** Patch fields on an element (geometry, style, semantic props). Type-discriminant-safe. */
	updateElement(id: ElementId, patch: Partial<Element>): void {
		const el = this.doc.elements[id];
		if (!el) return;
		Object.assign(el, patch);
		this.touch();
	}

	/** Translate an element and its entire subtree by a world-space delta. */
	translateSubtree(id: ElementId, dx: number, dy: number): void {
		const root = this.doc.elements[id];
		if (!root) return;
		root.x += dx;
		root.y += dy;
		for (const desc of this.descendantsOf(id)) {
			desc.x += dx;
			desc.y += dy;
		}
		this.touch();
	}

	/** Remove an element and all descendants. Returns removed elements for undo payloads. */
	removeElement(id: ElementId): Element[] {
		const el = this.doc.elements[id];
		if (!el) return [];
		const removed = [el, ...this.descendantsOf(id)];
		for (const r of removed) {
			delete this.doc.elements[r.id];
			this.selection.delete(r.id);
		}
		this.doc.rootOrder = this.doc.rootOrder.filter((rid) => this.doc.elements[rid] !== undefined);
		this.touch();
		return removed;
	}

	/**
	 * Reparent an element under `newParentId` (null = root), preserving world position.
	 * Rejects cycles (cannot parent into own descendant). Child geometry is unchanged because
	 * all geometry is world-space.
	 */
	reparent(id: ElementId, newParentId: ElementId | null): boolean {
		const el = this.doc.elements[id];
		if (!el) return false;
		if (newParentId !== null) {
			if (newParentId === id) return false;
			const parent = this.doc.elements[newParentId];
			if (!parent || !isContainerType(parent.type)) return false;
			if (this.isAncestor(id, newParentId)) return false; // would create a cycle
		}
		const wasRoot = el.parentId === null;
		el.parentId = newParentId;
		if (newParentId === null && wasRoot === false) {
			if (!this.doc.rootOrder.includes(id)) this.doc.rootOrder.push(id);
		}
		if (newParentId !== null && wasRoot) {
			this.doc.rootOrder = this.doc.rootOrder.filter((rid) => rid !== id);
		}
		// Place at top of the new sibling group.
		el.z = this.nextZ(newParentId);
		this.touch();
		return true;
	}

	private nextZ(parentId: ElementId | null): number {
		const siblings = Object.values(this.doc.elements).filter((e) => e.parentId === parentId);
		return siblings.reduce((max, e) => Math.max(max, e.z), -1) + 1;
	}

	// ---- z-order ----------------------------------------------------------------------------

	bringForward(id: ElementId): void {
		this.reZOrder(id, +1);
	}
	sendBackward(id: ElementId): void {
		this.reZOrder(id, -1);
	}
	bringToFront(id: ElementId): void {
		const el = this.doc.elements[id];
		if (!el) return;
		el.z = this.nextZ(el.parentId);
		this.touch();
	}
	sendToBack(id: ElementId): void {
		const el = this.doc.elements[id];
		if (!el) return;
		const siblings = Object.values(this.doc.elements).filter(
			(e) => e.parentId === el.parentId && e.id !== id
		);
		const min = siblings.reduce((m, e) => Math.min(m, e.z), 1);
		el.z = min - 1;
		this.normalizeZ(el.parentId);
		this.touch();
	}

	private reZOrder(id: ElementId, dir: 1 | -1): void {
		const el = this.doc.elements[id];
		if (!el) return;
		const order = this.childOrderOf(el.parentId);
		const idx = order.indexOf(id);
		const swapWith = idx + dir;
		if (swapWith < 0 || swapWith >= order.length) return;
		const otherId = order[swapWith];
		if (otherId === undefined) return;
		const other = this.doc.elements[otherId];
		if (!other) return;
		const tmp = el.z;
		el.z = other.z;
		other.z = tmp;
		this.touch();
	}

	/** Re-pack z values of a sibling group to 0..n-1 preserving order. */
	private normalizeZ(parentId: ElementId | null): void {
		const order = this.childOrderOf(parentId);
		order.forEach((cid, i) => {
			const e = this.doc.elements[cid];
			if (e) e.z = i;
		});
	}

	// ---- selection --------------------------------------------------------------------------

	select(ids: Iterable<ElementId>): void {
		this.selection = new SvelteSet(ids);
	}
	selectOne(id: ElementId): void {
		this.selection = new SvelteSet([id]);
	}
	addToSelection(id: ElementId): void {
		this.selection.add(id);
	}
	toggleSelection(id: ElementId): void {
		if (this.selection.has(id)) this.selection.delete(id);
		else this.selection.add(id);
	}
	clearSelection(): void {
		if (this.selection.size > 0) this.selection = new SvelteSet();
	}
	selectAll(): void {
		this.selection = new SvelteSet(Object.keys(this.doc.elements));
	}
	isSelected(id: ElementId): boolean {
		return this.selection.has(id);
	}

	// ---- helpers ----------------------------------------------------------------------------

	/** World position of the centroid of a set of elements (for paste-offset, etc.). */
	centroidOf(ids: ElementId[]): Vec2 {
		let sx = 0;
		let sy = 0;
		let n = 0;
		for (const id of ids) {
			const el = this.doc.elements[id];
			if (!el) continue;
			sx += el.x + el.width / 2;
			sy += el.y + el.height / 2;
			n++;
		}
		return n === 0 ? { x: 0, y: 0 } : { x: sx / n, y: sy / n };
	}
}

/** Singleton scene graph for the editor session. */
export const scene = new SceneGraph();
