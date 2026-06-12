## Cluster: excalidraw-app__components__0

This cluster covers seven app-shell React components from `excalidraw-app/components/`: the AI/diagram plugins wiring, the footer, the hamburger main menu, the right-side promo sidebar, the welcome screen, the visual-debug canvas (the only file with real geometry/canvas code), and the encrypted-storage badge.

---

### excalidraw-app/components/AI.tsx

Wires the app's AI features (Diagram-to-Code and Text-to-Diagram) to Excalidraw's plugin components by supplying network callbacks against the `VITE_APP_AI_BACKEND` backend.

- `AIComponents({ excalidrawAPI }: { excalidrawAPI: ExcalidrawImperativeAPI })` — React component (returns a fragment). L16-L125. Renders a `<DiagramToCodePlugin>` plus a `<TTDDialog>`, each given an async handler. Owns no state/refs/effects; it is purely a wiring layer between the imperative `excalidrawAPI` and the two plugin components.
  - `DiagramToCodePlugin.generate` async callback `async ({ frame, children }) => { html }` — L24-L101. Reads current app state via `excalidrawAPI.getAppState()`; rasterizes the frame's `children` to a JPEG blob via `exportToBlob` (forcing `exportBackground: true`, passing `exportingFrame: frame`, files from `excalidrawAPI.getFiles()`, `mimeType: MIME_TYPES.jpg`); converts blob to a data URL with `getDataURL`; extracts text from children via `getTextFromElements`; POSTs `{ texts, image: dataURL, theme }` as JSON to `/v1/ai/diagram-to-code/generate`. On `!response.ok` it reads the body, `safelyParseJSON`s it, throws raw text if unparseable, returns an inline HTML "too many requests" page when `errorJSON.statusCode === 429` (L69-L84, links to Excalidraw+), else throws `errorJSON.message`. On success parses `{ html }` and throws "Generation failed (invalid response)" if `html` is falsy or JSON parse fails. Side effect: network fetch. Notable: the 429 branch returns user-facing HTML rather than throwing.
  - `TTDDialog.onTextSubmit` async callback `async (props) => result` — L105-L120. Destructures `{ onChunk, onStreamCreated, signal, messages }` and delegates to `TTDStreamFetch` against `/v1/ai/text-to-diagram/chat-streaming` with `extractRateLimits: true`, forwarding the abort `signal`. Returns the stream result. `persistenceAdapter={TTDIndexedDBAdapter}` (from `../data/TTDStorage`) persists chat history.

---

### excalidraw-app/components/AppFooter.tsx

Renders the editor footer content: the visual-debugger controls (when enabled) and the end-to-end-encryption badge (for non-signed-in users).

- `AppFooter` = `React.memo(({ onChange }: { onChange: () => void }) => …)` — L9-L26. Memoized component. Renders Excalidraw's `<Footer>` wrapping a flex row (`gap: .5rem`, `alignItems: center`). Conditionally renders `<DebugFooter onChange={onChange} />` only if `isVisualDebuggerEnabled()` is true, and `<EncryptedIcon />` only if `!isExcalidrawPlusSignedUser`. No own state/refs/effects; `onChange` is forwarded to `DebugFooter`. Pure conditional composition.

---

### excalidraw-app/components/AppMainMenu.tsx

Defines the app's hamburger MainMenu: default file/collab/help items plus app-specific Excalidraw+ links, a dev-only Visual Debug toggle, and theme/language controls.

