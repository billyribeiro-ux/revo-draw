/**
 * The editor controller: the brain that wires scene graph + camera + history + commands together
 * and owns all transient interaction state (active tool, in-flight drag/resize/rotate/marquee,
 * snap guides, the text-edit target). Svelte components are thin: they translate DOM events into
 * calls on this controller and read its reactive state to render overlays.
 *
 * Pointer math is done entirely in WORLD coordinates (the camera converts once at the boundary),
 * so every interaction behaves identically at any pan/zoom. Gestures are wrapped in a single
 * history transaction (begin on pointerdown, commit on pointerup) so a whole drag = one undo.
 */
import { isWeb } from '../platform.ts';
import { Camera } from './camera.svelte.ts';
import { scene, type SceneGraph } from './scene-graph.svelte.ts';
import { History } from '../commands/history.svelte.ts';
import { Commands } from '../commands/commands.svelte.ts';
import {
	clamp,
	orientedBBox,
	rotate,
	type BBox,
	type Vec2
} from './geometry.ts';
import {
	hitHandle,
	hitTestMarquee,
	hitTestPoint,
	marqueeRect,
	orientedHandles,
	selectionHandles,
	type Handle,
	type HandleKind
} from './hit-test.ts';
import { resolveSnap, type SnapGuide } from './snapping.ts';
import { isContainerType, type ClipboardPayload, type Element, type ElementId, type SemanticType } from '../elements/types.ts';
import { createElement } from '../elements/defaults.ts';

export type Tool =
	| 'select'
	| 'hand'
	| 'eraser'
	| 'frame'
	| 'container'
	| 'card'
	| 'nav'
	| 'sidebar'
	| 'text'
	| 'button'
	| 'input'
	| 'table'
	| 'chart'
	| 'image'
	| 'list'
	| 'tabs'
	| 'modal'
	| 'icon'
	| 'divider'
	| 'svg'
	// Form controls (Phase E)
	| 'checkbox'
	| 'radio'
	| 'toggle'
	| 'slider'
	| 'dropdown'
	// Data display (Phase E)
	| 'stat-card'
	| 'badge'
	| 'progress'
	| 'avatar'
	// Feedback + navigation (Phase E)
	| 'alert'
	| 'tooltip'
	| 'breadcrumb'
	| 'pagination'
	| 'stepper'
	| 'accordion'
	// Layout + marketing (Phase E)
	| 'section-header'
	| 'hero'
	| 'feature-grid'
	| 'testimonial'
	| 'cta-section';

type DragMode =
	| { kind: 'none' }
	| { kind: 'pan'; lastScreen: Vec2 }
	| { kind: 'marquee'; startWorld: Vec2; additive: boolean }
	| { kind: 'move'; startWorld: Vec2; lastWorld: Vec2; moved: boolean }
	| {
			kind: 'erase';
			/** Ids deleted in this gesture, so a single drag-stroke is one undo entry. */
			erased: Set<ElementId>;
	  }
	| {
			kind: 'resize';
			handle: HandleKind;
			startWorld: Vec2;
			origin: BBox;
			origins: Map<ElementId, BBox>;
			aspect: boolean;
			/** Set when a single rotated element is resized in its own local frame. */
			sole: { id: ElementId; box: BBox; rotation: number } | null;
	  }
	| { kind: 'rotate'; center: Vec2; startAngle: number; origins: Map<ElementId, number> }
	| {
			kind: 'create';
			type: SemanticType;
			startWorld: Vec2;
			id: ElementId | null;
			/** True once the pointer has dragged past the threshold (element is being sized by drag). */
			dragged: boolean;
			/** The type's default size, applied on pointerup if the user only clicked (no drag). */
			defaultWidth: number;
			defaultHeight: number;
	  };

const HANDLE_SCREEN_PX = 9; // size + hit radius of transform handles
const ROTATE_OFFSET_SCREEN = 26;
const SNAP_SCREEN_PX = 6;
const MIN_SIZE = 4;
/** Click-vs-drag travel threshold in screen px before a move actually moves. Matches Excalidraw
 * (`common/src/constants.ts:19` `DRAGGING_THRESHOLD = 10`). */
const DRAG_THRESHOLD_PX = 10;

export class Editor {
	readonly scene: SceneGraph = scene;
	readonly camera = new Camera();
	readonly history = new History(this.scene);
	readonly commands = new Commands(this.scene, this.history);

