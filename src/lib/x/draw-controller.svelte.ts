// Interactive draw controller (Phase 2 → 3) — the first slice of the editor "App".
// Generic-create (rectangle/ellipse/diamond): pointer-down makes a zero-size element, drag resizes
// it. Freedraw: pointer-down starts a stroke, drag accumulates local points (perfect-freehand).
// Mutations go through the vendored model so fractional indices + ShapeCache stay correct.
import {
  deepCopyElement,
  duplicateElement,
  getCommonBounds,
  getElementsWithinSelection,
  getTransformHandleTypeFromCoords,
  hitElementItself,
  isTextElement,
  mutateElement,
  newElement,
  newElementWith,
  newFreeDrawElement,
  newLinearElement,
  newTextElement,
  orderByFractionalIndex,
  redrawTextBoundingBox,
  resizeTest,
  Store,
  syncInvalidIndices,
  transformElements,
} from "@excalidraw/element";

import { ROUNDNESS, viewportCoordsToSceneCoords } from "@excalidraw/common";

import { pointFrom } from "@excalidraw/math";

import { SvelteSet } from "svelte/reactivity";

import { History } from "@excalidraw/excalidraw/history";

import type { TransformHandleType } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawLinearElement,
  ExcalidrawTextElement,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
  SceneElementsMap,
} from "@excalidraw/element/types";
import type { GlobalPoint, LocalPoint } from "@excalidraw/math";
import type { EditorInterface } from "@excalidraw/common";
import type { App, AppState, NormalizedZoomValue } from "@excalidraw/excalidraw/types";

import { EditorAppState } from "$lib/state/app-state.svelte.ts";
import { EditorScene } from "$lib/scene/editor-scene.svelte.ts";
import {
  restoreFromLocalStorage,
  saveToLocalStorage,
} from "$lib/x/persistence/web-storage.ts";
import {
  createImageElement,
  loadImageFile,
  makeImageCache,
} from "$lib/x/image-support.ts";

// Editor-interface shape used by resizeTest (handle sizing). Desktop/mouse defaults.
const EDITOR_INTERFACE: EditorInterface = {
  formFactor: "desktop",
  desktopUIMode: "full",
  userAgent: { isMobileDevice: false, platform: "other" },
  isTouchScreen: false,
  canFitSidebar: true,
  isLandscape: true,
};

export type ShapeTool = "rectangle" | "ellipse" | "diamond";
export type LinearTool = "line" | "arrow";
export type Tool =
  | "selection"
  | ShapeTool
  | "freedraw"
  | LinearTool
  | "text"
  | "image"
  | "eraser";

type CreateMode = "generic" | "freedraw" | "linear";

/** Live modifier-key state for a gesture (shift = aspect/snap, alt = from-center). */
export type PointerMods = { shiftKey: boolean; altKey: boolean };
const NO_MODS: PointerMods = { shiftKey: false, altKey: false };

export class DrawController {
  readonly scene = new EditorScene();
  readonly appState = new EditorAppState();
  activeTool = $state<Tool>("rectangle");
  /** The set of selected element ids (reactive — drives the interactive overlay). */
  readonly selectedIds = new SvelteSet<string>();
  editingTextId = $state<string | null>(null);

  /** First selected id, for single-selection consumers (text editing, panels). */
  get selectedId(): string | null {
    for (const id of this.selectedIds) {
      return id;
    }
    return null;
  }

  #elements: ExcalidrawElement[] = [];
  #creating: ExcalidrawElement | null = null;
  #mode: CreateMode | null = null;
  #originX = 0;
  #originY = 0;

  // move-drag state
  #dragging = false;
  #dragStartX = 0;
  #dragStartY = 0;
  #dragOrigins = new Map<string, { x: number; y: number }>();

  // resize/rotate state
  #resizeHandle: TransformHandleType | null = null;
  #resizeOriginals = new Map<string, NonDeletedExcalidrawElement>();
  #resizeCenterX = 0;
  #resizeCenterY = 0;

  // marquee (box) selection state
  #marquee = false;
  #marqueeOriginX = 0;
  #marqueeOriginY = 0;
  #marqueeBaseIds = new Set<string>();

