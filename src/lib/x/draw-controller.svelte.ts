// Interactive draw controller (Phase 2 → 3) — the first slice of the editor "App".
// Generic-create (rectangle/ellipse/diamond): pointer-down makes a zero-size element, drag resizes
// it. Freedraw: pointer-down starts a stroke, drag accumulates local points (perfect-freehand).
// Mutations go through the vendored model so fractional indices + ShapeCache stay correct.
import { mutateElement, newElement, newFreeDrawElement, syncInvalidIndices } from "@excalidraw/element";

import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import { pointFrom } from "@excalidraw/math";

import type { ExcalidrawElement, ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { EditorAppState } from "$lib/state/app-state.svelte.ts";
import { EditorScene } from "$lib/scene/editor-scene.svelte.ts";

export type ShapeTool = "rectangle" | "ellipse" | "diamond";
export type Tool = "selection" | ShapeTool | "freedraw";

type CreateMode = "generic" | "freedraw";

export class DrawController {
  readonly scene = new EditorScene();
  readonly appState = new EditorAppState();
  activeTool = $state<Tool>("rectangle");

  #elements: ExcalidrawElement[] = [];
  #creating: ExcalidrawElement | null = null;
  #mode: CreateMode | null = null;
  #originX = 0;
  #originY = 0;

  setTool(tool: Tool): void {
    this.activeTool = tool;
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

  pointerDown(clientX: number, clientY: number): void {
    if (this.activeTool === "selection") {
      return;
    }
    const { x, y } = this.#toScene(clientX, clientY);
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
