// Interactive draw controller (Phase 2 → 3) — the first slice of the editor "App".
// Generic-create (rectangle/ellipse/diamond): pointer-down makes a zero-size element, drag resizes
// it. Freedraw: pointer-down starts a stroke, drag accumulates local points (perfect-freehand).
// Mutations go through the vendored model so fractional indices + ShapeCache stay correct.
import {
  deepCopyElement,
  duplicateElement,
  getCommonBounds,
  hitElementItself,
  mutateElement,
  newElement,
  newElementWith,
  newFreeDrawElement,
  resizeTest,
  syncInvalidIndices,
  transformElements,
} from "@excalidraw/element";

import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import { pointFrom } from "@excalidraw/math";

import type { TransformHandleType } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { GlobalPoint, LocalPoint } from "@excalidraw/math";
import type { EditorInterface } from "@excalidraw/common";

import { EditorAppState } from "$lib/state/app-state.svelte.ts";
import { EditorScene } from "$lib/scene/editor-scene.svelte.ts";

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
export type Tool = "selection" | ShapeTool | "freedraw";

type CreateMode = "generic" | "freedraw";

export class DrawController {
  readonly scene = new EditorScene();
  readonly appState = new EditorAppState();
  activeTool = $state<Tool>("rectangle");
  selectedId = $state<string | null>(null);

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

  setTool(tool: Tool): void {
    this.activeTool = tool;
  }

  /** Clear the current selection. */
  deselect(): void {
    this.#select(null);
  }

  /** Delete the selected element(s). */
  deleteSelected(): void {
    const id = this.selectedId;
    if (!id) {
      return;
    }
    this.#elements = this.#elements.filter((e) => e.id !== id);
    this.#select(null);
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
  }

  /** Duplicate the selected element offset by (10,10) and select the copy. */
  duplicateSelected(): void {
    const orig = this.selectedElements[0];
    if (!orig) {
      return;
    }
    const copy = newElementWith(duplicateElement(null, new Map(), orig, true), {
      x: orig.x + 10,
      y: orig.y + 10,
    });
    this.#elements.push(copy);
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
    this.#select(copy.id);
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
    const id = this.selectedId;
    return id ? this.scene.elements.filter((e) => e.id === id) : [];
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
    this.selectedId = id;
    this.appState.setState({ selectedElementIds: id ? { [id]: true } : {} });
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

  /** Which transform handle (corner/edge/rotation) is under a scene point, if the element is selected. */
  #handleAt(x: number, y: number): TransformHandleType | null {
    const sel = this.selectedElements[0];
    if (!sel) {
      return null;
    }
    const handle = resizeTest(
      sel,
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

  #beginResize(handle: TransformHandleType): void {
    this.#resizeHandle = handle;
    this.#resizeOriginals = new Map(
      this.selectedElements.map((e) => [e.id, deepCopyElement(e)]),
    );
    const [x1, y1, x2, y2] = getCommonBounds(this.selectedElements);
    this.#resizeCenterX = (x1 + x2) / 2;
    this.#resizeCenterY = (y1 + y2) / 2;
  }

  pointerDown(clientX: number, clientY: number): void {
    const { x, y } = this.#toScene(clientX, clientY);

    if (this.activeTool === "selection") {
      // a transform handle on the current selection starts a resize/rotate...
      const handle = this.#handleAt(x, y);
      if (handle) {
        this.#beginResize(handle);
        return;
      }
      // ...grabbing inside the current selection starts a move...
      if (this.selectedId && this.#pointInSelection(x, y)) {
        this.#beginDrag(x, y);
        return;
      }
      // ...otherwise hit-test for a new selection (which can then be dragged)
      const hitId = this.#hitTest(x, y);
      if (hitId) {
        this.#select(hitId);
        this.#beginDrag(x, y);
      } else {
        this.#select(null);
      }
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
      });
      this.#mode = "freedraw";
    } else {
      this.#creating = newElement({ type: this.activeTool, x, y, width: 0, height: 0 });
      this.#mode = "generic";
    }

    this.#elements.push(this.#creating);
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
  }

  pointerMove(clientX: number, clientY: number): void {
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
    // end a resize/rotate
    if (this.#resizeHandle) {
      this.#resizeHandle = null;
      this.#resizeOriginals.clear();
      return;
    }

    // end a move-drag
    if (this.#dragging) {
      this.#dragging = false;
      this.#dragOrigins.clear();
      return;
    }

    const creating = this.#creating;
    const mode = this.#mode;
    if (!creating) {
      return;
    }
    this.#creating = null;
    this.#mode = null;

    // discard an accidental click for shapes (no drag → zero size)
    if (mode === "generic" && creating.width < 1 && creating.height < 1) {
      this.#elements = this.#elements.filter((e) => e !== creating);
      syncInvalidIndices(this.#elements);
      this.scene.replaceAllElements(this.#elements);
    }

    // Excalidraw default: revert to selection after drawing one element
    this.activeTool = "selection";
  }
}
