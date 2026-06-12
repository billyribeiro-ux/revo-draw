## Cluster: excalidraw__actions__5

This cluster covers the action-system infrastructure (the `Action` type, the global `register`/`actions` array, the `ActionManager` dispatcher, keyboard-shortcut mapping, the public re-export barrel) plus two concrete action modules (zen-mode toggle and z-index ordering). Together they define how every user-facing operation in Excalidraw is declared, keyboard-tested, tracked, rendered, and executed.

---

### packages/excalidraw/actions/types.ts

Purpose: types-only module that defines the entire `Action` contract — the discriminated result, the perform function signature, the master `ActionName` union, panel-component props, and the `Action` interface itself.

This file is **types-only** (no runtime functions). Documented declarations:

- `ActionSource` (type, L17-L22) — string union of who triggered an action: `"ui" | "keyboard" | "contextMenu" | "api" | "commandPalette"`.
- `ActionResult` (type, L25-L33) — the return shape of every `perform`. Either `false` (action prevented/no-op) or an object with optional `elements` (next element array or null), optional `appState` (`Partial<AppState>` or null), optional `files` (`BinaryFiles` or null), a **required** `captureUpdate: CaptureUpdateActionType` (controls undo-history capture: IMMEDIATELY / EVENTUALLY / NEVER), and optional `replaceFiles` boolean. Invariant: `captureUpdate` is mandatory on every successful action result — this is the central undo/history contract.
- `ActionFn<TData = any>` (type, L35-L40) — signature of `perform`: `(elements: readonly OrderedExcalidrawElement[], appState: Readonly<AppState>, formData: TData | undefined, app: AppClassProperties) => ActionResult | Promise<ActionResult>`. Note perform may be async (Promise-returning) — the manager unwraps it.
- `UpdaterFn` (type, L42) — `(res: ActionResult) => void`.
- `ActionFilterFn` (type, L43) — `(action: Action) => void`.
- `ActionName` (type, L45-L148) — the closed string union of every legal action name in the app (~100 names: clipboard ops, z-index ops, style changes, zoom, group/ungroup, align/distribute, flip, toggles, frame ops, text ops, link/crop/lasso/shape-switch, etc.). This is the registry key space; `ActionManager.actions` is keyed by it.
- `PanelComponentProps` (type, L150-L161) — props passed to an action's optional `PanelComponent`: `elements`, `appState`, `updateData<T>(formData?: T)`, `appProps: ExcalidrawProps`, optional `data`, `app`, and a recursive `renderAction` callback returning `JSX.Element | null`.
- `Action<TData = any>` (interface, L163-L219) — the full action descriptor:
  - `name: ActionName` (registry key).
  - `label` — string or a function `(elements, appState, app) => string` (dynamic labels).
  - `keywords?: string[]` (command-palette search terms).
  - `icon?` — `React.ReactNode` or a function `(appState: UIAppState, elements) => React.ReactNode`.
  - `PanelComponent?: React.FC<PanelComponentProps>`.
  - `perform: ActionFn<TData>` (the mutation).
  - `keyPriority?: number` (tie-break weight in keyboard dispatch; higher wins).
  - `keyTest?` — `(event, appState, elements, app) => boolean` deciding whether a keydown matches.
  - `predicate?` — `(elements, appState, appProps, app) => boolean` gating availability/enablement.
  - `checked?` — `(appState) => boolean` for toggle/checkbox state.
  - `trackEvent` — **required** field, either `false` or an analytics descriptor with a bounded `category` union (`"toolbar" | "element" | "canvas" | "export" | "history" | "menu" | "collab" | "hyperlink" | "search_menu" | "shape_switch"`), optional `action` string override, and optional `predicate(appState, elements, value) => boolean`.
  - `viewMode?: boolean` — if `true`, action is allowed while the canvas is in view mode; defaults false. Invariant: keyboard dispatch (manager L116) blocks any action without `viewMode === true` while `viewModeEnabled`.

---

### packages/excalidraw/actions/register.ts

Purpose: holds the mutable module-level array of all registered actions and exposes the `register()` helper that every action module calls at import time.

