// Runes-backed editor application state — the Svelte 5 home for Excalidraw's `AppState`.
//
// Excalidraw keeps one big `AppState` object in React component state and updates it immutably
// via `setState(partial)`. We mirror that exactly: a single `$state` holds the whole object and
// `setState` replaces it with a merged copy, so every read (`appState.current.zoom`, …) is
// reactive and updates flow through one funnel — matching the original's update discipline.
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import type { AppState } from "@excalidraw/excalidraw/types";

/**
 * A complete initial `AppState`. `getDefaultAppState()` omits the four viewport-derived fields
 * (`offsetTop`/`offsetLeft`/`width`/`height`); the editor fills them once the canvas is measured.
 */
export function createInitialAppState(): AppState {
  return {
    ...getDefaultAppState(),
    offsetTop: 0,
    offsetLeft: 0,
    width: 0,
    height: 0,
  };
}

export class EditorAppState {
  current = $state<AppState>(createInitialAppState());

  /** Immutable, React-`setState`-style partial update. Replaces `current` with a merged copy. */
  setState(patch: Partial<AppState>): void {
    this.current = { ...this.current, ...patch };
  }

  /** Restore the default state (e.g. on "reset canvas"). */
  reset(): void {
    this.current = createInitialAppState();
  }
}