- `AppMainMenu` = `React.memo((props) => …)` — L18-L92. Props: `onCollabDialogOpen: () => any`, `isCollaborating: boolean`, `isCollabEnabled: boolean`, `theme: Theme | "system"`, `setTheme: (theme: Theme | "system") => void`, `refresh: () => void`. Renders `<MainMenu>` with default items (LoadScene, SaveToActiveFile, Export, SaveAsImage), a conditional `LiveCollaborationTrigger` (only when `isCollabEnabled`, wired to `onCollabDialogOpen`), CommandPalette, SearchMenu, Help, ClearCanvas, then Excalidraw+ promo link (URL built from `VITE_APP_PLUS_LP`), Socials, and a sign-in/sign-up link (URL from `VITE_APP_PLUS_APP`, path `/sign-up` when not signed in; label toggles "Sign in"/"Sign up" on `isExcalidrawPlusSignedUser`). No own state/effects.
  - Dev-only Visual Debug `MainMenu.Item` `onSelect` handler — L62-L78. Rendered only when `isDevEnv()`. Toggles `window.visualDebug`: if present, `delete window.visualDebug` and `saveDebugState({ enabled: false })`; otherwise sets `window.visualDebug = { data: [] }` and `saveDebugState({ enabled: true })`. Then calls `props?.refresh()`. Side effects: mutates the global `window.visualDebug` and localStorage (via `saveDebugState`).
  - Trailing items: `Preferences`, `ToggleTheme` (`allowSystemTheme`, controlled by `theme`/`setTheme`), `LanguageList` inside `MainMenu.ItemCustom`, and `ChangeCanvasBackground`.

---

### excalidraw-app/components/AppSidebar.tsx

Renders the right-side `DefaultSidebar` with two promo tabs ("comments" and "presentation") advertising Excalidraw+ features. Imports `./AppSidebar.scss`.

- `AppSidebar` = `() => …` — L11-L79. Reads `{ theme, openSidebar }` from `useUIAppState()` (the only hook). Renders `<DefaultSidebar>` with two `Sidebar.TabTrigger`s ("comments", "presentation"); each trigger's `opacity` is `1` when `openSidebar?.tab` matches that tab, else `0.4` (active-tab visual emphasis). Two `Sidebar.Tab`s each render a promo container whose background image is theme-dependent: comments tab uses `/oss_promo_comments_{dark|light}.jpg` at `opacity: 0.7`; presentation tab uses `/oss_promo_presentations_{dark|light}.svg` at `backgroundSize: 60%`, `opacity: 0.4`. Theme branch keyed on `theme === THEME.DARK`. Each tab has a `LinkButton` to a `VITE_APP_PLUS_LP` sign-up URL with a `#excalidraw-redirect` anchor. Notable: the image URL is injected via a CSS custom property `--image-source` (cast `["--image-source" as any]`). No own state/refs/effects beyond the context hook.

---

### excalidraw-app/components/AppWelcomeScreen.tsx

Renders the initial WelcomeScreen overlay (hints + centered logo/heading/menu), with heading text and menu items differing for signed-in vs guest users.

- `AppWelcomeScreen` = `React.memo((props) => …)` — L9-L82. Props: `onCollabDialogOpen: () => any`, `isCollabEnabled: boolean`. Uses `useI18n()` for `t`. Computes `headingContent` (L14-L45): if `isExcalidrawPlusSignedUser`, takes the `welcomeScreen.app.center_heading_plus` translation and `.split(/(Excalidraw\+)/)` so the literal "Excalidraw+" token is replaced with an `<a>` to `VITE_APP_PLUS_APP` (with `pointerEvents: POINTER_EVENTS.inheritFromUI`); otherwise builds a 3-line heading from `center_heading`/`center_heading_line2`/`center_heading_line3` separated by `<br />`. Renders `<WelcomeScreen>` with `MenuHint`, `ToolbarHint`, `HelpHint`, then a centered `Logo`, `Heading`, and `Menu` (LoadScene, Help, conditional LiveCollaborationTrigger when `isCollabEnabled`, and a guest-only sign-up `MenuItemLink` to `VITE_APP_PLUS_LP` with `shortcut={null}`). No own state/refs/effects.

---

### excalidraw-app/components/DebugCanvas.tsx

The visual-debug overlay: a pure Canvas-2D renderer that draws debug geometry (line segments, cubic beziers, polygons), arrow-binding diagnostics, and a world-origin crosshair, plus a footer to step through debug frames. This is the only geometry-bearing file in the cluster — important for parity.