- `actions` (exported `let`, L3) — `readonly Action[]`, initialized empty. **Side effect / invariant:** this is module-global mutable state; it is populated as a side effect of importing each `actionX` module (each calls `register`). Order of population is import order. Consumers (e.g. App) import this array to `registerAll` into an `ActionManager`.
- `register<TData, T extends Action<TData>>(action: T): T & {...}` (L5-L15) — appends `action` to the `actions` array via `actions = actions.concat(action)` (creates a new array each call — O(n) per registration, fine for a one-time startup population) and returns the same action with a refined type. The conditional return type `keyTest?: unknown extends T["keyTest"] ? never : T["keyTest"]` narrows `keyTest` so callers preserve the literal `keyTest` presence in the returned type. Returns the action unchanged at runtime.

---

### packages/excalidraw/actions/manager.tsx

Purpose: the `ActionManager` class — central dispatcher that registers actions, matches keyboard events to a single action, executes actions (sync or async), renders panel components, gates availability via predicates, and fires analytics.

- `trackAction(action, source, appState, elements, app, value)` (module-internal fn, L22-L50) — fires analytics for an action if `action.trackEvent` is a truthy object. Evaluates the optional `trackEvent.predicate(appState, elements, value)` (defaults true); if it passes, calls `trackEvent(category, action.trackEvent.action || action.name, "${source} (mobile|desktop)")`. Form factor is read from `app.editorInterface.formFactor === "phone"` to label mobile vs desktop. Wrapped in try/catch — logging failures never break the action (logs `console.error`). Side effect: analytics emission only.
- `class ActionManager` (L52-L201):
  - Fields: `actions: Record<ActionName, Action>` (L53, the keyed registry), `updater` (L55), `getAppState` (L57), `getElementsIncludingDeleted` (L58), `app: AppClassProperties` (L59).
  - `constructor(updater: UpdaterFn, getAppState, getElementsIncludingDeleted, app)` (L61-L79) — stores accessors and wraps `updater`: the wrapped updater detects a Promise-like result via `isPromiseLike` and, if so, `.then()`s before calling the real updater; otherwise calls it directly. **Invariant:** async actions (perform returning a Promise) are transparently supported; the wrapped updater is the single place that awaits.
  - `registerAction(action: Action)` (L81-L83) — stores `this.actions[action.name] = action` (last registration of a name wins).
  - `registerAll(actions: readonly Action[])` (L85-L87) — registers each action in turn.
  - `handleKeyDown(event)` (L89-L130) — the keyboard dispatch core:
    1. Reads `canvasActions` from `app.props.UIOptions.canvasActions`.
    2. Sorts all actions descending by `keyPriority || 0` (L92) so higher-priority shortcuts are considered first.
    3. Filters to actions that are (a) enabled in `canvasActions` (or not present there → default enabled) and (b) have a `keyTest` that returns true for `(event, appState, elements, app)` (L93-L105).
    4. If exactly one action does **not** match, returns false; if more than one matches, logs a warning ("Canceling as multiple actions match this shortcut") and returns false — i.e. ambiguous shortcuts are intentionally cancelled, not arbitrarily resolved (L107-L112). **Invariant:** a keyboard shortcut must uniquely resolve to fire.
    5. View-mode gate: if `viewModeEnabled` and the matched action's `viewMode !== true`, bail (L116-L118).
    6. Calls `trackAction(..., "keyboard", ...)`, then `event.preventDefault()` + `event.stopPropagation()`, then `this.updater(action.perform(elements, appState, null, app))`. Returns true (L124-L129). Note `value` is always `null` for keyboard.
  - `executeAction<T extends Action>(action, source = "api", value = null)` (L132-L143) — imperative execution path (used by API/context-menu/command-palette). Pulls current elements + appState, tracks, then `this.updater(action.perform(elements, appState, value, app))`. Type of `value` is `Parameters<T["perform"]>[2]` (the action's own formData type).
  - `renderAction = (name, data?) => JSX | null` (arrow field, L148-L190) — renders an action's `PanelComponent` if the action exists, declares a `PanelComponent`, and is enabled in `canvasActions`. Sets `PanelComponent.displayName = "PanelComponent"`, builds an `updateData(formState?)` closure that tracks (source `"ui"`) and re-reads fresh elements/appState at call time before performing, then returns the `<PanelComponent>` with all `PanelComponentProps` wired (including recursive `renderAction`). Returns null when the action is absent/has no panel/disabled. **Detail:** `updateData` reads `getElementsIncludingDeleted()`/`getAppState()` again at invocation (not the closed-over snapshot used for tracking) so the perform sees current state.
  - `isActionEnabled = (action) => boolean` (arrow field, L192-L200) — true when the action has no `predicate`, or its `predicate(elements, appState, app.props, app)` returns true. Used to gate UI affordances.

---

### packages/excalidraw/actions/shortcuts.ts

Purpose: builds the human-readable keyboard-shortcut label map keyed by `ShortcutName`, platform-aware (Darwin vs other), and exposes a lookup helper.

- `ShortcutName` (type, L10-L59) — a `SubtypeOf<ActionName, ...>` of the action names that have displayable shortcuts, **plus** five names not in `ActionName` (`"saveScene" | "imageExport" | "commandPalette" | "searchMenu" | "toolLock"`). Constrains the keys of `shortcutMap`.
- `shortcutMap: Record<ShortcutName, string[]>` (const, L61-L122) — maps each shortcut name to an array of pretty key strings produced by `getShortcutKey(...)`. Multiple-binding entries: `commandPalette` (`CtrlOrCmd+/` and `CtrlOrCmd+Shift+P`), `duplicateSelection` (`CtrlOrCmd+D` and `Alt+<drag>`). Platform branching via `isDarwin`: `sendToBack`/`bringToFront` use `CtrlOrCmd+Alt+[ / ]` on macOS vs `CtrlOrCmd+Shift+[ / ]` elsewhere (L84-L93). Empty arrays for `addToLibrary` and `wrapSelectionInFrame` (no display shortcut). Uses `t("helpDialog.drag")` for the localized "drag" word in the duplicate shortcut.
- `getShortcutFromShortcutName(name: ShortcutName, idx = 0): string` (L124-L130) — returns `shortcuts[idx]` if present, else `shortcuts[0]`, else `""` when the name maps to an empty array. Defensive fallback: requesting an out-of-range index falls back to the primary binding.

---

### packages/excalidraw/actions/index.ts

Purpose: pure re-export barrel — the public surface of the actions package. **No logic, no functions.**

Re-exports (named) the following action constants from sibling modules: `actionDeleteSelected`; from `actionZindex` → `actionBringForward, actionBringToFront, actionSendBackward, actionSendToBack`; `actionSelectAll`; `actionDuplicateSelection`; from `actionProperties` → the 11 `actionChange*` style actions (stroke color/bg color/stroke width/fill style/sloppiness/opacity/font size/font family/text align/vertical align/arrow properties); from `actionCanvas` → `actionChangeViewBackgroundColor, actionClearCanvas, actionZoomIn, actionZoomOut, actionResetZoom, actionZoomToFit, actionToggleTheme`; `actionSetEmbeddableAsActiveTool`; `actionFinalize`; `actionDeselect`; from `actionExport` → `actionChangeProjectName, actionChangeExportBackground, actionSaveToActiveFile, actionSaveFileToDisk, actionLoadScene`; `actionCopyStyles, actionPasteStyles`; `actionShortcuts`; `actionGroup, actionUngroup`; `actionGoToCollaborator`; `actionAddToLibrary`; the 6 `actionAlign*` actions; `distributeHorizontally, distributeVertically`; `actionFlipHorizontal, actionFlipVertical`; `actionCopy, actionCut, actionCopyAsPng, actionCopyAsSvg, copyText`; the toggle actions (`actionToggleGridMode, actionToggleZenMode, actionToggleObjectsSnapMode, actionToggleArrowBinding, actionToggleMidpointSnapping, actionToggleStats`); `actionUnbindText, actionBindText`; `actionLink`; `actionToggleElementLock`; `actionToggleLinearEditor`; `actionToggleSearchMenu`; `actionToggleCropEditor` (L1-L95).

---

### packages/excalidraw/actions/actionToggleZenMode.tsx

Purpose: defines the single `actionToggleZenMode` action that toggles distraction-free zen mode.

- `actionToggleZenMode` (registered const, L9-L36) — created via `register({...})`:
  - `name: "zenMode"`, `label: "buttons.zenMode"`, `icon: coffeeIcon`, `viewMode: true` (allowed in view mode).
  - `trackEvent`: category `"canvas"`, with `predicate: (appState) => !appState.zenModeEnabled` so an enable (not a disable) is what gets tracked.
  - `perform(elements, appState)` (L18-L26) — returns `{ appState: { ...appState, zenModeEnabled: !this.checked!(appState) }, captureUpdate: CaptureUpdateAction.EVENTUALLY }`. Toggle is computed via `this.checked!(appState)` (relies on `checked` being defined; the `!` non-null assertion). `EVENTUALLY` means this UI-state toggle is not an immediate undo step.
  - `checked: (appState) => appState.zenModeEnabled` (L27).
  - `predicate` (L28-L33) — only available when `app.editorInterface.formFactor !== "phone"` AND `appProps.zenModeEnabled` is `undefined` (i.e. zen mode is not externally controlled by the host app).
  - `keyTest` (L34-L35) — `!event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.Z` → bare `Alt+Z`.

---

### packages/excalidraw/actions/actionZindex.tsx

Purpose: defines the four z-index ordering actions (send backward / bring forward / send to back / bring to front), each with a perform delegating to element-package move helpers, a keyboard test, and a small `PanelComponent` button.

All four call element-package helpers `moveOneLeft / moveOneRight / moveAllLeft / moveAllRight` and use `captureUpdate: CaptureUpdateAction.IMMEDIATELY` (each reorder is its own undo step). All have `trackEvent.category: "element"`.

- `actionSendBackward` (L23-L51) — `name: "sendBackward"`, keywords `["move down","zindex","layer"]`, icon `SendBackwardIcon`. `perform(elements, appState, value, app)` returns `{ elements: moveOneLeft(elements, appState, app.scene), appState, captureUpdate: IMMEDIATELY }` (L29-L35). `keyPriority: 40`. `keyTest`: `CTRL_OR_CMD && !shiftKey && code === BRACKET_LEFT` (`Cmd/Ctrl+[`). `PanelComponent`: a `<button class="zIndexButton">` calling `updateData(null)`, titled with `t("labels.sendBackward")` + `getShortcutKey("CtrlOrCmd+[")` (L41-L50). Passing `null` to `updateData` means perform ignores `value` and acts on current selection.
- `actionBringForward` (L53-L81) — `name: "bringForward"`, keywords `["move up","zindex","layer"]`, icon `BringForwardIcon`. Perform delegates to `moveOneRight(elements, appState, app.scene)`. `keyPriority: 40`. `keyTest`: `CTRL_OR_CMD && !shiftKey && code === BRACKET_RIGHT` (`Cmd/Ctrl+]`). Panel button titled with `CtrlOrCmd+]`.
- `actionSendToBack` (L83-L118) — `name: "sendToBack"`, icon `SendToBackIcon`. `perform(elements, appState)` → `moveAllLeft(elements, appState)` (note: no `app.scene` arg — moves all the way to the bottom of stacking). No `keyPriority`. `keyTest` is **platform-branched** (L96-L103): on Darwin `CTRL_OR_CMD && altKey && code === BRACKET_LEFT` (`Cmd+Alt+[`); else `CTRL_OR_CMD && shiftKey && code === BRACKET_LEFT` (`Ctrl+Shift+[`). Panel button title also branches on `isDarwin` for the displayed shortcut.
- `actionBringToFront` (L120-L156) — `name: "bringToFront"`, icon `BringToFrontIcon`. `perform(elements, appState)` → `moveAllRight(elements, appState)`. `keyTest` platform-branched (L134-L141): Darwin `Cmd+Alt+]`; else `Ctrl+Shift+]`. Panel button (`onClick={(event) => updateData(null)}`) title branches on `isDarwin`.

Parity note: the single-step moves (`moveOneLeft`/`moveOneRight`) receive `app.scene` as a third argument while the move-all variants do not — the single-step reorder needs scene context (e.g. frame/group membership) to compute the adjacent neighbor, whereas move-to-extreme does not. The `keyPriority: 40` on the single-step actions ensures `[`/`]` resolve to the move actions over any other lower-priority `[`/`]` binding in the unique-match dispatch.
