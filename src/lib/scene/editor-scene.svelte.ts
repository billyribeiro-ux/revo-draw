// Reactive Svelte 5 bridge over Excalidraw's vendored `Scene`.
//
// `Scene` (src/lib/element/Scene.ts) remains the sole, faithful owner of element data, ordering
// (fractional index) and its caches. It already broadcasts every mutation through `onUpdate`
// callbacks + a `sceneNonce`. We bridge that to a single `$state` counter: reactive views read a
// getter that touches the counter, so any component/renderer that reads `scene.elements`
// re-runs whenever the Scene mutates — without making `Scene` itself a deep `$state` proxy
// (which would defeat its identity-based caches).
import { Scene } from "@excalidraw/element";

import type {
  ElementsMapOrArray,
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

export class EditorScene {
  /** The vendored Excalidraw Scene — canonical element store + ordering. */
  readonly scene: Scene;

  // Bumped on every Scene mutation via `onUpdate`. Reactive getters depend on it.
  #version = $state(0);

  constructor(initialElements: ElementsMapOrArray = []) {
    // Always seed with a (possibly empty) array so Scene fully initializes its internal arrays —
    // `new Scene(null)` skips replaceAllElements and leaves getNonDeletedElements() undefined.
    // The initial population fires before we subscribe — intentional: it isn't a user mutation.
    this.scene = new Scene(initialElements);
    this.scene.onUpdate(() => {
      this.#version++;
    });
  }

  /** Reactive — non-deleted elements in fractional-index order. */
  get elements(): readonly NonDeletedExcalidrawElement[] {
    this.#version;
    return this.scene.getNonDeletedElements();
  }

  /** Reactive — all elements including `isDeleted` tombstones. */
  get allElements(): readonly ExcalidrawElement[] {
    this.#version;
    return this.scene.getElementsIncludingDeleted();
  }

  /** A monotonically-increasing signal that changes on every mutation (cheap render trigger). */
  get version(): number {
    return this.#version;
  }

  replaceAllElements(elements: ElementsMapOrArray): void {
    this.scene.replaceAllElements(elements);
  }
}
