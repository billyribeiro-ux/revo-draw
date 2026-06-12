## Cluster: excalidraw__hooks__0

This cluster contains seven small React hook modules from `packages/excalidraw/hooks/`. They are infrastructure hooks (appState subscription, callback refs, portal containers, emitter bridging, library-item SVG rendering/caching, copy-status, and outside-click detection) rather than canvas/geometry code. Only `useLibraryItemSvg.ts` touches rendering (delegating to the SVG exporter), and `useOutsideClick.ts` has the only non-trivial DOM event logic. No file is empty; none is types-only (each has runtime exports), though `useAppStateValue.ts` and `useOutsideClick.ts` carry significant type declarations.

### packages/excalidraw/hooks/useAppStateValue.ts

Provides hooks to subscribe a component to a narrowed slice of the editor `AppState`, re-rendering (or invoking a callback) only when the selected slice changes.

- `type AppStateSelector` (L9-L12) — union of `keyof AppState | (keyof AppState)[] | ((appState: AppState) => unknown)`. The three accepted selector forms (single key, key array, selector function). Used throughout the file to drive narrowing.
- `getSelectedValue(appState: AppState, selector: AppStateSelector)` (L14-L22) — internal. Resolves a selector against a concrete `appState`: calls the function form, returns the whole `appState` for the array form (the array is used only as a re-render trigger key, not for projection), or indexes by key for the single-key form. No side effects.
- `getLatestValue(api, selector, _internal)` (L24-L52) — internal. Pulls the current `appState` from the Excalidraw API and projects it via `getSelectedValue`. Guards: returns `undefined` if `api.isDestroyed` (L29-L31) or if `api.getAppState()` is falsy and `_internal` is false (L34-L37). For internal callers (`_internal === true`) with a missing appState it logs a warning (L39-L41) and falls back to a synthesized appState `Object.assign({ width:0, height:0, offsetLeft:0, offsetTop:0 }, getDefaultAppState())` (L45-L48) so internal components never receive `undefined` on init. Invariant: internal components are expected to render inside the `<Excalidraw>` tree.
- `useAppStateValue(...)` — overloaded hook with three public signatures (L70-L81): `(prop: K) => AppState[K]`, `(props: (keyof AppState)[]) => AppState`, `(selector: (appState)=>T) => T`; implementation signature `(selector: AppStateSelector, _internal = true) => unknown` (L82-L120). Behavior: grabs the API via `useExcalidrawAPI()` (L86), keeps a throwaway `useState(0)` counter purely as a re-render trigger (L87, `rerender`), and stores subscription state in a lazily-initialized `useRef` holding `{ selector, isInitialized, latestValue }` (L89-L100). On every render it refreshes `stateRef.current.selector` (L101) and, if not yet initialized but the API is now ready, computes and caches the latest value (L102-L105). A `useEffect` keyed on `[api]` (L107-L117) subscribes via `api.onStateChange(selector, cb)`; the callback writes the new value into the ref and bumps the rerender counter (L114-L115). Returns the cached `latestValue` (L119). Side effects: subscription registration/teardown. Performance note: component re-renders only when the subscribed slice actually changes (driven by the API's `onStateChange` diffing), not on every appState update; the array-selector form re-renders on any appState change since it returns the whole state.
- `useOnAppStateChange(...)` — overloaded hook with three public signatures (L128-L139), all returning `undefined`; implementation `(selector, callback) => undefined` (L140-L172). Same subscription model but invokes a `callback` instead of re-rendering. Stores `{ selector, callback }` in a `useRef` (L146-L149) refreshed each render (L150-L151). The `useEffect` keyed on `[api]` (L153-L169) first invokes the callback once with the current value (using `_internal=true`) and the full appState (L158-L161) — so consumers can initialize — then subscribes via `api.onStateChange`, forwarding `(newValue, state)` to the stored callback (L163-L168). Side effect: never triggers a component re-render (returns `undefined`).

### packages/excalidraw/hooks/useCallbackRefState.ts

Tiny hook that bridges React callback-refs to state so a ref'd DOM/instance value can be used reactively.

- `useCallbackRefState<T>()` (L3-L7) — returns a tuple `[refValue, refCallback] as const` where `refValue` is `T | null` state (initialized `null`, L4) and `refCallback` is a stable `useCallback`'d setter (L5) suitable for use as a `ref={refCallback}` prop. Setting the ref updates state, triggering a re-render so consumers react to the node becoming available. No other side effects.

### packages/excalidraw/hooks/useCopiedIndicator.ts

Manages a transient "copied successfully" UI indicator with auto-reset.

- `const TIMEOUT = 2000` (L3) — indicator visible duration in milliseconds.
- `useCopyStatus()` (L5-L27) — holds `copyStatus: "success" | null` state (L6) and a `timeoutRef` (`useRef<number>(0)`, L7). `onCopy` (L9-L16): clears any pending timeout, sets status to `"success"`, and schedules a `window.setTimeout` (stored in the ref) to reset to `null` after `TIMEOUT` ms. `resetCopyStatus` (L18-L20): stable `useCallback` that immediately sets status to `null`. Returns `{ copyStatus, resetCopyStatus, onCopy }` (L22-L26). Side effect: a window timer; invariant — the prior timer is always cleared before a new one is set so the success window resets on repeated copies. Note: `onCopy` is not memoized (recreated each render).

### packages/excalidraw/hooks/useCreatePortalContainer.ts

Creates and manages a detached `<div>` portal container appended to the DOM, themed/classed to match the Excalidraw editor.

- `useCreatePortalContainer(opts?: { className?: string; parentSelector?: string })` (L8-L52) — returns the created `HTMLDivElement | null`. State: `div` (L12). Reads `editorInterface` via `useEditorInterface()` (L14), `theme` via `useUIAppState()` (L15), and `excalidrawContainer` via `useExcalidrawContainer()` (L17).
  - First `useLayoutEffect` (L19-L29, deps `[div, theme, editorInterface.formFactor, opts?.className]`): when `div` exists it resets `className`, re-adds the base `"excalidraw"` class plus any split `opts.className` tokens, toggles `"excalidraw--mobile"` when `editorInterface.formFactor === "phone"`, and toggles `"theme--dark"` when `theme === THEME.DARK`. Keeps the portal's styling in sync with editor theme/form-factor.
  - Second `useLayoutEffect` (L31-L49, deps `[excalidrawContainer, opts?.parentSelector]`): chooses the parent (the element matched by `opts.parentSelector` inside the excalidraw container, else `document.body`), creates a fresh `<div>`, appends it, and stores it in state. Cleanup removes the div from its parent (L46-L48). Invariant: the container is recreated whenever the parent/selector changes; bails out if no parent is found (L36-L38). Side effect: direct DOM mutation (createElement/appendChild/removeChild).

### packages/excalidraw/hooks/useEmitter.ts

Bridges a `@excalidraw/common` `Emitter` to React state so the latest emitted event drives re-renders.

- `useEmitter<TEvent>(emitter: Emitter<[TEvent]>, initialState: TEvent)` (L5-L22) — returns the most recent event value (`TEvent`). Holds `event` state seeded with `initialState` (L9). A `useEffect` keyed on `[emitter]` (L11-L19) subscribes via `emitter.on(cb)` where the callback stores the emitted event into state (L12-L14); cleanup calls the returned `unsubscribe()` (L16-L18). Side effect: emitter subscription lifecycle. Invariant: re-subscribes if the `emitter` identity changes.

### packages/excalidraw/hooks/useLibraryItemSvg.ts

Renders a library item's elements to an `<svg>` (with caching) and injects it into a target DOM node; also exposes a shared SVG cache atom.

- `type SvgCache = Map<LibraryItem["id"], SVGSVGElement>` (L10) — exported cache type keyed by library item id.
- `const libraryItemSvgsCache = atom<SvgCache>(new Map())` (L12) — exported editor-jotai atom holding the shared SVG cache (a single `Map`).
- `exportLibraryItemToSvg(elements)` (L14-L27) — internal async helper. Calls `exportToSvg` from `@excalidraw/utils/export` with a fixed export appState: `exportBackground: false`, `viewBackgroundColor: COLOR_PALETTE.white`, `files: null`, `renderEmbeddables: false`, `skipInliningFonts: true` (L17-L26). TODO comments note theme is not yet passed (relies on CSS filter) and that font inlining is skipped. Returns the produced `SVGSVGElement`. This is the only file in the cluster that performs actual rendering work.
- `useLibraryItemSvg(id, elements, svgCache, ref)` (L29-L85) — returns `SVGSVGElement | undefined`. State: `svg` (L35).
  - Effect 1 (L37-L66, deps `[id, elements, svgCache, setSvg]`): when `elements` exist and an `id` is present, tries `svgCache.get(id)`; cache hit sets state directly (L43-L44), otherwise exports asynchronously, strips the `.style-fonts` `<style>` node from the result (L50), writes it into the cache, and sets state (L52-L55). When no `id` (e.g. ad-hoc canvas selection) it always exports fresh without caching (L59-L63). Note: async IIFEs are not cancellable, so a late resolution can set state for a stale id (no abort guard).
  - Effect 2 (L68-L82, deps `[svg, ref]`): imperatively injects the SVG into the provided `ref` node via `node.innerHTML = svg.outerHTML` (L75-L76); cleanup clears the node's `innerHTML` (L79-L81). Side effect: direct DOM `innerHTML` mutation.
- `useLibraryCache()` (L87-L101) — reads the `libraryItemSvgsCache` atom (L88) and returns `{ clearLibraryCache, deleteItemsFromLibraryCache, svgCache }`. `clearLibraryCache` (L90) clears the whole map; `deleteItemsFromLibraryCache(items)` (L92-L94) removes the listed ids. These mutate the shared `Map` in place (the atom value is not reassigned), so consumers reading the same `Map` reference see the change. Neither helper is memoized.

### packages/excalidraw/hooks/useOutsideClick.ts

Generic "click outside the referenced element" detector that handles edge cases around Radix portals, detached targets, and opt-out containers.

- `useOutsideClick<T extends HTMLElement>(ref, callback, isInside?)` (L5-L87) — no return value. Params: `ref` (`React.RefObject<T | null>`); `callback: (event: Event & { target: T }) => void` invoked when an outside click is detected (caller should memoize for perf, per L7 comment); optional `isInside(event, container) => boolean | undefined` override (L20-L24) that can force inside/outside classification.
  - Inside a single `useEffect` (deps `[ref, callback, isInside]`, L26-L86) it defines `onOutsideClick(event)` (L27-L76):
    - Casts the event to carry a typed `target` (L28); bails if `ref.current` is unset (L30-L32).
    - Consults `isInside` override (L34): `true` → treat as inside, return (L36-L37); `false` → treat as outside, call `callback` and return (L38-L39); `undefined` → fall through to default logic.
    - Default classification: returns (no callback) if the target is contained within `ref.current`, OR if the target is no longer attached to `document.documentElement` (L43-L49) — the detached-target case is explicitly handled because an element can be removed on a `pointerup` fired before this handler runs.
    - Radix-portal heuristic (L53-L60): treats clicks inside `[data-radix-portal]`, or on the `<html>` element while `document.body.style.pointerEvents === "none"` (Radix modal mode), as "part of the UI" and returns without firing the callback (L66-L68). Comments flag this as an intentional hack with minor downside.
    - Opt-out: returns if the target is inside a `[data-prevent-outside-click]` ancestor (L71-L73).
    - Otherwise fires `callback(_event)` (L75).
  - Listeners are attached to `EVENT.POINTER_DOWN` and `EVENT.TOUCH_START` on `document` (L79-L80), with matching removal on cleanup (L82-L85). Comment (L78) explains `click` is deliberately avoided because it reports an incorrect `event.target`. Side effects: document-level event listener lifecycle. This hook carries the only meaningful DOM/event-coordination logic in the cluster — relevant for parity since correct outside-click classification (portal/detached/opt-out handling) governs popup/menu dismissal behavior.