  // live modifier-key state for the active gesture (shift/alt)
  #shiftKey = false;
  #altKey = false;

  // image cache (fileId → loaded image) passed to renderConfig.imageCache
  readonly imageCache = makeImageCache();
  #erasing = false;

  // undo/redo (Store captures snapshots → durable increments → History stacks)
  #store: Store;
  #history: History;
  canUndo = $state(false);
  canRedo = $state(false);

  constructor() {
    const self = this;
    // Store/History only read app.scene + app.state at runtime (one documented boundary cast).
    const app = {
      scene: this.scene.scene,
      get state(): AppState {
        return self.appState.current;
      },
    } as unknown as App;
    this.#store = new Store(app);
    this.#history = new History(this.#store);
    this.#store.onDurableIncrementEmitter.on((increment) => {
      this.#history.record(increment.delta);
      this.#syncHistoryFlags();
    });

    // restore any prior drawing from localStorage before establishing the baseline
    const restored = restoreFromLocalStorage();
    if (restored && restored.elements.length > 0) {
      this.#elements = syncInvalidIndices(restored.elements);
      this.scene.replaceAllElements(this.#elements);
      this.appState.setState(restored.appState);
    }

    // capture the initial snapshot (empty or restored) as the undo baseline
    this.#commit();
  }

  #syncHistoryFlags(): void {
    this.canUndo = !this.#history.isUndoStackEmpty;
    this.canRedo = !this.#history.isRedoStackEmpty;
  }

  /** Snapshot the current scene+appState into one durable history entry (call after a gesture). */
  #commit(): void {
    this.#store.scheduleCapture();
    this.#store.commit(
      this.scene.scene.getElementsMapIncludingDeleted() as SceneElementsMap,
      this.appState.current,
    );
    // persist to localStorage so the drawing survives reload
    saveToLocalStorage(
      this.scene.scene.getElementsIncludingDeleted(),
      this.appState.current,
    );
  }

  #applyHistory(result: [SceneElementsMap, AppState]): void {
    const [elementsMap, appState] = result;
    const ordered = orderByFractionalIndex(
      Array.from(elementsMap.values()) as OrderedExcalidrawElement[],
    );
    this.#elements = ordered;
    this.scene.replaceAllElements(ordered);
    this.appState.current = appState;
    this.selectedIds.clear();
    for (const id of Object.keys(appState.selectedElementIds)) {
      this.selectedIds.add(id);
    }
    this.#syncHistoryFlags();
  }

  undo(): void {
    const result = this.#history.undo(
      this.scene.scene.getElementsMapIncludingDeleted() as SceneElementsMap,
      this.appState.current,
    );
    if (result) {
      this.#applyHistory(result);
    }
  }

  redo(): void {
    const result = this.#history.redo(
      this.scene.scene.getElementsMapIncludingDeleted() as SceneElementsMap,
      this.appState.current,
    );
    if (result) {
      this.#applyHistory(result);
    }
  }

  setTool(tool: Tool): void {
    this.activeTool = tool;
  }

  // --- camera (pan / zoom) ---
  get zoom(): number {
    return this.appState.current.zoom.value;
  }

  /** Pan by a viewport-pixel delta (wheel / space-drag). scroll is in scene units. */
  panBy(viewportDx: number, viewportDy: number): void {
    const a = this.appState.current;
    this.appState.setState({
      scrollX: a.scrollX - viewportDx / a.zoom.value,
      scrollY: a.scrollY - viewportDy / a.zoom.value,
    });
  }

  /** Zoom by a factor around a viewport point, keeping that scene point fixed. */
  zoomAt(factor: number, viewportX: number, viewportY: number): void {
    const a = this.appState.current;
    const z = a.zoom.value;
    const nz = Math.min(30, Math.max(0.1, z * factor));
    const sceneX = (viewportX - a.offsetLeft) / z - a.scrollX;
    const sceneY = (viewportY - a.offsetTop) / z - a.scrollY;
    this.appState.setState({
      zoom: { value: nz as NormalizedZoomValue },
      scrollX: (viewportX - a.offsetLeft) / nz - sceneX,
      scrollY: (viewportY - a.offsetTop) / nz - sceneY,
    });
  }

  resetView(): void {
    this.appState.setState({
      zoom: { value: 1 as NormalizedZoomValue },
      scrollX: 0,
      scrollY: 0,
    });
  }

  // --- current style (drives new elements; mirrors Excalidraw's appState.currentItem*) ---
  get strokeColor(): string {
    return this.appState.current.currentItemStrokeColor;
  }
  get backgroundColor(): string {
    return this.appState.current.currentItemBackgroundColor;
  }
  get strokeWidth(): number {
    return this.appState.current.currentItemStrokeWidth;
  }

  setStrokeColor(color: string): void {
    this.#applyStyle({ strokeColor: color }, { currentItemStrokeColor: color });
  }
  setBackgroundColor(color: string): void {
    this.#applyStyle({ backgroundColor: color }, { currentItemBackgroundColor: color });
  }
  setStrokeWidth(width: number): void {
    this.#applyStyle({ strokeWidth: width }, { currentItemStrokeWidth: width });
  }

  get opacity(): number {
    return this.appState.current.currentItemOpacity;
  }
  get fillStyle(): AppState["currentItemFillStyle"] {
    return this.appState.current.currentItemFillStyle;
  }
  get strokeStyle(): AppState["currentItemStrokeStyle"] {
    return this.appState.current.currentItemStrokeStyle;
  }
  get sloppiness(): number {
    return this.appState.current.currentItemRoughness;
  }

  setOpacity(opacity: number): void {
    this.#applyStyle({ opacity }, { currentItemOpacity: opacity });
  }
  setFillStyle(fillStyle: AppState["currentItemFillStyle"]): void {
    this.#applyStyle({ fillStyle }, { currentItemFillStyle: fillStyle });
  }
  setStrokeStyle(strokeStyle: AppState["currentItemStrokeStyle"]): void {
    this.#applyStyle({ strokeStyle }, { currentItemStrokeStyle: strokeStyle });
  }
  setSloppiness(roughness: number): void {
    this.#applyStyle({ roughness }, { currentItemRoughness: roughness });
  }

  get edges(): "sharp" | "round" {
    return this.appState.current.currentItemRoundness === "round" ? "round" : "sharp";
  }
  setEdges(value: "sharp" | "round"): void {
    this.appState.setState({ currentItemRoundness: value });
    const selected = this.selectedElements;
    if (!selected.length) {
      return;
    }
    const map = this.scene.scene.getNonDeletedElementsMap();
    for (const el of selected) {
      mutateElement(el, map, {
        roundness: value === "round" ? { type: ROUNDNESS.ADAPTIVE_RADIUS } : null,
      });
    }
    this.scene.scene.triggerUpdate();
    this.#commit();
  }

  get theme(): AppState["theme"] {
    return this.appState.current.theme;
  }

  /** Toggle light/dark theme and persist it. */
  toggleTheme(): void {
    const next: AppState["theme"] = this.appState.current.theme === "dark" ? "light" : "dark";
    this.appState.setState({ theme: next });
    saveToLocalStorage(this.scene.scene.getElementsIncludingDeleted(), this.appState.current);
  }

  #applyStyle(
    elementPatch: {
      strokeColor?: string;
      backgroundColor?: string;
      strokeWidth?: number;
      opacity?: number;
      fillStyle?: AppState["currentItemFillStyle"];
      strokeStyle?: AppState["currentItemStrokeStyle"];
      roughness?: number;
    },
    appStatePatch: Partial<AppState>,
  ): void {
    this.appState.setState(appStatePatch);
    const selected = this.selectedElements;
    if (!selected.length) {
      return;
    }
    const map = this.scene.scene.getNonDeletedElementsMap();
    for (const el of selected) {
      mutateElement(el, map, elementPatch);
    }
    this.scene.scene.triggerUpdate();
    this.#commit();
  }

  /** Style props applied to newly-created elements, from the current item defaults. */
  #createStyle(): {
    strokeColor: string;
    backgroundColor: string;
    fillStyle: AppState["currentItemFillStyle"];
    strokeWidth: number;
    strokeStyle: AppState["currentItemStrokeStyle"];
    roughness: number;
    opacity: number;
  } {
    const a = this.appState.current;
    return {
      strokeColor: a.currentItemStrokeColor,
      backgroundColor: a.currentItemBackgroundColor,
      fillStyle: a.currentItemFillStyle,
      strokeWidth: a.currentItemStrokeWidth,
      strokeStyle: a.currentItemStrokeStyle,
      roughness: a.currentItemRoughness,
      opacity: a.currentItemOpacity,
    };
  }

  /** The text element currently being edited (drives the textarea overlay), if any. */
  get editingText(): ExcalidrawTextElement | null {
    const id = this.editingTextId;
    if (!id) {
      return null;
    }
    const el = this.scene.scene.getNonDeletedElementsMap().get(id);
    return el && isTextElement(el) ? el : null;
  }

  /** Live-update the editing text element's content + bounding box. */
  setEditingText(value: string): void {
    const el = this.editingText;
    if (!el) {
      return;
    }
    mutateElement(el, this.scene.scene.getNonDeletedElementsMap(), {
      text: value,
      originalText: value,
    });
    redrawTextBoundingBox(el, null, this.scene.scene);
    this.scene.scene.triggerUpdate();
  }

  /** Finish text editing: delete if empty, else keep; record one history entry. */
  commitText(): void {
    const id = this.editingTextId;
    this.editingTextId = null;
    if (!id) {
      return;
    }
    const el = this.scene.scene.getNonDeletedElementsMap().get(id);
    if (el && isTextElement(el) && el.text.trim() === "") {
      this.#elements = this.#elements.filter((e) => e.id !== id);
      this.#select(null);
      syncInvalidIndices(this.#elements);
      this.scene.replaceAllElements(this.#elements);
    }
    this.#commit();
    this.activeTool = "selection";
  }

  /** Clear the current selection. */
  deselect(): void {
    this.#select(null);
  }

  /** Remove all elements (reset canvas). */
  clear(): void {
    this.#elements = [];
    this.#select(null);
    this.scene.replaceAllElements([]);
    this.#commit();
  }

  /** Select the topmost element at a viewport point (used by right-click). */
  selectAt(clientX: number, clientY: number): void {
    const { x, y } = this.#toScene(clientX, clientY);
    this.#select(this.#hitTest(x, y));
  }

  /** Load an image file and place it centered at a viewport point. */
  async placeImage(file: File, clientX: number, clientY: number): Promise<void> {
    const { fileId, mimeType, width, height, image } = await loadImageFile(file);
    this.imageCache.set(fileId, { image, mimeType });
    const { x, y } = this.#toScene(clientX, clientY);
    const fit = Math.min(1, 400 / Math.max(width, height));
    const w = width * fit;
    const h = height * fit;
    const el = createImageElement({ fileId, x: x - w / 2, y: y - h / 2, width: w, height: h });
    this.#elements.push(el);
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
    this.#select(el.id);
    this.activeTool = "selection";
    this.scene.scene.triggerUpdate();
    this.#commit();
  }

  #eraseAt(sceneX: number, sceneY: number): void {
    const id = this.#hitTest(sceneX, sceneY);
    if (!id) {
      return;
    }
    this.#elements = this.#elements.filter((e) => e.id !== id);
    if (this.selectedIds.has(id)) {
      this.#setSelection([...this.selectedIds].filter((s) => s !== id));
    }
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
  }

  /** Delete the selected element(s). */
  deleteSelected(): void {
    const ids = this.selectedIds;
    if (!ids.size) {
      return;
    }
    this.#elements = this.#elements.filter((e) => !ids.has(e.id));
    this.#select(null);
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
    this.#commit();
  }

  /** Duplicate the selected element(s) offset by (10,10) and select the copies. */
  duplicateSelected(): void {
    const originals = this.selectedElements;
    if (!originals.length) {
      return;
    }
    const copies = originals.map((orig) =>
      newElementWith(duplicateElement(null, new Map(), orig, true), {
        x: orig.x + 10,
        y: orig.y + 10,
      }),
    );
    this.#elements.push(...copies);
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
    this.#setSelection(copies.map((c) => c.id));
    this.#commit();
  }

  #toScene(clientX: number, clientY: number): { x: number; y: number } {
    const a = this.appState.current;
    return viewportCoordsToSceneCoords(
      { clientX, clientY },
      {
        zoom: a.zoom,
        offsetLeft: a.offsetLeft,
        offsetTop: a.offsetTop,
        scrollX: a.scrollX,
        scrollY: a.scrollY,
      },
    );
  }

  /** Selected elements, for the interactive overlay renderer. */
  get selectedElements(): readonly NonDeletedExcalidrawElement[] {
    return this.selectedIds.size
      ? this.scene.elements.filter((e) => this.selectedIds.has(e.id))
      : [];
  }

  #hitTest(sceneX: number, sceneY: number): string | null {
    const elementsMap = this.scene.scene.getNonDeletedElementsMap();
    const threshold = 10 / this.appState.current.zoom.value;
    const point = pointFrom<GlobalPoint>(sceneX, sceneY);
    const els = this.scene.elements;
    // topmost (last in z-order) first
    for (let i = els.length - 1; i >= 0; i--) {
      const element = els[i]!;
      if (hitElementItself({ point, element, threshold, elementsMap })) {
        return element.id;
      }
    }
    return null;
  }

  #select(id: string | null): void {
    this.#setSelection(id ? [id] : []);
  }

  /** Replace the selection with exactly `ids` (keeps appState.selectedElementIds in sync). */
  #setSelection(ids: readonly string[]): void {
    this.selectedIds.clear();
    for (const id of ids) {
      this.selectedIds.add(id);
    }
    this.appState.setState({
      selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])),
    });
  }

  /** Toggle a single element in/out of the current selection (shift-click). */
  #toggleSelected(id: string): void {
    const next = new Set(this.selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.#setSelection([...next]);
  }

  /** True if a scene point falls within the current selection's bounding box. */
  #pointInSelection(x: number, y: number): boolean {
    const selected = this.selectedElements;
    if (!selected.length) {
      return false;
    }
    const [x1, y1, x2, y2] = getCommonBounds(selected);
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  }

  #beginDrag(x: number, y: number): void {
    this.#dragging = true;
    this.#dragStartX = x;
    this.#dragStartY = y;
    this.#dragOrigins = new Map(
      this.selectedElements.map((e) => [e.id, { x: e.x, y: e.y }]),
    );
  }

  /** Which transform handle (corner/edge/rotation) is under a scene point, if the selection is hit. */
  #handleAt(x: number, y: number): TransformHandleType | null {
    const selected = this.selectedElements;
    if (!selected.length) {
      return null;
    }
    // single element: handles follow the element's own rotation/box
    if (selected.length === 1) {
      const handle = resizeTest(
        selected[0]!,
        this.scene.scene.getNonDeletedElementsMap(),
        this.appState.current,
        x,
        y,
        this.appState.current.zoom,
        "mouse",
        EDITOR_INTERFACE,
      );
      return handle || null;
    }
    // multi-select: handles wrap the (unrotated) common bounding box
    const handle = getTransformHandleTypeFromCoords(
      getCommonBounds(selected),
      x,
      y,
      this.appState.current.zoom,
      "mouse",
      EDITOR_INTERFACE,
    );
    return handle || null;
  }

  /** Begin a marquee (box) selection from an empty-canvas drag. */
  #beginMarquee(x: number, y: number): void {
    this.#marquee = true;
    this.#marqueeOriginX = x;
    this.#marqueeOriginY = y;
    // shift-drag extends the existing selection; plain drag replaces it
    this.#marqueeBaseIds = this.#shiftKey ? new Set(this.selectedIds) : new Set();
    this.appState.setState({
      selectionElement: newElement({ type: "selection", x, y, width: 0, height: 0 }),
    });
  }

  /** Grow the marquee to the pointer and select all enclosed elements. */
  #updateMarquee(x: number, y: number): void {
    const minX = Math.min(this.#marqueeOriginX, x);
    const minY = Math.min(this.#marqueeOriginY, y);
    const width = Math.abs(x - this.#marqueeOriginX);
    const height = Math.abs(y - this.#marqueeOriginY);
    const selectionElement = newElement({
      type: "selection",
      x: minX,
      y: minY,
      width,
      height,
    });
    this.appState.setState({ selectionElement });
    const enclosed = getElementsWithinSelection(
      this.scene.elements,
      selectionElement,
      this.scene.scene.getNonDeletedElementsMap(),
      false,
    );
    this.#setSelection([
      ...this.#marqueeBaseIds,
      ...enclosed.map((e) => e.id),
    ]);
  }

  #beginResize(handle: TransformHandleType): void {
    this.#resizeHandle = handle;
    this.#resizeOriginals = new Map(
      this.selectedElements.map((e) => [e.id, deepCopyElement(e)]),
    );
    const [x1, y1, x2, y2] = getCommonBounds(this.selectedElements);
    this.#resizeCenterX = (x1 + x2) / 2;
    this.#resizeCenterY = (y1 + y2) / 2;
  }

  pointerDown(clientX: number, clientY: number, mods: PointerMods = NO_MODS): void {
    const { x, y } = this.#toScene(clientX, clientY);
    this.#shiftKey = mods.shiftKey;
    this.#altKey = mods.altKey;

    if (this.activeTool === "selection") {
      // a transform handle on the current selection starts a resize/rotate...
      const handle = this.#handleAt(x, y);
      if (handle) {
        this.#beginResize(handle);
        return;
      }
      const hitId = this.#hitTest(x, y);
      // shift toggles the hit element in/out of the selection (no move); shift on empty
      // extends the selection via a marquee (base = current selection).
      if (mods.shiftKey) {
        if (hitId) {
          this.#toggleSelected(hitId);
        } else {
          this.#beginMarquee(x, y);
        }
        return;
      }
      // grabbing inside the current selection (bbox or an element) starts a move...
      if (this.selectedIds.size && this.#pointInSelection(x, y)) {
        this.#beginDrag(x, y);
        return;
      }
      // ...hitting an element selects it and starts a drag...
      if (hitId) {
        this.#select(hitId);
        this.#beginDrag(x, y);
        return;
      }
      // ...empty canvas clears the selection and starts a marquee
      this.#select(null);
      this.#beginMarquee(x, y);
      return;
    }

    // text tool: click to place an empty text element and start editing it
    if (this.activeTool === "text") {
      this.#select(null);
      const el = newTextElement({ text: "", x, y, ...this.#createStyle() });
      this.#elements.push(el);
      syncInvalidIndices(this.#elements);
      this.scene.replaceAllElements(this.#elements);
      this.#select(el.id);
      this.editingTextId = el.id;
      return;
    }

    // eraser: remove elements under the pointer (drag to erase a path)
    if (this.activeTool === "eraser") {
      this.#erasing = true;
      this.#eraseAt(x, y);
      return;
    }

    // image tool is handled by the view (it opens a file picker → placeImage)
    if (this.activeTool === "image") {
      return;
    }

    // starting a new shape clears any current selection
    this.#select(null);
    this.#originX = x;
    this.#originY = y;

    if (this.activeTool === "freedraw") {
      this.#creating = newFreeDrawElement({
        type: "freedraw",
        x,
        y,
        points: [pointFrom<LocalPoint>(0, 0)],
        pressures: [],
        simulatePressure: true,
        ...this.#createStyle(),
      });
      this.#mode = "freedraw";
    } else if (this.activeTool === "line" || this.activeTool === "arrow") {
      let linear = newLinearElement({
        type: this.activeTool,
        x,
        y,
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(0, 0)],
        ...this.#createStyle(),
      });
      if (this.activeTool === "arrow") {
        linear = newElementWith(linear, { endArrowhead: "arrow" });
      }
      this.#creating = linear;
      this.#mode = "linear";
    } else {
      this.#creating = newElement({
        type: this.activeTool,
        x,
        y,
        width: 0,
        height: 0,
        ...this.#createStyle(),
      });
      this.#mode = "generic";
    }

    this.#elements.push(this.#creating);
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
  }

  pointerMove(clientX: number, clientY: number, mods: PointerMods = NO_MODS): void {
    this.#shiftKey = mods.shiftKey;
    this.#altKey = mods.altKey;

    // growing a marquee (box) selection
    if (this.#marquee) {
      const { x, y } = this.#toScene(clientX, clientY);
      this.#updateMarquee(x, y);
      return;
    }

    // erasing along a drag
    if (this.#erasing) {
      const { x, y } = this.#toScene(clientX, clientY);
      this.#eraseAt(x, y);
      return;
    }

    // resizing / rotating the current selection via a transform handle
    if (this.#resizeHandle) {
      const { x, y } = this.#toScene(clientX, clientY);
      transformElements(
        this.#resizeOriginals,
        this.#resizeHandle,
        this.selectedElements,
        this.scene.scene,
        false, // shouldRotateWithDiscreteAngle (shift)
        false, // shouldResizeFromCenter (alt)
        false, // shouldMaintainAspectRatio (shift)
        x,
        y,
        this.#resizeCenterX,
        this.#resizeCenterY,
      );
      this.scene.scene.triggerUpdate();
      return;
    }

    // moving the current selection (origin-based, so no floating drift)
    if (this.#dragging) {
      const { x, y } = this.#toScene(clientX, clientY);
      const dx = x - this.#dragStartX;
      const dy = y - this.#dragStartY;
      const map = this.scene.scene.getNonDeletedElementsMap();
      for (const el of this.selectedElements) {
        const origin = this.#dragOrigins.get(el.id);
        if (origin) {
          mutateElement(el, map, { x: origin.x + dx, y: origin.y + dy });
        }
      }
      this.scene.scene.triggerUpdate();
      return;
    }

    if (!this.#creating) {
      return;
    }
    const { x, y } = this.#toScene(clientX, clientY);
    const map = this.scene.scene.getNonDeletedElementsMap();

    if (this.#mode === "freedraw") {
      const el = this.#creating as ExcalidrawFreeDrawElement;
      const dx = x - el.x;
      const dy = y - el.y;
      const last = el.points[el.points.length - 1];
      if (last && last[0] === dx && last[1] === dy) {
        return; // skip duplicate sample
      }
      mutateElement(el, map, { points: [...el.points, pointFrom<LocalPoint>(dx, dy)] });
    } else if (this.#mode === "linear") {
      // 2-point linear element: second point tracks the pointer (local coords)
      const el = this.#creating as ExcalidrawLinearElement;
      mutateElement(el, map, {
        points: [
          pointFrom<LocalPoint>(0, 0),
          pointFrom<LocalPoint>(x - this.#originX, y - this.#originY),
        ],
      });
    } else {
      // negative-direction aware: position at the min corner, size is the abs delta
      mutateElement(this.#creating, map, {
        x: Math.min(this.#originX, x),
        y: Math.min(this.#originY, y),
        width: Math.abs(x - this.#originX),
        height: Math.abs(y - this.#originY),
      });
    }
    // mutateElement invalidates ShapeCache; bump the reactive signal to repaint
    this.scene.scene.triggerUpdate();
  }

  pointerUp(): void {
    // end a marquee selection (selection is not a scene mutation → no history entry)
    if (this.#marquee) {
      this.#marquee = false;
      this.#marqueeBaseIds = new Set();
      this.appState.setState({ selectionElement: null });
      return;
    }

    // end an erase stroke
    if (this.#erasing) {
      this.#erasing = false;
      this.#commit();
      return;
    }

    // end a resize/rotate
    if (this.#resizeHandle) {
      this.#resizeHandle = null;
      this.#resizeOriginals.clear();
      this.#commit();
      return;
    }

    // end a move-drag
    if (this.#dragging) {
      this.#dragging = false;
      this.#dragOrigins.clear();
      this.#commit();
      return;
    }

    const creating = this.#creating;
    const mode = this.#mode;
    if (!creating) {
      return;
    }
    this.#creating = null;
    this.#mode = null;

    // discard an accidental click (no drag → zero size) for shapes and linear elements
    if (
      (mode === "generic" || mode === "linear") &&
      creating.width < 1 &&
      creating.height < 1
    ) {
      this.#elements = this.#elements.filter((e) => e !== creating);
      syncInvalidIndices(this.#elements);
      this.scene.replaceAllElements(this.#elements);
    }

    // one durable history entry per completed gesture (no-op if nothing changed)
    this.#commit();

    // Excalidraw default: revert to selection after drawing one element
    this.activeTool = "selection";
  }
}