	tool = $state<Tool>('select');
	/** When true, a creation tool stays active after drawing (Excalidraw's 🔒 lock). Default off. */
	toolLocked = $state(false);
	/**
	 * Last-used style — new elements adopt it, and the style panel writes here so the next shape
	 * keeps the chosen look (Excalidraw's `currentItem*` pattern). Empty means "use type defaults".
	 */
	currentStyle = $state<Partial<import('../elements/types.ts').ElementStyle>>({});
	/** When set, snapping is bypassed (alt held during a MOVE gesture). */
	snapBypass = $state(false);
	/** Whether space is held (pan mode hint for the cursor). */
	spaceHeld = $state(false);
	/** Dot-grid visibility (Excalidraw `actionToggleGridMode.tsx`, ⌘'). Off by default in the web
	 * build to match Excalidraw's plain-white canvas; on in the Tauri desktop build. */
	gridVisible = $state(!isWeb);
	/** Live shift state during a gesture (drives rotate-to-15° snap, Excalidraw `shouldRotateWithDiscreteAngle`). */
	#shiftHeld = false;
	/** Live alt state during create/resize (drives "expand from center/anchor", Excalidraw `shouldResizeFromCenter`). */
	#altHeld = false;
	/**
	 * Reactive flag, true for the duration of any active pointer gesture (create/move/resize/
	 * rotate/marquee/pan). The style panel reads this to stay hidden while you're drawing — style
	 * controls should only appear/apply once the gesture has stopped.
	 */
	gestureActive = $state(false);

	/** Pending icon to place when the icon tool is used (set by the icon picker). */
	pendingIcon = $state<{ name: string; svgPath: string; viewBox: string } | null>(null);

	/**
	 * Side-panel visibility (Layers tree + Inspector). Both default CLOSED so the canvas owns the
	 * full viewport on load — matching Excalidraw, where the Layers sidebar starts closed
	 * (`openSidebar: null`) and the Inspector mounts only contextually. The Inspector additionally
	 * auto-reveals on selection (Excalidraw's `showSelectedShapeActions` rule); these flags are the
	 * user's *explicit* open/close intent layered on top of that.
	 */
	layersOpen = $state(false);
	inspectorPinned = $state(false);

	toggleLayers(): void {
		this.layersOpen = !this.layersOpen;
	}
	toggleInspector(): void {
		this.inspectorPinned = !this.inspectorPinned;
	}

	/** Live overlay state read by the renderer. */
	marquee = $state<BBox | null>(null);
	guides = $state<SnapGuide[]>([]);
	dropTargetId = $state<ElementId | null>(null);

	/** The element currently being text-edited (double-click), or null. */
	editingTextId = $state<ElementId | null>(null);

	/** Live world-space cursor position (for the status bar). */
	cursorWorld = $state<Vec2>({ x: 0, y: 0 });

	/** Internal clipboard (also mirrors the OS clipboard via the Canvas component). */
	clipboard: ClipboardPayload | null = null;

	#drag: DragMode = { kind: 'none' };

	// Derived helpers in screen units the renderer needs.
	get handleSizeWorld(): number {
		return this.camera.screenDistanceToWorld(HANDLE_SCREEN_PX);
	}
	get rotateOffsetWorld(): number {
		return this.camera.screenDistanceToWorld(ROTATE_OFFSET_SCREEN);
	}

	get isPanning(): boolean {
		return this.#drag.kind === 'pan';
	}
	get isInteracting(): boolean {
		return this.#drag.kind !== 'none';
	}

	/**
	 * When exactly one element is selected, the transform applies to THAT element — including its
	 * rotation. Returns it iff it's the sole selection, so resize/handles can use its local frame.
	 */
	get soleSelected(): Element | null {
		if (this.scene.selection.size !== 1) return null;
		const els = this.scene.selectedElements;
		return els.length === 1 ? (els[0] ?? null) : null;
	}

	/**
	 * The active transform handles. For a single element they sit on its (possibly rotated) box;
	 * for a multi-selection they sit on the axis-aligned union bounds.
	 */
	currentHandles(): Handle[] {
		const sole = this.soleSelected;
		if (sole) return orientedHandles(sole, sole.rotation, this.rotateOffsetWorld);
		const bounds = this.scene.selectionBounds;
		return bounds ? selectionHandles(bounds, this.rotateOffsetWorld) : [];
	}

	// ---- tool selection ---------------------------------------------------------------------

	setTool(tool: Tool): void {
		this.tool = tool;
		if (tool !== 'select') this.editingTextId = null;
	}

	// ---- pointer lifecycle ------------------------------------------------------------------

	/** screen = CSS px relative to canvas top-left. */
	pointerDown(screen: Vec2, opts: { shift: boolean; alt: boolean; space: boolean; middle: boolean }): void {
		this.#pointerDownImpl(screen, opts);
		// A gesture is now active if any drag mode was established. The style panel hides while true.
		this.gestureActive = this.#drag.kind !== 'none';
	}

