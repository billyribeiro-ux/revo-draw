## Cluster: excalidraw__context

This cluster holds the two React Context modules that the Excalidraw editor uses to (a) wire up "tunnels" (portal-like render targets that let library consumers inject UI into predefined slots) and (b) expose a read-only, UI-facing slice of the editor's `AppState` to deeply nested components without prop-drilling.

### packages/excalidraw/context/tunnels.ts

Purpose: Defines the React Context, hooks, and Jotai isolation used to drive the "tunnel-rat" portal system that lets host applications render custom UI into named slots (MainMenu, Footer, WelcomeScreen hints, Sidebar triggers, dialogs) inside the Excalidraw component tree.

Key constructs (this file is mostly type + context plumbing, with one real factory hook):

- `export type Tunnel = ReturnType<typeof tunnel>;` (L5) — Type alias for an individual tunnel instance produced by the `tunnel-rat` library's default export `tunnel()`. Each `Tunnel` is a `{ In, Out }` portal pair: components render into `Tunnel.In` somewhere in the tree and the content appears wherever `Tunnel.Out` is mounted. Types-only; no runtime behavior.

- `type TunnelsContextValue = { ... }` (L7-L21) — Internal (non-exported) interface describing the full set of named tunnels carried by the context. Members are all of type `Tunnel`: `MainMenuTunnel`, `WelcomeScreenMenuHintTunnel`, `WelcomeScreenToolbarHintTunnel`, `WelcomeScreenHelpHintTunnel`, `WelcomeScreenCenterTunnel`, `FooterCenterTunnel`, `DefaultSidebarTriggerTunnel`, `DefaultSidebarTabTriggersTunnel`, `OverwriteConfirmDialogTunnel`, `TTDDialogTriggerTunnel` (TTD = Text-To-Diagram). It also carries `tunnelsJotai: ReturnType<typeof createIsolation>` (L20) — an isolated Jotai store scope. The inline comment (L18-L19) flags `tunnelsJotai` as a temporary measure to be removed "once we create jotai stores per each editor instance," i.e. it is the per-editor-instance Jotai isolation boundary so multiple `<Excalidraw>` instances on one page don't share atom state.

- `export const TunnelsContext = React.createContext<TunnelsContextValue>(null!)` (L23) — The React context object. Initialized with `null!` (non-null assertion) meaning consumers MUST be rendered inside a provider; reading it outside a provider yields `null` at runtime despite the non-null type. Invariant: a `TunnelsContext.Provider` value produced by `useInitializeTunnels` must wrap any component calling `useTunnels`.

- `export const useTunnels = () => React.useContext(TunnelsContext);` (L25) — Trivial hook returning the current `TunnelsContextValue`. No params, returns `TunnelsContextValue`. Side-effect-free; just `useContext`. Consumers destructure the specific tunnel(s) they need (e.g. `const { MainMenuTunnel } = useTunnels()`).

- `const tunnelsJotai = createIsolation();` (L27) — Module-level (non-exported) singleton: a single Jotai isolation scope created once at module load via `jotai-scope`'s `createIsolation()`. NOTE / performance-and-correctness detail: because it is created at module scope (not inside `useInitializeTunnels`), every editor instance created in the same JS module realm shares this one isolation object — this is exactly the limitation the L18-L19 comment describes. Reused by reference inside the memoized factory below.

- `export const useInitializeTunnels = () => { ... }` (L29-L45) — The one substantive hook. Signature: `() => TunnelsContextValue`. Returns a `React.useMemo`-wrapped object (L30-L44) that freshly constructs each of the ten named tunnels by calling `tunnel()` (L32-L41) and attaches the shared module-level `tunnelsJotai` (L42). The `useMemo` dependency array is empty `[]` (L44), so the tunnel set is created exactly once per component-instance lifetime and remains referentially stable across re-renders. Behavior/invariant: each call site (each mounted `<Excalidraw>`) gets its own fresh set of tunnel portal pairs (so two editors don't bleed UI into each other) but shares the single `tunnelsJotai` scope. The returned value is intended to be fed straight into `<TunnelsContext.Provider value={...}>`. No side effects beyond memo allocation; performance characteristic is "construct ten portals once, then stable."

No exported functions perform geometry, coordinate-space, or numeric work here — this is pure React/portal context wiring.

### packages/excalidraw/context/ui-appState.ts

Purpose: Provides the React Context and accessor hook for the `UIAppState` — the curated, UI-only projection of the editor's full `AppState` — so deeply nested UI components can read render-relevant app state without prop-drilling or subscribing to the entire mutable editor state.

This file is essentially context-plumbing only (no algorithms, no internal helpers):

- Import `type { UIAppState } from "../types"` (L3) — The state shape lives in `packages/excalidraw/types.ts`; this module only references it as a type, so the content/breadth of `UIAppState` is defined elsewhere (it is the subset of `AppState` deemed safe/relevant for UI consumption).

- `export const UIAppStateContext = React.createContext<UIAppState>(null!)` (L5) — The React context carrying the current `UIAppState`. Initialized with `null!` (non-null assertion), so the typed value is `UIAppState` but at runtime it is `null` until a provider supplies a real value. Invariant: components calling `useUIAppState` must be descendants of a `UIAppStateContext.Provider` (the editor `App` supplies the provider value, typically a memoized projection of its `AppState`); reading outside a provider returns `null` and will throw on property access. Performance note: because this is a single context value, any change to the provided `UIAppState` object re-renders all `useUIAppState` consumers — so the provider is expected to pass a derived/stable UI-only object rather than the raw, frequently-mutating full `AppState`.

- `export const useUIAppState = () => React.useContext(UIAppStateContext);` (L6) — Trivial accessor hook. Signature: `() => UIAppState`. No params, side-effect-free; just delegates to `React.useContext(UIAppStateContext)`. This is the canonical read path for UI components needing app state (theme, view mode, active tool, zoom, selected element ids, open dialogs, etc., per `UIAppState`'s definition in `types.ts`).

No geometry, coordinate-space, math, or performance-critical loops in this file — it is a 6-line context/hook definition.
