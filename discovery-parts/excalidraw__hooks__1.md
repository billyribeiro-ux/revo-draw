## Cluster: excalidraw__hooks__1

This cluster contains five small React hook/utility modules from `packages/excalidraw/hooks/`. They are infrastructure helpers (scroll tracking, stable references/callbacks, text-editor caret management, and a `useTransition` polyfill) rather than canvas/geometry code. No file is empty; one (`useTextEditorFocus.ts`) is the largest and exports both a hook and several standalone DOM utilities.

### packages/excalidraw/hooks/useScrollPosition.ts

Hook that tracks the vertical scroll offset of a referenced scrollable element and publishes it into a shared jotai atom.

- Module constant `scrollPositionAtom = atom<number>(0)` (L6): a jotai atom holding the latest `scrollTop` value, initialized to 0. Shared at module scope, so all consumers of `useScrollPosition` read/write the same global scroll value (not per-element/per-instance).
- `useScrollPosition = <T extends HTMLElement>(elementRef: React.RefObject<T | null>) => number` (L8-L33): React hook.
  - Reads/writes the shared atom via `useAtom(scrollPositionAtom)` → `[scrollPosition, setScrollPosition]` (L11).
  - In a `useEffect` (L13-L30), grabs `elementRef.current`; bails (returns undefined cleanup) if the element is null (L14-L17).
  - Defines `handleScroll` as a `lodash.throttle` of a function that reads `element.scrollTop` and calls `setScrollPosition(scrollTop)`, throttled to **200ms** (L19-L22). This is the key performance detail: scroll events are leading/trailing-throttled to at most once per 200ms.
  - Attaches the listener via `element.addEventListener("scroll", handleScroll)` (L24).
  - Cleanup (L26-L29) calls `handleScroll.cancel()` (cancels any pending trailing throttle invocation) and removes the listener.
  - Effect deps are `[elementRef, setScrollPosition]` (L30); `setScrollPosition` is a stable jotai setter so the effect effectively re-runs only when the ref identity changes.
  - Returns the current `scrollPosition` number (L32).
  - Side effects: DOM event listener registration, global atom mutation. Invariant: only `scrollTop` (vertical) is tracked; horizontal scroll is ignored.

### packages/excalidraw/hooks/useStable.ts

Hook that returns a single persistent object whose fields are continuously overwritten with the latest values, giving callers a stable reference that always reflects current data.

- `useStable = <T extends Record<string, any>>(value: T) => T` (L3-L7): React hook.
  - Holds the original `value` in a `useRef<T>(value)` so the ref object identity is created once (L4).
  - On every render, `Object.assign(ref.current, value)` mutates the persisted object in place to copy the latest `value`'s enumerable own properties onto it (L5).
  - Returns `ref.current` (L6) — the same object reference across renders, but with up-to-date field values.
  - Notable behavior/invariant: this is a shallow merge that only **adds/overwrites** keys present in the new `value`; keys removed from `value` between renders are NOT deleted from `ref.current` (they persist). Useful for passing "always current" data into closures/effects without retriggering them on reference change. No cleanup, no subscriptions.

### packages/excalidraw/hooks/useStableCallback.ts

Hook that returns a function with a stable identity across renders that always invokes the latest version of the supplied callback.

- `useStableCallback = <T extends (...args: any[]) => any>(userFn: T) => T` (L6-L18): React hook (file-level JSDoc "Returns a stable function of the same type." at L3-L5).
  - Stores `{ userFn, stableFn? }` in a `useRef` initialized with the current `userFn` (L9).
  - On every render updates `stableRef.current.userFn = userFn` so the latest callback is always referenced (L10).
  - Lazily creates `stableFn` exactly once (guarded by `if (!stableRef.current.stableFn)`, L12): a wrapper `(...args) => stableRef.current.userFn(...args)` cast to `T` (L13-L14).
  - Returns the memoized `stableFn` (L17), which never changes identity for the component's lifetime.
  - Invariant/behavior: classic "latest ref" pattern — the returned function reference is stable (safe in deps arrays / event handlers) while always calling the freshest closure. No cleanup; no React 18 `useEffectEvent` dependency.

### packages/excalidraw/hooks/useTextEditorFocus.ts

Utilities and a hook for saving/restoring the caret (text-selection) position of the WYSIWYG `<textarea>` text editor, used to preserve cursor state across UI actions (e.g. opening popovers in compact mode).