	#pointerDownImpl(
		screen: Vec2,
		opts: { shift: boolean; alt: boolean; space: boolean; middle: boolean }
	): void {
		this.snapBypass = opts.alt;
		this.#altHeld = opts.alt;
		this.#shiftHeld = opts.shift;
		const world = this.camera.toWorld(screen);

		// Pan: the Hand tool (H), space-drag, or middle button.
		if (this.tool === 'hand' || opts.space || opts.middle) {
			this.#drag = { kind: 'pan', lastScreen: screen };
			return;
		}

		// Eraser tool (Excalidraw `actionCanvas.tsx:528` `keyTest: KEYS.E`): start a drag-delete
		// gesture. Every element the pointer touches while held is removed; the whole stroke is one
		// undo entry. The first hit fires here on pointerdown so a click-without-drag still deletes.
		if (this.tool === 'eraser') {
			this.history.begin('Erase');
			this.#drag = { kind: 'erase', erased: new Set() };
			this.#eraseAt(world);
			return;
		}

		// Text tool (Excalidraw `handleTextOnPointerDown`): don't drag-to-size — drop a text element
		// at the click and immediately enter the inline editor so you can type right away.
		if (this.tool === 'text') {
			this.#createTextAndEdit(world);
			return;
		}

		// Other creation tools: start a rubber-band create (or click-to-place default size).
		if (this.tool !== 'select') {
			this.#beginCreate(world);
			return;
		}

		// Transform handle hit?
		if (this.scene.selection.size > 0) {
			const handles = this.currentHandles();
			const radius = this.camera.screenDistanceToWorld(HANDLE_SCREEN_PX);
			const handle = hitHandle(handles, world, radius);
			if (handle) {
				const bounds = this.scene.selectionBounds;
				if (handle.kind === 'rotate') {
					// Only consume the event if a rotate gesture actually starts. With a stale selection
					// (ids present but elements gone) bounds is null — fall through to normal hit/marquee
					// instead of swallowing the click.
					if (bounds) {
						this.#beginRotate(world, bounds);
						return;
					}
				} else {
					this.#beginResize(handle.kind, world, opts.shift);
					return;
				}
			}
		}

		// Element hit?
		const hit = hitTestPoint(this.scene.ordered, world);
		if (hit) {
			if (opts.shift) {
				this.scene.toggleSelection(hit.id);
			} else if (!this.scene.isSelected(hit.id)) {
				this.scene.selectOne(hit.id);
			}
			// Start a move of the current selection.
			if (this.scene.selection.size > 0) {
				this.history.begin('Move');
				this.#drag = { kind: 'move', startWorld: world, lastWorld: world, moved: false };
			}
			return;
		}

		// Empty space → marquee select.
		if (!opts.shift) this.scene.clearSelection();
		this.#drag = { kind: 'marquee', startWorld: world, additive: opts.shift };
	}

	pointerMove(screen: Vec2, opts: { alt: boolean; shift: boolean }): void {
		// Alt has two meanings depending on the active gesture, matching Excalidraw:
		//   - move:           alt = bypass snap (`snapBypass` field, read by `#applySnap`)
		//   - create/resize:  alt = expand from center/anchor (`shouldResizeFromCenter`)
		// Shift drives rotate-to-15° snap (Excalidraw `shouldRotateWithDiscreteAngle`).
		this.snapBypass = opts.alt;
		this.#altHeld = opts.alt;
		this.#shiftHeld = opts.shift;
		const world = this.camera.toWorld(screen);
		this.cursorWorld = world;

		switch (this.#drag.kind) {
			case 'pan': {
				const dx = screen.x - this.#drag.lastScreen.x;
				const dy = screen.y - this.#drag.lastScreen.y;
				this.camera.panBy(dx, dy);
				this.#drag.lastScreen = screen;
				break;
			}
			case 'marquee': {
				this.marquee = marqueeRect(this.#drag.startWorld, world);
				const ids = hitTestMarquee(this.scene.ordered, this.marquee);
				if (this.#drag.additive) {
					const next = new Set(this.scene.selection);
					for (const id of ids) next.add(id);
					this.scene.select(next);
				} else {
					this.scene.select(ids);
				}
				break;
			}
			case 'move': {
				// Click-vs-drag threshold (Excalidraw uses 10px). Until the pointer travels past it,
				// treat the gesture as a click — don't nudge the element on a jittery click.
				if (!this.#drag.moved) {
					const distScreen =
						Math.hypot(world.x - this.#drag.startWorld.x, world.y - this.#drag.startWorld.y) *
						this.camera.zoom;
					if (distScreen < DRAG_THRESHOLD_PX) break;
				}
				let dx = world.x - this.#drag.lastWorld.x;
				let dy = world.y - this.#drag.lastWorld.y;
				if (dx === 0 && dy === 0) break;
				this.#drag.moved = true;

				// Snap the primary (first) selected element's box; apply the resulting delta to all.
				if (!this.snapBypass) {
					const snapped = this.#applySnap(dx, dy);
					dx = snapped.dx;
					dy = snapped.dy;
				} else {
					this.guides = [];
				}

				for (const el of this.#moveRoots()) this.scene.translateSubtree(el.id, dx, dy);
				this.#drag.lastWorld = { x: this.#drag.lastWorld.x + dx, y: this.#drag.lastWorld.y + dy };

				// Reparent drop-target preview.
				this.dropTargetId = this.#dropTargetUnder(world);
				break;
			}
			case 'resize':
				this.#updateResize(world);
				break;
			case 'rotate':
				this.#updateRotate(world);
				break;
			case 'create':
				this.#updateCreate(world);
				break;
			case 'erase':
				this.#eraseAt(world);
				break;
			case 'none':
				break;
		}
	}

	pointerUp(): void {
		const drag = this.#drag;
		this.#drag = { kind: 'none' };
		this.gestureActive = false;
		this.marquee = null;
		this.guides = [];

		switch (drag.kind) {
			case 'move': {
				const dropId = this.dropTargetId;
				this.dropTargetId = null;
				if (dropId) {
					for (const el of this.#moveRoots()) {
						// Only reparent when the target actually differs from the current parent and
						// isn't the element itself or one of its descendants (cycle-safe).
						if (
							el.id !== dropId &&
							el.parentId !== dropId &&
							!this.scene.isAncestor(el.id, dropId)
						) {
							this.scene.reparent(el.id, dropId);
						}
					}
				}
				// commit() in both cases: if nothing actually moved, commit detects no document
				// change and discards the transaction WITHOUT restoring the baseline — which is
				// crucial, because cancel() would replaceDocument and wipe the click's selection.
				this.history.commit();
				break;
			}
			case 'create': {
				const el = drag.id ? this.scene.get(drag.id) : undefined;
				if (el) {
					// A click with no drag → place the element at its default size, centered on the
					// click point (so a single click still drops a usable shape).
					if (!drag.dragged) {
						this.scene.updateElement(el.id, {
							x: drag.startWorld.x - drag.defaultWidth / 2,
							y: drag.startWorld.y - drag.defaultHeight / 2,
							width: drag.defaultWidth,
							height: drag.defaultHeight
						});
					}
					this.history.commit();
				} else {
					this.history.cancel();
				}
				break;
			}
			case 'resize':
			case 'rotate':
				this.history.commit();
				break;
			case 'erase':
				// Empty erase-stroke (clicked on nothing) commits as a no-op — history.commit()
				// detects no document change and discards the transaction silently.
				this.history.commit();
				break;
			case 'pan':
			case 'marquee':
			case 'none':
				break;
		}
	}

	/** Abort the current gesture (Escape). Also exits a sticky creation tool back to Select. */
	cancelGesture(): void {
		if (
			this.#drag.kind === 'move' ||
			this.#drag.kind === 'resize' ||
			this.#drag.kind === 'rotate' ||
			this.#drag.kind === 'create' ||
			this.#drag.kind === 'erase'
		) {
			this.history.cancel();
		}
		if (this.tool !== 'select') {
			this.tool = 'select';
			this.pendingIcon = null;
		}
		this.#drag = { kind: 'none' };
		this.gestureActive = false;
		this.marquee = null;
		this.guides = [];
		this.dropTargetId = null;
	}

	// ---- creation ---------------------------------------------------------------------------

	/**
	 * Text tool: create a text element at the click and immediately enter inline editing — mirrors
	 * Excalidraw's `handleTextOnPointerDown` + `startTextEditing` (no drag-to-size for text). The
	 * tool reverts to select afterward unless the lock is engaged.
	 */
	#createTextAndEdit(world: Vec2): void {
		const def = createElement('text', { x: 0, y: 0 });
		const el = createElement('text', {
			x: world.x - def.width / 2,
			y: world.y - def.height / 2
		});
		if (Object.keys(this.currentStyle).length > 0) el.style = { ...el.style, ...this.currentStyle };
		// New text starts empty so the placeholder/caret is ready for typing.
		el.content = '';
		const parent = this.#dropTargetUnder(world);
		if (parent) {
			el.parentId = parent;
			el.z = this.scene.childrenOf(parent).length;
		}
		this.history.transact('Add text', () => {
			this.scene.addElement(el as Element);
			this.scene.selectOne(el.id);
		});
		this.editingTextId = el.id;
		if (!this.toolLocked) this.tool = 'select';
	}

	#beginCreate(world: Vec2): void {
		const type = this.tool as SemanticType;
		this.history.begin(`Add ${type}`);
		// EXCALIDRAW MODEL: the new element starts at the click point with ZERO size. It grows only
		// while the pointer is dragged (sized by distance from the origin). If the user just clicks
		// without dragging, pointerUp gives it the type's default size at the click. This removes the
		// "pop at full size, then jump to drag size" glitch the old centered-default approach caused.
		const defaults = createElement(type, { x: 0, y: 0 });
		const el =
			type === 'icon' && this.pendingIcon
				? this.#makeIcon(world)
				: createElement(type, { x: world.x, y: world.y, width: 0, height: 0 });
		// Adopt the last-used style so consecutive shapes keep the chosen look.
		if (Object.keys(this.currentStyle).length > 0) {
			el.style = { ...el.style, ...this.currentStyle };
		}
		// Auto-parent into a container under the point (except frames, which live at root).
		if (type !== 'frame') {
			const parent = this.#dropTargetUnder(world);
			if (parent) {
				el.parentId = parent;
				el.z = this.scene.childrenOf(parent).length;
			}
		}
		this.scene.addElement(el as Element);
		this.scene.selectOne(el.id);
		this.#drag = {
			kind: 'create',
			type,
			startWorld: world,
			id: el.id,
			dragged: false,
			defaultWidth: defaults.width,
			defaultHeight: defaults.height
		};
	}

	#makeIcon(world: Vec2): Element {
		const icon = this.pendingIcon!;
		const el = createElement('icon', { x: world.x, y: world.y, width: 0, height: 0 });
		el.iconName = icon.name;
		el.svgPath = icon.svgPath;
		el.viewBox = icon.viewBox;
		return el;
	}

	#updateCreate(world: Vec2): void {
		if (this.#drag.kind !== 'create' || !this.#drag.id) return;
		const el = this.scene.get(this.#drag.id);
		if (!el) return;
		// dragNewElement (Excalidraw): width/height are the absolute distance from the origin;
		// dragging up/left anchors the corner so the box grows from the click point in any direction.
		const w = Math.abs(world.x - this.#drag.startWorld.x);
		const h = Math.abs(world.y - this.#drag.startWorld.y);
		const distScreen = Math.hypot(w, h) * this.camera.zoom;
		if (distScreen >= DRAG_THRESHOLD_PX) this.#drag.dragged = true;
		if (!this.#drag.dragged) return;

		// Alt = expand symmetrically from the click point (Excalidraw `shouldResizeFromCenter`,
		// `dragElements.ts:299-304`): the rect's CENTER stays at the click, width/height double.
		const fromCenter = this.#altHeld;
		const drawW = fromCenter ? w * 2 : w;
		const drawH = fromCenter ? h * 2 : h;

		// A divider is a 1-D line: it follows the DOMINANT drag axis and stays 1px on the cross axis,
		// so dragging never inflates it into a thick box (thickness is the stroke weight, set in the
		// renderer). Its orientation is the longer axis of the drag.
		if (this.#drag.type === 'divider') {
			const vertical = drawH >= drawW;
			const ox = fromCenter ? this.#drag.startWorld.x : Math.min(this.#drag.startWorld.x, world.x);
			const oy = fromCenter ? this.#drag.startWorld.y : Math.min(this.#drag.startWorld.y, world.y);
			this.scene.updateElement(el.id, {
				x: vertical ? this.#drag.startWorld.x : ox,
				y: vertical ? oy : this.#drag.startWorld.y,
				width: vertical ? 1 : Math.max(1, drawW),
				height: vertical ? Math.max(1, drawH) : 1,
				orientation: vertical ? 'vertical' : 'horizontal'
			} as Partial<Element>);
			return;
		}

		const ox = fromCenter
			? this.#drag.startWorld.x - drawW / 2
			: Math.min(this.#drag.startWorld.x, world.x);
		const oy = fromCenter
			? this.#drag.startWorld.y - drawH / 2
			: Math.min(this.#drag.startWorld.y, world.y);
		this.scene.updateElement(el.id, {
			x: ox,
			y: oy,
			width: Math.max(1, drawW),
			height: Math.max(1, drawH)
		});
	}

	/**
	 * Eraser stroke hit-test: delete the topmost element under `world` if any, and remember it so
	 * subsequent pointer moves don't try to re-delete the same id (already-gone). The whole stroke
	 * collapses into one undo entry via the gesture's history transaction. Locked elements are
	 * skipped (same rule as the regular hit-test — locks the eraser too).
	 */
	#eraseAt(world: Vec2): void {
		if (this.#drag.kind !== 'erase') return;
		const hit = hitTestPoint(this.scene.ordered, world);
		if (!hit || this.#drag.erased.has(hit.id)) return;
		this.#drag.erased.add(hit.id);
		this.scene.removeElement(hit.id);
	}

	/**
	 * After a create gesture, revert to the Select tool — matching Excalidraw's default, where a
	 * tool draws one shape then hands back to selection. If the tool lock (🔒) is engaged, the tool
	 * stays active so several elements can be placed in a row. The icon tool always reverts and
	 * clears its pending icon.
	 */
	finishCreate(): void {
		if (this.tool === 'icon') {
			this.tool = 'select';
			this.pendingIcon = null;
			return;
		}
		if (!this.toolLocked) this.tool = 'select';
	}

	toggleToolLock(): void {
		this.toolLocked = !this.toolLocked;
	}

	// ---- move / snapping --------------------------------------------------------------------

	#moveRoots(): Element[] {
		const sel = this.scene.selection;
		return this.scene.selectedElements.filter(
			(el) => el.parentId === null || !sel.has(el.parentId)
		);
	}

	#applySnap(dx: number, dy: number): { dx: number; dy: number } {
		const roots = this.#moveRoots();
		const primary = roots[0];
		if (!primary) return { dx, dy };
		const cand: BBox = {
			x: primary.x + dx,
			y: primary.y + dy,
			width: primary.width,
			height: primary.height
		};
		const selIds = new Set(this.scene.selection);
		const others: BBox[] = this.scene.ordered
			.filter((el) => !selIds.has(el.id) && !el.hidden)
			.map((el) => orientedBBox(el, el.rotation));
		const threshold = this.camera.screenDistanceToWorld(SNAP_SCREEN_PX);
		const res = resolveSnap(cand, others, {
			thresholdWorld: threshold,
			spacingToleranceWorld: threshold
		});
		this.guides = res.guides;
		return { dx: dx + (res.x - cand.x), dy: dy + (res.y - cand.y) };
	}

	#dropTargetUnder(world: Vec2): ElementId | null {
		const selIds = new Set(this.scene.selection);
		// Don't treat the moving elements' own descendants as drop targets (would create a cycle),
		// and don't highlight a container that ALL moving roots already live in (an in-place move).
		const roots = this.#moveRoots();
		const movingParents = new Set(roots.map((r) => r.parentId));
		const sameParentForAll = movingParents.size === 1;
		const currentParent = sameParentForAll ? [...movingParents][0] : undefined;

		for (let i = this.scene.ordered.length - 1; i >= 0; i--) {
			const el = this.scene.ordered[i];
			if (!el || !isContainerType(el.type) || selIds.has(el.id)) continue;
			// Skip descendants of any moving element.
			if (roots.some((r) => this.scene.isAncestor(r.id, el.id))) continue;
			// Skip the container the moving elements are already in.
			if (sameParentForAll && el.id === currentParent) continue;
			if (
				world.x >= el.x &&
				world.x <= el.x + el.width &&
				world.y >= el.y &&
				world.y <= el.y + el.height
			) {
				return el.id;
			}
		}
		return null;
	}

	// ---- resize -----------------------------------------------------------------------------

	#beginResize(handle: HandleKind, world: Vec2, aspect: boolean): void {
		this.history.begin('Resize');
		const origins = new Map<ElementId, BBox>();
		for (const el of this.scene.selectedElements) {
			origins.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height });
		}
		const sole = this.soleSelected;
		const bounds = this.scene.selectionBounds ?? { x: 0, y: 0, width: 1, height: 1 };
		this.#drag = {
			kind: 'resize',
			handle,
			startWorld: world,
			origin: { ...bounds },
			origins,
			aspect,
			// A single rotated element resizes in its own local frame; everything else uses AABB.
			sole:
				sole && sole.rotation !== 0
					? {
							id: sole.id,
							box: { x: sole.x, y: sole.y, width: sole.width, height: sole.height },
							rotation: sole.rotation
						}
					: null
		};
	}

	#updateResize(world: Vec2): void {
		if (this.#drag.kind !== 'resize') return;
		if (this.#drag.sole) {
			this.#updateResizeRotated(world, this.#drag.sole, this.#drag.handle, this.#drag.aspect);
			return;
		}

		const { handle, origin, origins } = this.#drag;
		const dx = world.x - this.#drag.startWorld.x;
		const dy = world.y - this.#drag.startWorld.y;

		// Compute the new selection-bounds rect based on which handle is dragged.
		let { x, y, width, height } = origin;
		const right = origin.x + origin.width;
		const bottom = origin.y + origin.height;

		if (handle.includes('w')) {
			x = origin.x + dx;
			width = right - x;
		}
		if (handle.includes('e')) {
			width = origin.width + dx;
		}
		if (handle.includes('n')) {
			y = origin.y + dy;
			height = bottom - y;
		}
		if (handle.includes('s')) {
			height = origin.height + dy;
		}

		// Alt = resize from center (Excalidraw `shouldResizeFromCenter`, `resizeElements.ts:996-999`):
		// the OPPOSITE side mirrors the dragged side, so the bbox grows symmetrically about its center.
		if (this.#altHeld) {
			if (handle.includes('w') || handle.includes('e')) {
				const newW = 2 * width - origin.width;
				const cx = origin.x + origin.width / 2;
				width = newW;
				x = cx - width / 2;
			}
			if (handle.includes('n') || handle.includes('s')) {
				const newH = 2 * height - origin.height;
				const cy = origin.y + origin.height / 2;
				height = newH;
				y = cy - height / 2;
			}
		}

		// Aspect lock (shift): preserve original aspect ratio from the active corner.
		if (this.#drag.aspect && origin.width > 0 && origin.height > 0) {
			const ar = origin.width / origin.height;
			if (Math.abs(width) / ar > Math.abs(height)) height = (Math.sign(height || 1) * Math.abs(width)) / ar;
			else width = Math.sign(width || 1) * Math.abs(height) * ar;
			if (handle.includes('w')) x = right - width;
			if (handle.includes('n')) y = bottom - height;
		}

		if (width < MIN_SIZE) width = MIN_SIZE;
		if (height < MIN_SIZE) height = MIN_SIZE;

		const sx = width / origin.width;
		const sy = height / origin.height;

		for (const [id, ob] of origins) {
			const nx = x + (ob.x - origin.x) * sx;
			const ny = y + (ob.y - origin.y) * sy;
			this.scene.updateElement(id, {
				x: nx,
				y: ny,
				width: Math.max(MIN_SIZE, ob.width * sx),
				height: Math.max(MIN_SIZE, ob.height * sy)
			});
		}
	}

	/**
	 * Resize a single ROTATED element in its own local frame. We transform the pointer into the
	 * element's local (un-rotated) coordinates, move the dragged edge(s) there, keep the OPPOSITE
	 * edge/corner fixed in world space, and recompute the element's world position so the anchor
	 * doesn't drift. This is what makes resizing a rotated element feel correct rather than
	 * skewing along world axes.
	 */
	#updateResizeRotated(
		world: Vec2,
		sole: { id: ElementId; box: BBox; rotation: number },
		handle: HandleKind,
		aspect: boolean
	): void {
		const { box, rotation } = sole;
		const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

		// Pointer in local space (rotate world point back by -rotation about the original center).
		const local = rotate(world, -rotation, center);

		// Original local edges.
		let left = box.x;
		let right = box.x + box.width;
		let top = box.y;
		let bottom = box.y + box.height;

		if (handle.includes('w')) left = Math.min(local.x, right - MIN_SIZE);
		if (handle.includes('e')) right = Math.max(local.x, left + MIN_SIZE);
		if (handle.includes('n')) top = Math.min(local.y, bottom - MIN_SIZE);
		if (handle.includes('s')) bottom = Math.max(local.y, top + MIN_SIZE);

		let newW = right - left;
		let newH = bottom - top;

		// Aspect lock around the anchor corner.
		if (aspect && box.width > 0 && box.height > 0) {
			const ar = box.width / box.height;
			if (newW / ar > newH) newH = newW / ar;
			else newW = newH * ar;
			if (handle.includes('w')) left = right - newW;
			else right = left + newW;
			if (handle.includes('n')) top = bottom - newH;
			else bottom = top + newH;
		}

		// The anchor is the local corner OPPOSITE the drag, fixed in WORLD space.
		const anchorLocal = {
			x: handle.includes('w') ? box.x + box.width : box.x,
			y: handle.includes('n') ? box.y + box.height : box.y
		};
		const anchorWorld = rotate(anchorLocal, rotation, center);

		// New local center relative to that anchor, then map back to world to find the new x/y.
		const newCenterLocal = { x: (left + right) / 2, y: (top + bottom) / 2 };
		// Vector from anchor to new center in local space, rotated into world space.
		const offset = rotate(
			{ x: newCenterLocal.x - anchorLocal.x, y: newCenterLocal.y - anchorLocal.y },
			rotation,
			{ x: 0, y: 0 }
		);
		const newCenterWorld = { x: anchorWorld.x + offset.x, y: anchorWorld.y + offset.y };

		this.scene.updateElement(sole.id, {
			width: Math.max(MIN_SIZE, newW),
			height: Math.max(MIN_SIZE, newH),
			x: newCenterWorld.x - newW / 2,
			y: newCenterWorld.y - newH / 2
		});
	}

	// ---- rotate -----------------------------------------------------------------------------

	#beginRotate(world: Vec2, bounds: BBox): void {
		this.history.begin('Rotate');
		const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
		const startAngle = Math.atan2(world.y - center.y, world.x - center.x);
		const origins = new Map<ElementId, number>();
		for (const el of this.scene.selectedElements) origins.set(el.id, el.rotation);
		this.#drag = { kind: 'rotate', center, startAngle, origins };
	}

	#updateRotate(world: Vec2): void {
		if (this.#drag.kind !== 'rotate') return;
		const { center, startAngle, origins } = this.#drag;
		const angle = Math.atan2(world.y - center.y, world.x - center.x);
		let delta = angle - startAngle;
		// Shift = snap to 15° (Excalidraw `shouldRotateWithDiscreteAngle`, `keys.ts:140` +
		// `resizeElements.ts:222-225`). Default is FREE rotation; this inverted the prior
		// snap-by-default convention to match Excalidraw muscle memory.
		if (this.#shiftHeld) {
			const step = Math.PI / 12;
			delta = Math.round(delta / step) * step;
		}
		for (const [id, base] of origins) {
			const el = this.scene.get(id);
			if (!el) continue;
			// Rotate each element's center around the selection center, and add the angle delta.
			const ec = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
			const rc = rotate(ec, delta - (el.rotation - base), center);
			this.scene.updateElement(id, {
				rotation: base + delta,
				x: rc.x - el.width / 2,
				y: rc.y - el.height / 2
			});
		}
	}

	// ---- zoom -------------------------------------------------------------------------------

	wheel(screen: Vec2, deltaX: number, deltaY: number, ctrl: boolean, shift: boolean): void {
		if (ctrl) {
			// Pinch / ctrl-scroll → zoom anchored at the cursor.
			const factor = Math.exp(-deltaY * 0.01);
			this.camera.zoomBy(factor, screen);
			return;
		}
		if (shift) {
			// Excalidraw: Shift+wheel = horizontal pan (treats vertical wheel as horizontal scroll).
			this.camera.panBy(-deltaY, 0);
			return;
		}
		// Trackpad two-finger scroll → pan in BOTH axes (Mac trackpads emit deltaX for horizontal
		// swipe). Excalidraw `App.tsx:12819-12865` uses `deltaX`/`deltaY` together.
		this.camera.panBy(-deltaX, -deltaY);
	}

	trackpadPan(dx: number, dy: number): void {
		this.camera.panBy(-dx, -dy);
	}

	zoomIn(): void {
		this.camera.zoomBy(1.2, { x: this.camera.viewportWidth / 2, y: this.camera.viewportHeight / 2 });
	}
	zoomOut(): void {
		this.camera.zoomBy(1 / 1.2, { x: this.camera.viewportWidth / 2, y: this.camera.viewportHeight / 2 });
	}
	zoomToFit(): void {
		this.camera.fit(this.scene.contentBounds, 80);
	}
	/** Fit the current selection into the viewport (Excalidraw zoomToFitSelection, ⇧2). */
	zoomToFitSelection(): void {
		const b = this.scene.selectionBounds;
		this.camera.fit(b ?? this.scene.contentBounds, 80);
	}
	zoomReset(): void {
		this.camera.zoomTo(1, { x: this.camera.viewportWidth / 2, y: this.camera.viewportHeight / 2 });
	}

	// ---- text editing -----------------------------------------------------------------------

	beginTextEdit(id: ElementId): void {
		const el = this.scene.get(id);
		if (!el || el.type !== 'text') return;
		this.editingTextId = id;
	}

	commitTextEdit(id: ElementId, content: string): void {
		const el = this.scene.get(id);
		this.editingTextId = null;
		if (!el || el.type !== 'text') return;
		const trimmed = content.trim();
		// An empty text element is discarded on commit (Excalidraw behavior) so a click that placed
		// a text box but typed nothing doesn't leave an invisible element behind.
		if (trimmed === '') {
			this.commands.deleteById(id, 'Discard empty text');
			return;
		}
		if (el.content !== content) {
			this.commands.patch(id, { content } as Partial<Element>, 'Edit text');
		}
	}

	cancelTextEdit(): void {
		this.editingTextId = null;
	}

	/** Double-click: enter text edit if a text element is under the point. */
	doubleClick(screen: Vec2): void {
		const world = this.camera.toWorld(screen);
		const hit = hitTestPoint(this.scene.ordered, world);
		if (hit && hit.type === 'text') {
			this.scene.selectOne(hit.id);
			this.beginTextEdit(hit.id);
		}
	}

	// ---- handle geometry for the text-edit overlay & cursors --------------------------------

	/** Screen-space rect of an element (for positioning the text-edit overlay). */
	screenRectOf(id: ElementId): { left: number; top: number; width: number; height: number; rotation: number } | null {
		const el = this.scene.get(id);
		if (!el) return null;
		const tl = this.camera.toScreen({ x: el.x, y: el.y });
		return {
			left: tl.x,
			top: tl.y,
			width: el.width * this.camera.zoom,
			height: el.height * this.camera.zoom,
			rotation: el.rotation
		};
	}

	/** The cursor to show for a given world point in select mode. */
	cursorFor(screen: Vec2): string {
		if (this.tool === 'hand' || this.spaceHeld || this.isPanning) return 'grab';
		if (this.tool !== 'select') return 'crosshair';
		const world = this.camera.toWorld(screen);
		if (this.scene.selection.size > 0) {
			const handles = this.currentHandles();
			const radius = this.camera.screenDistanceToWorld(HANDLE_SCREEN_PX);
			const h: Handle | null = hitHandle(handles, world, radius);
			if (h) return cursorForHandle(h.kind, this.soleSelected?.rotation ?? 0);
		}
		const hit = hitTestPoint(this.scene.ordered, world);
		return hit ? 'move' : 'default';
	}

	/** Resolve a desired zoom percentage for the UI control. */
	get zoomPercent(): number {
		return Math.round(this.camera.zoom * 100);
	}

	setZoomPercent(pct: number): void {
		const z = clamp(pct / 100, 0.05, 8);
		this.camera.zoomTo(z, { x: this.camera.viewportWidth / 2, y: this.camera.viewportHeight / 2 });
	}
}

/**
 * Resize cursor for a handle, rotated by the element's rotation so the double-arrow points along
 * the actual edge of a rotated element. We map the handle's base angle + rotation onto the eight
 * directional resize cursors.
 */
function cursorForHandle(kind: HandleKind, rotation: number): string {
	if (kind === 'rotate') return 'crosshair';
	const baseAngle: Record<Exclude<HandleKind, 'rotate'>, number> = {
		e: 0,
		se: 45,
		s: 90,
		sw: 135,
		w: 180,
		nw: 225,
		n: 270,
		ne: 315
	};
	const deg = (((baseAngle[kind] + (rotation * 180) / Math.PI) % 180) + 180) % 180;
	// Snap to the nearest 45° bucket → one of four bidirectional resize cursors.
	const bucket = Math.round(deg / 45) % 4;
	return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][bucket] ?? 'ew-resize';
}

/** Singleton editor for the session. */
export const editor = new Editor();
