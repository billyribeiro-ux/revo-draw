## Cluster: excalidraw__actions__4

All seven files in this cluster follow the same shape: each exports a single `Action` object produced by the `register(...)` factory (from `./register`). An `Action` is a plain config object with a `name`, UI metadata (`label`, `icon`, `keywords`), a `viewMode` flag (whether the action is available while the editor is in view-only mode), an analytics `trackEvent` descriptor, an optional `keyTest(event)` keyboard matcher, an optional `predicate(...)` availability guard, an optional `checked(appState)` toggle-state reader, and a `perform(elements, appState, formData, app)` method that returns either `false` (no-op) or a partial mutation `{ appState?, elements?, captureUpdate }`.

The `captureUpdate` field comes from `CaptureUpdateAction` (in `@excalidraw/element`) and controls undo/redo history semantics:
- `EVENTUALLY` — the change is captured into history lazily/coalesced (used for most UI/canvas toggles here),
- `NEVER` — the change is excluded from the undo stack entirely (used for ephemeral UI toggles like midpoint snapping and the shape-switch panel).

These are configuration/registration modules only — there is no algorithmic geometry, coordinate-space math, or performance-sensitive code in this cluster. The only "logic" is boolean toggling of `appState` flags and a couple of mutual-exclusion side effects (grid vs. objects-snap). No `.tsx` file here renders a React component despite the extension; the `.tsx` extension is used only because some reference JSX-capable icon imports. Each exported constant is the action object.

---

### packages/excalidraw/actions/actionToggleGridMode.tsx

Purpose: Defines the action that toggles the canvas grid (snap-to-grid) mode on/off, mutually exclusive with object snapping.