Coordinate space: all debug geometry is in world space and is rendered by multiplying each coordinate by `zoom` (no DPR factor inside the primitives — DPR/scale is handled by `getNormalizedCanvasDimensions`/`bootstrapCanvas`). Pan is applied once via a context `translate(scrollX*zoom, scrollY*zoom)` in `_debugRenderer`.

- `renderLine(context, zoom, segment: LineSegment<GlobalPoint>, color)` — L44-L57. Saves context, sets `strokeStyle`, strokes a line from `segment[0]*zoom` to `segment[1]*zoom`, restores. Side effect: draws on canvas.
- `renderCubicBezier(context, zoom, [start, control1, control2, end]: Curve<GlobalPoint>, color)` — L59-L79. Draws a cubic Bézier via `bezierCurveTo`, all four points scaled by `zoom`. Destructures the curve's 4 control points from the array.
- `renderPolygon(context, zoom, polygon: DebugPolygon, color)` — L81-L114. Early-returns if `points.length < 2`. Moves to `points[0]*zoom`, lines to each subsequent point scaled by `zoom`; calls `closePath()` unless `close === false`. If `fill`, fills at `globalAlpha = 0.15` with `color` (in a nested save/restore), then strokes the outline. Notable: fill is semi-transparent (0.15), stroke is opaque.
- `isDebugPolygon(data: DebugElement["data"]): data is DebugPolygon` — L116-L117. Type guard: true when `(data as DebugPolygon).type === "polygon"`.
- `renderOrigin(context, zoom)` — L119-L129. Draws a grey (`#888`) "X" crosshair at the world origin spanning ±10 (scaled by `zoom`). Note bug-ish detail: two `context.save()` calls and no matching `restore()` (leaves the strokeStyle/state on the stack).
- `_renderBinding(context, binding: FixedPointBinding, elementsMap, zoom, width, height, color)` — L131-L169. Warns and returns if `binding.fixedPoint` is missing. Resolves the bindable element from `elementsMap`, computes the global fixed point via `getGlobalFixedPointForBindableElement`, then strokes a cubic Bézier from `(x*zoom, y*zoom)` bulging to the upper-left (`x*zoom - width, y*zoom ∓ height`) back to the same point — a small loop visualizing the arrow-side binding. `lineWidth = 1`.
- `_renderBindableBinding(binding, context, elementsMap, zoom, width, height, color)` — L171-L209. Same as `_renderBinding` but the control points bulge to the lower/right (`x*zoom + width, …`), visualizing the bindable-element side of the binding. Note the parameter order differs (`binding` first). `lineWidth = 1`.
- `renderBindings(context, elements: readonly OrderedExcalidrawElement[], zoom)` — L211-L299. Builds `elementsMap = arrayToMap(elements)`; uses `dim = 16` for both width/height. For each non-deleted element: if it's an arrow, renders its `startBinding`/`endBinding` via `_renderBinding` (color "red" when `mode === "orbit"`, else "black"), but only if the bound element actually back-references this arrow in its `boundElements` (consistency check — skips dangling bindings). If it's a bindable element with `boundElements`, for each bound arrow it renders the bindable-side binding in "green" when the arrow's start/end binding points back to this element. Invariant: bindings are only drawn when both directions of the binding reference agree.
- `render(frame: DebugElement[], context, appState)` — L301-L331. Dispatches each debug element by data type using a `switch (true)` ladder: `isLineSegment` → `renderLine`, `isCurve` → `renderCubicBezier`, `isDebugPolygon` → `renderPolygon`, else throws `Unknown element type`. Always uses `appState.zoom.value` as the zoom.
- `_debugRenderer(canvas, appState, elements, scale)` — L333-L384. Computes normalized dimensions via `getNormalizedCanvasDimensions(canvas, scale)`, bootstraps the 2D context via `bootstrapCanvas(...)` with `viewBackgroundColor: "transparent"`. Saves and translates by `(scrollX*zoom, scrollY*zoom)` to apply pan. Draws origin + bindings. Then either renders a single current frame (when `window.visualDebug.currentFrame` is set and data is non-empty, using `debugFrameData()[0]` as the index) or all frames. Finally prunes `window.visualDebug.data` so each frame keeps only `el.permanent` elements (transient debug elements are cleared each render). Side effects: draws on canvas, mutates `window.visualDebug.data`. Notable: the post-render filter is the mechanism that makes non-permanent debug draws last exactly one frame.
- `debugFrameData(): [number, number]` — L386-L395. Returns `[currentFrame % frameCount, currentFrame]` when `frameCount > 0`, else `[0, 0]`. The modulo wraps frame stepping around the available frame count.
- `saveDebugState(debug: { enabled: boolean })` — L397-L406 (exported). Writes `JSON.stringify(debug)` to `localStorage[STORAGE_KEYS.LOCAL_STORAGE_DEBUG]`; swallows errors to `console.error`. Side effect: localStorage write.
- `debugRenderer` — L408-L417 (exported). `throttleRAF`-wrapped `_debugRenderer`; throttles redraws to one per animation frame. Same signature `(canvas, appState, elements, scale)`. Performance-relevant: prevents per-event re-renders.
- `loadSavedDebugState(): { enabled: boolean }` — L419-L433 (exported). Reads and `JSON.parse`s the saved debug state from localStorage; returns `{ enabled: false }` on missing/error. Side effect: localStorage read.
- `isVisualDebuggerEnabled(): boolean` — L435-L436 (exported). True iff `window.visualDebug?.data` is an array.
- `DebugFooter({ onChange }: { onChange: () => void })` — L438-L536 (exported React component). Renders four `<button>`s to control debug-frame stepping. Owns four memoized `useCallback` handlers (deps `[onChange]`):
  - `moveForward` — L439-L448. Initializes `currentFrame` to 0 if missing/NaN, then increments by 1, calls `onChange()`.
  - `moveBackward` — L449-L459. Sets `currentFrame` to 1 if missing/NaN/<1, then decrements by 1, calls `onChange()`.
  - `reset` — L460-L463. Sets `currentFrame = undefined`, calls `onChange()`.
  - `trashFrames` — L464-L470. Clears `currentFrame = undefined` and `data = []`, calls `onChange()`.
  - Notable: the four buttons' wiring vs. icon/`data-testid`/`aria-label` is inconsistent — the Trash button (TrashIcon) calls `trashFrames`, the "back" arrow (`ArrowheadArrowIcon flip`) calls `moveBackward`, the Close button calls `reset`, and the forward arrow calls `moveForward`; three buttons share `data-testid="debug-forward"` and the label "Move forward". Side effects: all handlers mutate `window.visualDebug`.
- `DebugCanvasProps` interface — L538-L541. `{ appState: AppState; scale: number }`.
- `DebugCanvas` = `React.forwardRef<HTMLCanvasElement, DebugCanvasProps>(({ appState, scale }, ref) => …)` — L543-L564 (default export). Renders a `<canvas>` absolutely positioned at `zIndex: 2`, `pointerEvents: "none"`; CSS `width/height` = `appState.width/height` (logical px) while the backing-store `width/height` = `appState.{width,height} * scale` (device px). Forwards `ref` to the canvas. The CSS-vs-attribute split is the DPR/scale handling for crisp rendering.

---

### excalidraw-app/components/EncryptedIcon.tsx

Renders the shield "end-to-end encrypted" badge in the footer, linking to the Excalidraw+ encryption blog post.

- `EncryptedIcon` = `() => …` — L5-L21. Uses `useI18n()` for `t`. Renders an `<a>` (target `_blank`, `rel="noopener"`, `aria-label={t("encrypted.link")}`) to `https://plus.excalidraw.com/blog/end-to-end-encryption`, wrapping a `<Tooltip>` (label `t("encrypted.tooltip")`, `long`) containing the `shield` icon. No own state/refs/effects.
