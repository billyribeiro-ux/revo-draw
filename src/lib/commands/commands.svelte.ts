/**
 * Typed, user-facing editor operations.
 *
 * Every mutation a user can trigger goes through here so it is (a) consistently wrapped in a
 * single history transaction and (b) discoverable in one place. UI (toolbar, panels, keyboard)
 * calls these; they never poke the scene graph directly for mutations.
 */
import type { SceneGraph } from '../canvas/scene-graph.svelte.ts';
import type { History } from './history.svelte.ts';
import { createElement, type CreateElementInit } from '../elements/defaults.ts';
import { uuidv7 } from '../elements/uuid.ts';
import { orientedBBox, unionBBox, type BBox } from '../canvas/geometry.ts';
import {
	isContainerType,
	type ClipboardPayload,
	type Element,
	type ElementByType,
	type ElementId,
	type ElementStyle,
	type LayoutIntent,
	type SemanticType
} from '../elements/types.ts';

export class Commands {
	#scene: SceneGraph;
	#history: History;

	constructor(scene: SceneGraph, history: History) {
		this.#scene = scene;
		this.#history = history;
	}

	get scene(): SceneGraph {
		return this.#scene;
	}
	get history(): History {
		return this.#history;
	}

	/** Create an element of a type at a world position, select it, return its id. */
	createAt<T extends SemanticType>(type: T, init: CreateElementInit): ElementId {
		const el = createElement(type, init);
		this.#history.transact(`Add ${type}`, () => {
			// Auto-parent into the deepest container under the drop point, if any.
			const parent = this.#findContainerAt(init.x + (el.width ?? 0) / 2, init.y + (el.height ?? 0) / 2, type);
			if (parent) {
				el.parentId = parent.id;
				el.z = this.#scene.childrenOf(parent.id).length;
			}
			this.#scene.addElement(el as Element);
			this.#scene.selectOne(el.id);
		});
		return el.id;
	}

	#findContainerAt(x: number, y: number, dropType: SemanticType): Element | undefined {
		// Topmost container that fully contains the point and isn't the same kind being dropped
		// as a frame-into-frame at root. Walk ordered front-to-back.
		const ordered = this.#scene.ordered;
		for (let i = ordered.length - 1; i >= 0; i--) {
			const el = ordered[i];
			if (!el) continue;
			if (!isContainerType(el.type)) continue;
			if (dropType === 'frame') continue; // frames live at root by default
			if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) {
				return el;
			}
		}
		return undefined;
	}

	deleteSelection(): void {
		const ids = [...this.#scene.selection];
		if (ids.length === 0) return;
		this.#history.transact(ids.length > 1 ? 'Delete elements' : 'Delete element', () => {
			for (const id of ids) this.#scene.removeElement(id);
			this.#scene.clearSelection();
		});
	}

	/** Delete a single element by id (used e.g. to discard an empty text box). */
	deleteById(id: ElementId, label = 'Delete element'): void {
		if (!this.#scene.has(id)) return;
		this.#history.transact(label, () => {
			this.#scene.removeElement(id);
			this.#scene.clearSelection();
		});
	}

	duplicateSelection(offset = 24): ElementId[] {
		const roots = this.#topLevelSelection();
		if (roots.length === 0) return [];
		const newIds: ElementId[] = [];
		this.#history.transact('Duplicate', () => {
			for (const root of roots) {
				const clones = this.#cloneSubtree(root.id, { dx: offset, dy: offset, parentId: root.parentId });
				this.#scene.addElements(clones);
				const newRoot = clones[0];
				if (newRoot) newIds.push(newRoot.id);
			}
			this.#scene.select(newIds);
		});
		return newIds;
	}

	/** Serialize the current selection (top-level subtrees) to a clipboard payload. */
	copySelection(): ClipboardPayload | null {
		const roots = this.#topLevelSelection();
		if (roots.length === 0) return null;
		const els: Element[] = [];
		for (const root of roots) {
			els.push(structuredClone($state.snapshot(root)) as Element);
			for (const d of this.#scene.descendantsOf(root.id)) {
				els.push(structuredClone($state.snapshot(d)) as Element);
			}
		}
		return { kind: 'layoutforge/elements', elements: els };
	}

	/** Paste a clipboard payload at an optional world offset; regenerates all ids. */
	paste(payload: ClipboardPayload, offset = 24): ElementId[] {
		if (payload.kind !== 'layoutforge/elements' || payload.elements.length === 0) return [];
		const idMap = new Map<ElementId, ElementId>();
		for (const el of payload.elements) idMap.set(el.id, uuidv7());
		const cloned: Element[] = payload.elements.map((el) => {
			const copy = structuredClone(el) as Element;
			copy.id = idMap.get(el.id) ?? uuidv7();
			copy.parentId = el.parentId !== null && idMap.has(el.parentId) ? idMap.get(el.parentId)! : null;
			copy.x += offset;
			copy.y += offset;
			return copy;
		});
		const newRootIds = cloned.filter((el) => el.parentId === null).map((el) => el.id);
		this.#history.transact('Paste', () => {
			this.#scene.addElements(cloned);
			this.#scene.select(newRootIds.length ? newRootIds : cloned.map((c) => c.id));
		});
		return newRootIds;
	}

	/** Nudge the selection by a world-space delta as one undo entry. */
	nudge(dx: number, dy: number): void {
		const roots = this.#topLevelSelection();
		if (roots.length === 0) return;
		this.#history.transact('Move', () => {
			for (const r of roots) this.#scene.translateSubtree(r.id, dx, dy);
		});
	}

	bringForward(): void {
		this.#zMutate('Bring forward', (id) => this.#scene.bringForward(id));
	}
	sendBackward(): void {
		this.#zMutate('Send backward', (id) => this.#scene.sendBackward(id));
	}
	bringToFront(): void {
		this.#zMutate('Bring to front', (id) => this.#scene.bringToFront(id));
	}
	sendToBack(): void {
		this.#zMutate('Send to back', (id) => this.#scene.sendToBack(id));
	}

	#zMutate(label: string, op: (id: ElementId) => void): void {
		const ids = [...this.#scene.selection];
		if (ids.length === 0) return;
		this.#history.transact(label, () => ids.forEach(op));
	}

	reparent(id: ElementId, newParentId: ElementId | null): void {
		this.#history.transact('Reparent', () => {
			this.#scene.reparent(id, newParentId);
		});
	}

	/** Patch arbitrary fields on an element (used by the inspector). */
	patch(id: ElementId, patch: Partial<Element>, label = 'Edit'): void {
		this.#history.transact(label, () => this.#scene.updateElement(id, patch));
	}

	/**
	 * Apply a style patch to EVERY selected element as one undo entry (Excalidraw's
	 * change-property-on-selection flow). Merges into each element's existing style.
	 */
	setStyleOnSelection(stylePatch: Partial<ElementStyle>, label = 'Edit style'): void {
		const ids = [...this.#scene.selection];
		if (ids.length === 0) return;
		this.#history.transact(label, () => {
			for (const id of ids) {
				const el = this.#scene.get(id);
				if (!el) continue;
				this.#scene.updateElement(id, { style: { ...el.style, ...stylePatch } });
			}
		});
	}

	/** Patch the layout intent of a container element. */
	patchLayout(id: ElementId, layoutPatch: Partial<LayoutIntent>, label = 'Edit layout'): void {
		const el = this.#scene.get(id);
		if (!el) return;
		const next: LayoutIntent = { mode: 'flow', ...el.layout, ...layoutPatch };
		this.#history.transact(label, () => this.#scene.updateElement(id, { layout: next }));
	}

	/** Set an element's semantic type, migrating to that type's defaults where needed. */
	changeType<T extends SemanticType>(id: ElementId, type: T): void {
		const el = this.#scene.get(id);
		if (!el) return;
		const replacement = createElement(type, {
			x: el.x,
			y: el.y,
			width: el.width,
			height: el.height,
			parentId: el.parentId,
			z: el.z,
			label: el.label
		}) as ElementByType[T];
		replacement.id = el.id;
		if (el.style) replacement.style = { ...replacement.style, ...el.style };
		this.#history.transact('Change type', () => {
			this.#scene.updateElement(id, replacement as Partial<Element>);
		});
	}

	// ---- alignment (Excalidraw alignElements) -----------------------------------------------

	/**
	 * Align the selection along one axis. Each top-level selected root (with its whole subtree) is
	 * translated so its bounding box's start/center/end matches the selection's overall bounding
	 * box. Mirrors Excalidraw's `alignElements` / `calculateTranslation`, operating on our
	 * containment roots in place of Excalidraw's groups. No-op for fewer than 2 roots.
	 */
	align(axis: 'x' | 'y', position: 'start' | 'center' | 'end'): void {
		const roots = this.#topLevelSelection();
		if (roots.length < 2) return;
		const boxes = this.#rootBounds(roots);
		const sel = unionBBox([...boxes.values()]);
		const selMin = axis === 'x' ? sel.x : sel.y;
		const selMax = axis === 'x' ? sel.x + sel.width : sel.y + sel.height;
		this.#history.transact('Align', () => {
			for (const root of roots) {
				const b = boxes.get(root.id)!;
				const min = axis === 'x' ? b.x : b.y;
				const max = axis === 'x' ? b.x + b.width : b.y + b.height;
				let delta: number;
				if (position === 'start') delta = selMin - min;
				else if (position === 'end') delta = selMax - max;
				else delta = (selMin + selMax) / 2 - (min + max) / 2;
				if (delta !== 0) this.#scene.translateSubtree(root.id, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
			}
		});
	}

	// ---- distribute (Excalidraw distributeElements, gap variant) -----------------------------

	/**
	 * Distribute the selection so the GAPS between consecutive roots are equal along one axis
	 * (Excalidraw's "distribute from gaps"). Sort roots by their box mid-point, then walk a running
	 * position. The two extreme roots stay put; interior roots are re-spaced. Needs ≥3 roots.
	 */
	distribute(axis: 'x' | 'y'): void {
		const roots = this.#topLevelSelection();
		if (roots.length < 3) return;
		const boxes = this.#rootBounds(roots);
		const extentOf = (b: BBox) => (axis === 'x' ? b.width : b.height);
		const startOf = (b: BBox) => (axis === 'x' ? b.x : b.y);
		const midOf = (b: BBox) => (axis === 'x' ? b.x + b.width / 2 : b.y + b.height / 2);
		const sorted = roots.slice().sort((a, b) => midOf(boxes.get(a.id)!) - midOf(boxes.get(b.id)!));
		const sel = unionBBox([...boxes.values()]);
		const selExtent = axis === 'x' ? sel.width : sel.height;
		let span = 0;
		for (const r of sorted) span += extentOf(boxes.get(r.id)!);
		const step = (selExtent - span) / (sorted.length - 1);
		this.#history.transact('Distribute', () => {
			let pos = startOf(sel);
			for (const root of sorted) {
				const b = boxes.get(root.id)!;
				const delta = pos - startOf(b);
				if (delta !== 0) this.#scene.translateSubtree(root.id, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
				pos += step + extentOf(b);
			}
		});
	}

	// ---- flip (Excalidraw flipHorizontal / flipVertical) -------------------------------------

	/**
	 * Mirror the selection about its bounding-box center on one axis. Each root's whole subtree is
	 * reflected: x' = 2*cx - (x + width) so the box lands on the mirror-image side. (Element content
	 * is not internally mirrored — semantic UI elements have no chirality — but position mirrors,
	 * which is the meaningful operation for a layout.)
	 */
	flip(axis: 'x' | 'y'): void {
		const roots = this.#topLevelSelection();
		if (roots.length === 0) return;
		const boxes = this.#rootBounds(roots);
		const sel = unionBBox([...boxes.values()]);
		const center = axis === 'x' ? sel.x + sel.width / 2 : sel.y + sel.height / 2;
		this.#history.transact('Flip', () => {
			for (const root of roots) {
				const b = boxes.get(root.id)!;
				if (axis === 'x') {
					const newX = 2 * center - (b.x + b.width);
					this.#scene.translateSubtree(root.id, newX - b.x, 0);
				} else {
					const newY = 2 * center - (b.y + b.height);
					this.#scene.translateSubtree(root.id, 0, newY - b.y);
				}
			}
		});
	}

	// ---- lock / unlock (Excalidraw toggleElementLock / unlockAllElements) --------------------

	/** Toggle the `locked` flag on every selected element. Locked elements resist selection/edit. */
	toggleLockSelection(): void {
		const ids = [...this.#scene.selection];
		if (ids.length === 0) return;
		const anyUnlocked = ids.some((id) => !this.#scene.get(id)?.locked);
		this.#history.transact(anyUnlocked ? 'Lock' : 'Unlock', () => {
			for (const id of ids) this.#scene.updateElement(id, { locked: anyUnlocked });
		});
	}

	/** Unlock every element in the document. */
	unlockAll(): void {
		const lockedIds = this.#scene.ordered.filter((el) => el.locked).map((el) => el.id);
		if (lockedIds.length === 0) return;
		this.#history.transact('Unlock all', () => {
			for (const id of lockedIds) this.#scene.updateElement(id, { locked: false });
		});
	}

	// ---- copy / paste styles (Excalidraw copyStyles / pasteStyles) ---------------------------

	/** Capture the primary (last) selected element's style for later paste. Null if no selection. */
	copyStyles(): ElementStyle | null {
		const els = this.#scene.selectedElements;
		const primary = els[els.length - 1];
		if (!primary?.style) return null;
		return structuredClone($state.snapshot(primary.style)) as ElementStyle;
	}

	/** Apply a previously-copied style to every selected element. */
	pasteStyles(style: ElementStyle): void {
		const ids = [...this.#scene.selection];
		if (ids.length === 0) return;
		this.#history.transact('Paste styles', () => {
			for (const id of ids) {
				const el = this.#scene.get(id);
				if (!el) continue;
				this.#scene.updateElement(id, { style: { ...el.style, ...style } });
			}
		});
	}

	// ---- helpers ----------------------------------------------------------------------------

	/** Map each top-level root id → the world-space union bbox of its whole subtree. */
	#rootBounds(roots: Element[]): Map<ElementId, BBox> {
		const out = new Map<ElementId, BBox>();
		for (const root of roots) {
			const subtree = [root, ...this.#scene.descendantsOf(root.id)];
			out.set(root.id, unionBBox(subtree.map((el) => orientedBBox(el, el.rotation))));
		}
		return out;
	}

	/** Selected elements whose parents are NOT also selected (gesture roots). */
	#topLevelSelection(): Element[] {
		const sel = this.#scene.selection;
		return this.#scene.selectedElements.filter((el) => el.parentId === null || !sel.has(el.parentId));
	}

	#cloneSubtree(
		rootId: ElementId,
		opts: { dx: number; dy: number; parentId: ElementId | null }
	): Element[] {
		const root = this.#scene.get(rootId);
		if (!root) return [];
		const idMap = new Map<ElementId, ElementId>();
		const all = [root, ...this.#scene.descendantsOf(rootId)];
		for (const el of all) idMap.set(el.id, uuidv7());
		return all.map((el, i) => {
			const copy = structuredClone($state.snapshot(el)) as Element;
			copy.id = idMap.get(el.id)!;
			copy.x += opts.dx;
			copy.y += opts.dy;
			if (i === 0) {
				copy.parentId = opts.parentId;
			} else {
				copy.parentId = el.parentId !== null ? (idMap.get(el.parentId) ?? null) : null;
			}
			return copy;
		});
	}
}