- `actionToggleGridMode` (exported const, `register({...})`) — L11-L36.
  - `perform(elements, appState)` — L21-L30. Returns a new `appState` with `gridModeEnabled` flipped to `!this.checked!(appState)` and forcibly sets `objectsSnapModeEnabled: false` (grid mode and objects-snap are mutually exclusive). Uses `captureUpdate: CaptureUpdateAction.EVENTUALLY`. Side effect: disables object snapping whenever grid is toggled.
  - `checked: (appState: AppState) => appState.gridModeEnabled` — L31. Reports current toggle state.
  - `predicate: (element, appState, props) => props.gridModeEnabled === undefined` — L32-L34. Action is only available when the host app has NOT taken control of `gridModeEnabled` via props (i.e. it's uncontrolled).
  - `keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.code === CODES.QUOTE` — L35. Keyboard shortcut Ctrl/Cmd + `'` (Quote key).
  - Metadata: `name: "gridMode"`, `icon: gridIcon`, `keywords: ["snap"]`, `label: "labels.toggleGrid"`, `viewMode: true`, trackEvent category `"canvas"` with `predicate: (appState) => appState.gridModeEnabled` (L17-L20).
  - Note: `this.checked!` uses a non-null assertion — `perform` relies on `checked` being defined on the same object.

---

### packages/excalidraw/actions/actionToggleMidpointSnapping.tsx

Purpose: Defines the action that toggles whether linear-element midpoint snapping is enabled, an ephemeral preference not recorded in history.

- `actionToggleMidpointSnapping` (exported const, `register({...})`) — L5-L23.
  - `perform(elements, appState)` — L13-L21. Flips `isMidpointSnappingEnabled` to `!this.checked!(appState)`. Uses `captureUpdate: CaptureUpdateAction.NEVER` — deliberately excluded from undo/redo (it's a UI preference, not a document change).
  - `checked: (appState) => appState.isMidpointSnappingEnabled` — L22. Reports current state.
  - Metadata: `name: "midpointSnapping"`, `label: "labels.midpointSnapping"`, `viewMode: false` (unavailable in view mode), trackEvent category `"canvas"` with `predicate: (appState) => !appState.isMidpointSnappingEnabled` (L9-L12) — tracks the transition toward enabling.
  - No `icon`, no `keyTest`, no `predicate`.

---

### packages/excalidraw/actions/actionToggleObjectsSnapMode.tsx

Purpose: Defines the action that toggles object-to-object alignment snapping, mutually exclusive with grid mode.

- `actionToggleObjectsSnapMode` (exported const, `register({...})`) — L9-L34.
  - `perform(elements, appState)` — L18-L27. Flips `objectsSnapModeEnabled` to `!this.checked!(appState)` and forcibly sets `gridModeEnabled: false` (the inverse mutual-exclusion of actionToggleGridMode). Uses `captureUpdate: CaptureUpdateAction.EVENTUALLY`.
  - `checked: (appState) => appState.objectsSnapModeEnabled` — L28.
  - `predicate: (elements, appState, appProps) => typeof appProps.objectsSnapModeEnabled === "undefined"` — L29-L31. Only available when object-snap is uncontrolled by the host app props.
  - `keyTest: (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.S` — L32-L33. Shortcut Alt + S (and NOT Ctrl/Cmd).
  - Metadata: `name: "objectsSnapMode"`, `label: "buttons.objectsSnapMode"`, `icon: magnetIcon`, `viewMode: false`, trackEvent category `"canvas"` with `predicate: (appState) => !appState.objectsSnapModeEnabled` (L14-L17).

---

### packages/excalidraw/actions/actionToggleSearchMenu.ts

Purpose: Defines the action that opens (or focuses) the canvas search sidebar tab, used for finding text/elements on the canvas.

- `actionToggleSearchMenu` (exported const, `register({...})`) — L16-L60.
  - `perform(elements, appState, _, app)` — L27-L54. Behavior:
    1. If a dialog is already open (`appState.openDialog`), returns `false` (no-op). L28-L30.
    2. If the default sidebar is already open on the `CANVAS_SEARCH_TAB`, it does NOT toggle closed; instead it locates the search input DOM node via `app.excalidrawContainerValue.container?.querySelector(.${CLASSES.SEARCH_MENU_INPUT_WRAPPER} input)`, calls `.focus()` and `.select()` on it, then returns `false`. L32-L44. Side effect: direct DOM focus/select on the live search input (the only DOM-touching action in this cluster).
    3. Otherwise returns a new `appState` that opens the default sidebar on `CANVAS_SEARCH_TAB` and closes any dialog (`openDialog: null`). Uses `captureUpdate: CaptureUpdateAction.EVENTUALLY`. L46-L53.
  - `checked: (appState: AppState) => appState.gridModeEnabled` — L55. NOTE: this appears to be a copy-paste artifact — it reports `gridModeEnabled` rather than any search-related state; likely a latent bug carried from the grid-mode action template.
  - `predicate: (element, appState, props) => props.gridModeEnabled === undefined` — L56-L58. Also a copy-paste artifact referencing `gridModeEnabled`.
  - `keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key === KEYS.F` — L59. Shortcut Ctrl/Cmd + F (browser-find override).
  - Metadata: `name: "searchMenu"`, `icon: searchIcon`, `keywords: ["search", "find"]`, `label: "search.title"`, `viewMode: true`, trackEvent category `"search_menu"`, action `"toggle"`, predicate `(appState) => appState.gridModeEnabled` (also a copy-paste artifact). L17-L26.
  - Imports `CANVAS_SEARCH_TAB`, `CLASSES`, `DEFAULT_SIDEBAR` from `@excalidraw/common`.

---

### packages/excalidraw/actions/actionToggleShapeSwitch.tsx

Purpose: Defines the action that opens the "convert element type" panel (shape switcher) for the current selection by writing into a Jotai atom.

- `actionToggleShapeSwitch` (exported const, `register({...})`) — L13-L35.
  - `perform(elements, appState, _, app)` — L23-L31. Side effect: writes `{ type: "panel" }` into `convertElementTypePopupAtom` via `editorJotaiStore.set(...)` — this opens the convert-type popup as a panel rather than mutating appState directly. Returns only `{ captureUpdate: CaptureUpdateAction.NEVER }` (ephemeral UI, no history entry, no appState/elements change). L24-L30.
  - `checked: (appState) => appState.gridModeEnabled` — L32. NOTE: copy-paste artifact (reports `gridModeEnabled`, unrelated to shape switching).
  - `predicate: (elements, appState, props) => getConversionTypeFromElements(elements as ExcalidrawElement[]) !== null` — L33-L34. Action is only available when the current elements can be converted to another shape type (i.e. `getConversionTypeFromElements` returns a non-null conversion type). This is the one meaningful predicate in the cluster.
  - Metadata: `name: "toggleShapeSwitch"`, `label: "labels.shapeSwitch"`, `icon: () => null` (renders nothing), `viewMode: true`, `keywords: ["change", "switch", "swap"]`, trackEvent category `"shape_switch"` action `"toggle"`. L14-L22.
  - Imports `getConversionTypeFromElements` and `convertElementTypePopupAtom` from `../components/ConvertElementTypePopup`, and `editorJotaiStore` from `../editor-jotai`.
  - No `keyTest`.

---

### packages/excalidraw/actions/actionToggleStats.tsx

Purpose: Defines the action that toggles the floating Stats (element/dimension attributes) panel.

- `actionToggleStats` (exported const, `register({...})`) — L9-L28.
  - `perform(elements, appState)` — L16-L23. Returns a new `appState` whose nested `stats` object has `open` flipped: `stats: { ...appState.stats, open: !this.checked!(appState) }` (spread preserves other `stats` fields, e.g. panel position). Uses `captureUpdate: CaptureUpdateAction.EVENTUALLY`.
  - `checked: (appState) => appState.stats.open` — L25.
  - `keyTest: (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.SLASH` — L26-L27. Shortcut Alt + `/` (and NOT Ctrl/Cmd).
  - Metadata: `name: "stats"`, `label: "stats.fullTitle"`, `icon: abacusIcon`, `viewMode: true`, trackEvent category `"menu"`, `keywords: ["edit", "attributes", "customize"]`. L10-L15.
  - No `predicate`. Invariant: relies on `appState.stats` always being a defined object so the spread doesn't throw.

---

### packages/excalidraw/actions/actionToggleViewMode.tsx

Purpose: Defines the action that toggles the editor between editable and view-only (read-only) mode.

- `actionToggleViewMode` (exported const, `register({...})`) — L9-L33.
  - `perform(elements, appState)` — L18-L25. Flips `viewModeEnabled` to `!this.checked!(appState)`. Uses `captureUpdate: CaptureUpdateAction.EVENTUALLY`.
  - `checked: (appState) => appState.viewModeEnabled` — L27.
  - `predicate: (elements, appState, appProps) => typeof appProps.viewModeEnabled === "undefined"` — L28-L30. Only available when view mode is uncontrolled by host app props.
  - `keyTest: (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.R` — L31-L32. Shortcut Alt + R (and NOT Ctrl/Cmd).
  - Metadata: `name: "viewMode"`, `label: "labels.viewMode"`, `icon: eyeIcon`, `viewMode: true` (the toggle itself must remain available while in view mode so the user can exit), trackEvent category `"canvas"` with `predicate: (appState) => !appState.viewModeEnabled` (L14-L17).

---

### Cross-file parity notes (for a Svelte/Canvas reimplementation)

- Three toggles enforce mutual exclusion via their `perform` side effects: grid mode sets `objectsSnapModeEnabled: false` and objects-snap sets `gridModeEnabled: false`. A reimplementation must preserve this "you can have grid OR object snapping, never both" invariant.
- `captureUpdate` semantics differ deliberately: ephemeral UI toggles (`midpointSnapping`, `toggleShapeSwitch`) use `NEVER` (no undo entry), while canvas/document-affecting toggles use `EVENTUALLY`.
- The `predicate` "controlled prop" pattern (`props.X === undefined` / `typeof props.X === "undefined"`) is how Excalidraw lets a host app take ownership of a feature flag and thereby hide the corresponding action from menus/shortcuts.
- Keyboard shortcuts in this cluster: grid = Ctrl/Cmd+`'`; objects-snap = Alt+S; stats = Alt+`/`; view mode = Alt+R; search = Ctrl/Cmd+F. Midpoint snapping and shape-switch have no shortcut.
- `actionToggleSearchMenu` and `actionToggleShapeSwitch` carry copy-paste `checked`/`predicate`/`trackEvent.predicate` bodies that erroneously reference `gridModeEnabled`; these are inert for the action's real behavior but worth not replicating literally.
