/**
 * Typed, user-facing editor operations.
 *
 * Every mutation a user can trigger goes through here so it is (a) consistently wrapped in a
 * single history transaction and (b) discoverable in one place. UI (toolbar, panels, keyboard)
 * calls these; they never poke the scene graph directly for mutations.
 */
import type { SceneGraph } from '../canvas/scene-graph.svelte.js';
import type { History } from './history.svelte.js';
import { createElement, type CreateElementInit } from '../elements/defaults.js';
import { uuidv7 } from '../elements/uuid.js';
import {
	isContainerType,
	type ClipboardPayload,
	type Element,
	type ElementByType,
	type ElementId,
	type ElementStyle,
	type LayoutIntent,
	type SemanticType
} from '../elements/types.js';

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

	// ---- helpers ----------------------------------------------------------------------------

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
