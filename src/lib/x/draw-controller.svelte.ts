// Minimal interactive draw controller (Phase 2 → 3) — the first slice of the editor "App".
// Implements Excalidraw's generic-create gesture: pointer-down creates a zero-size element, drag
// resizes it (negative-direction aware), pointer-up finalizes and reverts to the selection tool.
// Mutations go through the vendored model so fractional indices + ShapeCache stay correct.
import { mutateElement, newElement, syncInvalidIndices } from "@excalidraw/element";

import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { EditorAppState } from "$lib/state/app-state.svelte.ts";
import { EditorScene } from "$lib/scene/editor-scene.svelte.ts";

export type ShapeTool = "rectangle" | "ellipse" | "diamond";
export type Tool = "selection" | ShapeTool;

export class DrawController {
  readonly scene = new EditorScene();
  readonly appState = new EditorAppState();
  activeTool = $state<Tool>("rectangle");

  // Working element list — the source of truth we replace the Scene with on structural changes.
  #elements: ExcalidrawElement[] = [];
  #creating: ExcalidrawElement | null = null;
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

    const el = newElement({
      type: this.activeTool,
      x,
      y,
      width: 0,
      height: 0,
    });
    this.#creating = el;
    this.#elements.push(el);
    // structural change → re-sync indices + validate via the Scene
    syncInvalidIndices(this.#elements);
    this.scene.replaceAllElements(this.#elements);
  }

  pointerMove(clientX: number, clientY: number): void {
    if (!this.#creating) {
      return;
    }
    const { x, y } = this.#toScene(clientX, clientY);
    // negative-direction aware: position at the min corner, size is the abs delta
    mutateElement(this.#creating, this.scene.scene.getNonDeletedElementsMap(), {
      x: Math.min(this.#originX, x),
      y: Math.min(this.#originY, y),
      width: Math.abs(x - this.#originX),
      height: Math.abs(y - this.#originY),
    });
    // mutateElement invalidates ShapeCache; bump the reactive signal to repaint
    this.scene.scene.triggerUpdate();
  }

  pointerUp(): void {
    const creating = this.#creating;
    if (!creating) {
      return;
    }
    this.#creating = null;

    // discard an accidental click (no drag → zero size)
    if (creating.width < 1 && creating.height < 1) {
      this.#elements = this.#elements.filter((e) => e !== creating);
      syncInvalidIndices(this.#elements);
      this.scene.replaceAllElements(this.#elements);
    }

    // Excalidraw default: revert to selection after drawing one shape
    this.activeTool = "selection";
  }
}