- Type `CaretPosition = { start: number; end: number }` (L4-L7): exported type describing a textarea selection range.
- `getTextEditor = (): HTMLTextAreaElement | null` (L10-L12): internal helper; `document.querySelector(".excalidraw-wysiwyg")` cast to `HTMLTextAreaElement`. Side effect: DOM query against the well-known WYSIWYG editor class. Invariant: assumes at most one such element.
- `saveCaretPosition = (): CaretPosition | null` (L15-L24): exported. Returns `{ start: textEditor.selectionStart, end: textEditor.selectionEnd }` of the current text editor, or `null` if no editor is present.
- `restoreCaretPosition = (position: CaretPosition | null): void` (L26-L37): exported. Inside a `setTimeout(..., 0)` (deferring to the next macrotask so focus/selection apply after the current event loop), focuses the editor and, if `position` is non-null, sets `selectionStart`/`selectionEnd` to restore the caret. Side effect: focuses DOM element + mutates selection. The 0ms timeout is the key non-obvious detail — needed so focus/selection survive re-renders/blur happening synchronously.
- `withCaretPositionPreservation = (callback: () => void, isCompactMode: boolean, isEditingText: boolean, onPreventClose?: () => void): void` (L39-L61): exported wrapper that runs `callback` while preserving caret state under compact-mode editing.
  - If `isCompactMode && onPreventClose`, calls `onPreventClose()` first to stop a popover from closing (L46-L48).
  - Saves caret position only when `isCompactMode && isEditingText` (else `null`) (L51-L52).
  - Executes `callback()` (L55).
  - Restores caret position when `isCompactMode && isEditingText` (L58-L60).
  - Invariant: caret save/restore is conditional on compact mode AND active text editing; otherwise it's a plain `callback()` pass-through.
- `useTextEditorFocus = ()` (L64-L97): exported hook returning an object of caret-management helpers.
  - State: `savedCaretPosition` via `useState<CaretPosition | null>(null)` (L65-L66).
  - `saveCaretPositionToState = useCallback(() => { setSavedCaretPosition(saveCaretPosition()); }, [])` (L68-L71): captures current caret into state. Stable identity (empty deps).
  - `restoreCaretPositionFromState = useCallback(() => {...}, [savedCaretPosition])` (L73-L85): inside `setTimeout(..., 0)` focuses the editor and, if a position is stored, restores `selectionStart`/`selectionEnd` then clears the stored position via `setSavedCaretPosition(null)` (L81). Re-created whenever `savedCaretPosition` changes.
  - `clearSavedPosition = useCallback(() => setSavedCaretPosition(null), [])` (L87-L89): resets stored caret state.
  - Returns `{ saveCaretPosition: saveCaretPositionToState, restoreCaretPosition: restoreCaretPositionFromState, clearSavedPosition, hasSavedPosition: !!savedCaretPosition }` (L91-L96) — note the returned keys re-alias the internal callbacks and expose a boolean `hasSavedPosition`.
  - Side effects: focus/selection DOM mutation, React state updates.
- `temporarilyDisableTextEditorBlur = (duration: number = 100): void` (L100-L112): exported. Captures `textEditor.onblur`, sets `textEditor.onblur = null`, and restores the original handler after `duration` ms (default **100ms**) via `setTimeout` (L105-L110). Used to prevent the editor's blur handler from firing during a brief window (e.g. clicking a toolbar control). Side effect: temporary mutation of the element's `onblur` property. Invariant: assumes the editor exists for the whole window; if removed, restoration targets the (possibly stale) captured element.

### packages/excalidraw/hooks/useTransition.ts

Provides `React.useTransition` when available, with a no-op polyfill for React 17.

- `useTransitionPolyfill(): readonly [false, (callback: () => void) => void]` (L4-L7): internal fallback. Returns a tuple `[isPending=false, startTransition]` where `startTransition` is a `useCallback` that synchronously invokes its callback (no actual transition/deferral). Marked as "noop polyfill for v17. Subset of API available" (L3).
- `useTransition = React.useTransition || useTransitionPolyfill` (L9): exported. Picks the native React 18 `useTransition` if present, otherwise the polyfill. Behavior detail: under the polyfill, `isPending` is always `false` and transitions are not actually deferred, so any code relying on low-priority scheduling degrades to synchronous execution on React 17.
