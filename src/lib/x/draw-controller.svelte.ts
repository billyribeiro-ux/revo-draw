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
  isLinearElement,
  isTextElement,
  LinearElementEditor,
  moveAllLeft,
  moveAllRight,
  moveOneLeft,
  moveOneRight,
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

import {
  getReferenceSnapPoints,
  getVisibleGaps,
  isSnappingEnabled,
  SnapCache,
  snapDraggedElements,
} from "@excalidraw/excalidraw/snapping";

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
import type {
  App,
  AppClassProperties,
  AppState,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";

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
// export-image pulls in rough + the SVG renderer (DOM-only). Import the value side lazily
// (dynamic import inside the export methods) so the controller stays loadable in node tests;
// the type-only import below is erased at runtime and triggers no module load.
import type { ExportImageCache } from "$lib/x/export-image.ts";
// laserTrails pulls in the laser-pointer pkg + DOM-only SVG/animation code. Type-only import
// (erased at runtime); the value side is dynamic-imported in startLaserLayer (browser-only).
import type { LaserTrails } from "@excalidraw/excalidraw/laserTrails";

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
  | "eraser"
  | "laser";

type CreateMode = "generic" | "freedraw" | "linear";

/** Live modifier-key state for a gesture (shift = aspect/snap, alt = from-center,
 *  ctrl/meta = toggle object-snapping while dragging). */
export type PointerMods = {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};
const NO_MODS: PointerMods = {
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};

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

  // multi-point linear (line/arrow) editing — the editor lives on
  // appState.selectedLinearElement; this flags an in-progress point drag.
  #linearPointerActive = false;

  // laser pointer — an ephemeral rAF-driven SVG trail (NOT in #elements/history)
  #laser: LaserTrails | null = null;

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
    // leaving the selection tool exits any active point-editor (its handles must vanish)
    if (tool !== "selection" && this.appState.current.selectedLinearElement) {
      this.appState.setState({ selectedLinearElement: null });
    }
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

  /** Keep the live viewport size on appState (snapping/visibility checks read width/height). */
  setViewport(width: number, height: number): void {
    const a = this.appState.current;
    if (a.width !== width || a.height !== height) {
      this.appState.setState({ width, height });
    }
  }

  get gridMode(): boolean {
    return this.appState.current.gridModeEnabled;
  }

  /** Toggle the background grid (snapping-to-grid follows gridModeEnabled). */
  toggleGrid(): void {
    this.appState.setState({ gridModeEnabled: !this.appState.current.gridModeEnabled });
    this.scene.scene.triggerUpdate();
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

  /** Clear the current selection (and exit any point-editor). */
  deselect(): void {
    if (this.appState.current.selectedLinearElement) {
      this.appState.setState({ selectedLinearElement: null });
    }
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

  // --- export (PNG / SVG) ---

  /** True when there's at least one element to export. */
  get canExport(): boolean {
    return this.scene.elements.length > 0;
  }

  #exportOpts(): {
    exportBackground: boolean;
    viewBackgroundColor: string;
    theme: AppState["theme"];
  } {
    const a = this.appState.current;
    return {
      exportBackground: a.exportBackground,
      viewBackgroundColor: a.viewBackgroundColor,
      theme: a.theme,
    };
  }

  /** Render the scene to a PNG blob (used by the export dialog + probes). */
  async exportToPngBlob(scale = 2): Promise<Blob | null> {
    const elements = this.scene.elements;
    if (!elements.length) {
      return null;
    }
    const { exportToCanvas } = await import("$lib/x/export-image.ts");
    const canvas = exportToCanvas(
      elements,
      this.appState.current,
      this.imageCache as unknown as ExportImageCache,
      { scale, ...this.#exportOpts() },
    );
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png"),
    );
  }

  /** Serialize the scene to an SVG string. */
  async exportToSvgString(): Promise<string | null> {
    const elements = this.scene.elements;
    if (!elements.length) {
      return null;
    }
    const { exportToSvg } = await import("$lib/x/export-image.ts");
    const svg = exportToSvg(elements, this.#exportOpts());
    return new XMLSerializer().serializeToString(svg);
  }

  /** Export + download a PNG. */
  async downloadPng(): Promise<void> {
    const blob = await this.exportToPngBlob();
    if (blob) {
      const { downloadBlob } = await import("$lib/x/export-image.ts");
      downloadBlob(blob, "drawing.png");
    }
  }

  /** Export + download an SVG. */
  async downloadSvg(): Promise<void> {
    const svg = await this.exportToSvgString();
    if (svg) {
      const { downloadBlob } = await import("$lib/x/export-image.ts");
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "drawing.svg");
    }
  }

  // --- laser pointer (ephemeral trail) ---

  /** Mount the laser trail into an SVG overlay (called by the view once it's in the DOM). */
  async startLaserLayer(svg: SVGSVGElement): Promise<void> {
    if (this.#laser) {
      return;
    }
    const self = this;
    const { LaserTrails } = await import("@excalidraw/excalidraw/laserTrails");
    // LaserTrails only reads app.state (theme/zoom for the trail colour + decay)
    const app = {
      get state(): AppState {
        return self.appState.current;
      },
    } as unknown as ConstructorParameters<typeof LaserTrails>[0];
    this.#laser = new LaserTrails(app);
    this.#laser.start(svg);
  }

  /** Tear down the laser trail animation. */
  stopLaserLayer(): void {
    this.#laser?.stop();
    this.#laser = null;
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

  /** Delete the selected element(s) — or, while point-editing, the selected point(s). */
  deleteSelected(): void {
    // point-editing: delete selected points (keep ≥2 so the element stays valid)
    const editor = this.appState.current.selectedLinearElement;
    if (editor?.isEditing && editor.selectedPointsIndices?.length) {
      const el = this.scene.scene.getNonDeletedElementsMap().get(editor.elementId);
      if (
        el &&
        isLinearElement(el) &&
        el.points.length - editor.selectedPointsIndices.length >= 2
      ) {
        LinearElementEditor.deletePoints(
          el,
          this.#linearApp(),
          editor.selectedPointsIndices,
        );
        this.appState.setState({
          selectedLinearElement: { ...editor, selectedPointsIndices: null },
        });
        this.scene.scene.triggerUpdate();
        this.#commit();
      }
      return;
    }

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

  // --- z-order (bring forward / to front, send backward / to back) ---

  #reorder(next: readonly ExcalidrawElement[]): void {
    this.#elements = next as ExcalidrawElement[];
    // zindex helpers already syncMovedIndices, so the array is valid for replaceAllElements
    this.scene.replaceAllElements(next as ExcalidrawElement[]);
    this.scene.scene.triggerUpdate();
    this.#commit();
  }

  bringForward(): void {
    if (!this.selectedIds.size) {
      return;
    }
    this.#reorder(
      moveOneRight(
        this.scene.scene.getElementsIncludingDeleted(),
        this.appState.current,
        this.scene.scene,
      ),
    );
  }

  sendBackward(): void {
    if (!this.selectedIds.size) {
      return;
    }
    this.#reorder(
      moveOneLeft(
        this.scene.scene.getElementsIncludingDeleted(),
        this.appState.current,
        this.scene.scene,
      ),
    );
  }

  bringToFront(): void {
    if (!this.selectedIds.size) {
      return;
    }
    this.#reorder(
      moveAllRight(this.scene.scene.getElementsIncludingDeleted(), this.appState.current),
    );
  }

  sendToBack(): void {
    if (!this.selectedIds.size) {
      return;
    }
    this.#reorder(
      moveAllLeft(this.scene.scene.getElementsIncludingDeleted(), this.appState.current),
    );
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

  // --- multi-point linear (line/arrow) editor ---

  /** True while a line/arrow is in point-editing mode (point handles shown). */
  get isLineEditing(): boolean {
    return this.appState.current.selectedLinearElement?.isEditing === true;
  }

  /** The `app` surface the vendored LinearElementEditor + snapping read
   *  (scene / state / grid-size / props.gridModeEnabled). */
  #linearApp(): AppClassProperties {
    const self = this;
    return {
      scene: this.scene.scene,
      get state(): AppState {
        return self.appState.current;
      },
      getEffectiveGridSize: () =>
        self.appState.current.gridModeEnabled ? self.appState.current.gridSize : null,
      props: { gridModeEnabled: undefined },
    } as unknown as AppClassProperties;
  }

  /** A structural pointer event carrying just the modifiers the editor inspects. */
  #linearEvent(mods: PointerMods): PointerEvent {
    return {
      shiftKey: mods.shiftKey,
      altKey: mods.altKey,
      metaKey: false,
      ctrlKey: false,
      pointerType: "mouse",
    } as unknown as PointerEvent;
  }

  /** Enter point-editing for the single selected line/arrow (double-click). */
  enterLineEditor(): void {
    const selected = this.selectedElements;
    if (selected.length !== 1) {
      return;
    }
    const el = selected[0]!;
    if (!isLinearElement(el)) {
      return;
    }
    this.appState.setState({
      selectedLinearElement: new LinearElementEditor(
        el,
        this.scene.scene.getNonDeletedElementsMap(),
        true,
      ),
    });
    this.scene.scene.triggerUpdate();
  }

  /** Leave point-editing mode. */
  exitLineEditor(): void {
    if (this.appState.current.selectedLinearElement) {
      this.appState.setState({ selectedLinearElement: null });
      this.scene.scene.triggerUpdate();
    }
  }

  /** Pointer-down while editing a linear element. Returns true if it handled the event. */
  #linearPointerDown(x: number, y: number, mods: PointerMods): boolean {
    const editor = this.appState.current.selectedLinearElement;
    if (!editor?.isEditing) {
      return false;
    }
    const ret = LinearElementEditor.handlePointerDown(
      this.#linearEvent(mods) as unknown as Parameters<
        typeof LinearElementEditor.handlePointerDown
      >[0],
      this.#linearApp(),
      this.#store,
      { x, y },
      editor,
      this.scene.scene,
    );
    if (ret.linearElementEditor) {
      this.appState.setState({ selectedLinearElement: ret.linearElementEditor });
    }
    // clicked a point / segment-midpoint (or added one) → begin a point drag
    if (ret.hitElement || ret.didAddPoint) {
      this.#linearPointerActive = true;
      this.scene.scene.triggerUpdate();
      return true;
    }
    // clicked the element body (no point) → keep editing, no drag
    if (this.#hitTest(x, y) === editor.elementId) {
      this.scene.scene.triggerUpdate();
      return true;
    }
    // clicked empty space → leave the editor and let normal selection take over
    this.exitLineEditor();
    return false;
  }

  /** Pointer-move while dragging a point (or about to add a segment midpoint). */
  #linearPointerMove(x: number, y: number, mods: PointerMods): void {
    const editor = this.appState.current.selectedLinearElement;
    if (!editor?.isEditing) {
      return;
    }
    const app = this.#linearApp();
    const elementsMap = this.scene.scene.getNonDeletedElementsMap();

    if (
      LinearElementEditor.shouldAddMidpoint(
        editor,
        { x, y },
        this.appState.current,
        elementsMap,
      )
    ) {
      const ret = LinearElementEditor.addMidpoint(
        editor,
        { x, y },
        app,
        true,
        this.scene.scene,
      );
      if (ret) {
        this.appState.setState({
          selectedLinearElement: {
            ...editor,
            initialState: ret.pointerDownState,
            selectedPointsIndices: ret.selectedPointsIndices,
            segmentMidPointHoveredCoords: null,
          },
        });
      }
      this.scene.scene.triggerUpdate();
      return;
    }
    // a segment-midpoint drag below the add threshold — wait
    if (
      editor.initialState.segmentMidpoint.value !== null &&
      !editor.initialState.segmentMidpoint.added
    ) {
      return;
    }
    if (editor.initialState.lastClickedPoint > -1) {
      const newState = LinearElementEditor.handlePointDragging(
        this.#linearEvent(mods),
        app,
        x,
        y,
        editor,
      );
      if (newState) {
        this.appState.setState(newState);
      }
      this.scene.scene.triggerUpdate();
    }
  }

  /** Pointer-up ending a point drag. */
  #linearPointerUp(): void {
    this.#linearPointerActive = false;
    const editor = this.appState.current.selectedLinearElement;
    if (!editor?.isEditing) {
      return;
    }
    const next = LinearElementEditor.handlePointerUp(
      this.#linearEvent(NO_MODS),
      editor,
      this.appState.current,
      this.scene.scene,
    );
    this.appState.setState({ selectedLinearElement: next });
    this.#commit();
  }

  pointerDown(clientX: number, clientY: number, mods: PointerMods = NO_MODS): void {
    const { x, y } = this.#toScene(clientX, clientY);
    this.#shiftKey = mods.shiftKey;
    this.#altKey = mods.altKey;

    // laser pointer: start an ephemeral trail (canvas-local coords; not persisted)
    if (this.activeTool === "laser") {
      this.#laser?.startPath(clientX, clientY);
      return;
    }

    // point-editing a linear element intercepts the selection tool
    if (this.activeTool === "selection" && this.isLineEditing) {
      if (this.#linearPointerDown(x, y, mods)) {
        return;
      }
      // fell through (clicked empty + exited editor) → normal selection below
    }

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

    // laser pointer: extend the trail (no-ops unless a stroke is active)
    if (this.activeTool === "laser") {
      this.#laser?.addPointToPath(clientX, clientY);
      return;
    }

    // dragging a point of a linear element being edited
    if (this.#linearPointerActive) {
      const { x, y } = this.#toScene(clientX, clientY);
      this.#linearPointerMove(x, y, mods);
      return;
    }

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
        this.#shiftKey, // shouldRotateWithDiscreteAngle (shift → 15° rotation snap)
        this.#altKey, // shouldResizeFromCenter (alt → resize anchored at center)
        this.#shiftKey, // shouldMaintainAspectRatio (shift → aspect-locked resize)
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
      const map = this.scene.scene.getNonDeletedElementsMap();
      // object snapping: ⌘/Ctrl while dragging (or the grid/snap toggle) aligns to nearby
      // edges/centers/gaps and shows guide lines; the returned snapOffset nudges the drag.
      const dragOffset = { x: x - this.#dragStartX, y: y - this.#dragStartY };
      const app = this.#linearApp();
      const event = {
        shiftKey: mods.shiftKey,
        altKey: mods.altKey,
        ctrlKey: mods.ctrlKey,
        metaKey: mods.metaKey,
      };
      const selectedEls = [...this.selectedElements];
      // prime the reference-points / gaps cache once per drag (App.tsx does the same lazily)
      if (isSnappingEnabled({ event, app, selectedElements: selectedEls })) {
        const all = [...this.scene.scene.getNonDeletedElements()];
        if (!SnapCache.getReferenceSnapPoints()) {
          SnapCache.setReferenceSnapPoints(
            getReferenceSnapPoints(all, selectedEls, app.state, map),
          );
        }
        if (!SnapCache.getVisibleGaps()) {
          SnapCache.setVisibleGaps(getVisibleGaps(all, selectedEls, app.state, map));
        }
      }
      const { snapOffset, snapLines } = snapDraggedElements(
        this.scene.scene.getElementsIncludingDeleted() as ExcalidrawElement[],
        dragOffset,
        app,
        event,
        map,
      );
      this.appState.setState({ snapLines });
      const ox = dragOffset.x + snapOffset.x;
      const oy = dragOffset.y + snapOffset.y;
      for (const el of this.selectedElements) {
        const origin = this.#dragOrigins.get(el.id);
        if (origin) {
          mutateElement(el, map, { x: origin.x + ox, y: origin.y + oy });
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
    // end a laser stroke (stays the active tool — laser is sticky)
    if (this.activeTool === "laser") {
      this.#laser?.endPath();
      return;
    }

    // end a linear-element point drag
    if (this.#linearPointerActive) {
      this.#linearPointerUp();
      return;
    }

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
      SnapCache.destroy(); // drop the per-drag reference-points/gaps cache
      if (this.appState.current.snapLines.length) {
        this.appState.setState({ snapLines: [] });
      }
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
