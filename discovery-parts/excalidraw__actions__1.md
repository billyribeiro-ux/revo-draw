## Cluster: excalidraw__actions__1

This cluster covers seven action modules in `packages/excalidraw/actions/`. Each module exports one or more `Action` objects produced by the `register(...)` factory. An Action's shape (per the broader codebase) is `{ name, label, icon?, trackEvent, perform(elements, appState, formData, app) => ActionResult | false, keyTest?, predicate?, PanelComponent? }`. `perform` returns a partial `{ elements?, appState?, files?, captureUpdate }` patch that the action manager applies; returning `false` is a no-op. `captureUpdate` (`CaptureUpdateAction.IMMEDIATELY` / `.EVENTUALLY` / `.NEVER`) controls whether the change is committed as an undoable history entry. The `app` argument exposes `app.scene` (selection/element queries), `app.props`, `app.state`, `app.canvas`, etc.

---

### packages/excalidraw/actions/actionDeselect.ts

Purpose: Implements the Escape-key "deselect" action that clears selection or steps out one level of an editing group.

- `getNextActiveTool(appState, app)` — `(appState: Readonly<AppState>, app: AppClassProperties) => <updated activeTool>` (L16-L32). Computes the tool to switch to on deselect. If the current tool is `"eraser"`, it restores `activeTool.lastActiveTool` (or falls back to `app.state.preferredSelectionTool.type`) and nulls `lastActiveToolBeforeEraser`; otherwise it returns `updateActiveTool(appState, { type: preferredSelectionTool.type })`. Pure (delegates to `updateActiveTool`); no side effects.
- `getParentEditingGroupId(appState, app, selectedElementIds)` — `=> GroupId | null` (L34-L60). When inside an editing group, finds the next-outer group to step into. Returns `null` if not editing a group. Builds candidate elements from the current selection (or, if empty, all elements in `editingGroupId`), then for each element looks up the index of `editingGroupId` in its `groupIds` array and returns the group id at `index + 1` (the parent in the nesting order). Invariant: `groupIds` is ordered innermost→outermost, so `index+1` is the enclosing group. Returns `null` if no outer group exists.
- `actionDeselect` (exported const) — `register({ name: "deselect", label: "", trackEvent: false, perform, keyTest })` (L62-L147).
  - `perform(_elements, appState, _, app)` (L66-L126): Two branches. If `appState.editingGroupId` is set, it keeps a reduced selection (current selection, or all elements in the editing group mapped to `{id: true}`), recomputes group selection via `selectGroupsForSelectedElements(...)` with the parent editing group from `getParentEditingGroupId`, and clears `activeEmbeddable`, `selectedLinearElement`, `selectionElement`, `showHyperlinkPopup`, `suggestedBinding`, `frameToHighlight`. Otherwise (no editing group) it fully clears selection: `selectedElementIds` via `makeNextSelectedElementIds({}, appState)`, empties `selectedGroupIds`, nulls `editingGroupId` and the same set of overlay/binding fields. Both branches set `activeTool` from `getNextActiveTool` and use `captureUpdate: IMMEDIATELY`.
  - `keyTest(event, appState, _, app)` (L127-L146): Returns `true` only for `KEYS.ESCAPE`, never when the event target is a writable element (`isWritableElement`), and only when there's something to deselect — guarded by `!appState.newElement`, `appState.multiElement === null`, not currently editing a linear element, and at least one of: active embeddable, non-default active tool, an editing group, a selected linear element, or some element selected.

---

### packages/excalidraw/actions/actionDistribute.tsx

Purpose: Provides the "distribute horizontally / vertically" actions that evenly space ≥3 selected elements along an axis, plus their toolbar buttons.

- `enableActionGroup(appState, app)` — `(appState: AppState, app: AppClassProperties) => boolean` (L35-L46). Determines whether the distribute buttons should be active: requires more than 2 selected groups (via `getSelectedElementsByGroup(...)`) AND that no selected element is frame-like (`isFrameLikeElement`) — frames are explicitly excluded (TODO comment notes distributing frames is unimplemented). Note the threshold is `> 2` groups (i.e. at least 3 distributable units).
- `distributeSelectedElements(elements, appState, app, distribution)` — `(readonly ExcalidrawElement[], Readonly<AppState>, AppClassProperties, Distribution) => ExcalidrawElement[]` (L48-L71). Gets selected elements, calls `distributeElements(selectedElements, nonDeletedElementsMap, distribution, appState, app.scene)` to compute new positions, builds a map of the updated elements, then maps over the full `elements` array substituting updated ones, and finally runs `updateFrameMembershipOfSelectedElements(...)` so moved elements get correct frame parenting. Returns the full updated element array. The actual geometry/spacing math lives in `@excalidraw/element`'s `distributeElements` (not in this file).
- `distributeHorizontally` (exported const) — `register({ name: "distributeHorizontally", label: "labels.distributeHorizontally", trackEvent: { category: "element" }, perform, keyTest, PanelComponent })` (L73-L102).
  - `perform(elements, appState, _, app)` (L77-L86): Returns unchanged `appState`, distributed `elements` with `{ space: "between", axis: "x" }`, `captureUpdate: IMMEDIATELY`.
  - `keyTest(event)` (L87-L88): `!CTRL_OR_CMD && altKey && code === CODES.H` (Alt+H).
  - `PanelComponent` (L89-L101): `ToolButton` (type "button") with `DistributeHorizontallyIcon`, hidden unless `enableActionGroup`, visible when some element selected; `onClick` calls `updateData(null)`; title includes the `Alt+H` shortcut via `getShortcutKey`.
- `distributeVertically` (exported const) — same shape (L104-L131). `perform` uses `{ space: "between", axis: "y" }`; `keyTest` is `!CTRL_OR_CMD && altKey && code === CODES.V` (Alt+V); `PanelComponent` uses `DistributeVerticallyIcon` and the `Alt+V` shortcut label.

---

### packages/excalidraw/actions/actionDuplicateSelection.tsx

Purpose: Implements Ctrl/Cmd+D duplicate of the current selection (or selected linear-editor points), offsetting copies by half a grid cell, plus its toolbar button.

- `actionDuplicateSelection` (exported const) — `register({ name: "duplicateSelection", label, icon: DuplicateIcon, trackEvent: { category: "element" }, perform, keyTest, PanelComponent })` (L34-L135).
  - `perform(elements, appState, formData, app)` (L39-L110): 
    - Early `false` if `appState.selectedElementsAreBeingDragged` (don't duplicate mid-drag).
    - If `appState.selectedLinearElement?.isEditing`, duplicates the selected points via `LinearElementEditor.duplicateSelectedPoints(appState, app.scene)` inside a try/catch (returns `false` on throw); returns the new `appState`, unchanged `elements`, `IMMEDIATELY`.
    - Otherwise calls `duplicateElements({ type: "in-place", elements, idsOfElementsToDuplicate: arrayToMap(getSelectedElements(... includeBoundTextElement:true, includeElementsInFrames:true)), appState, randomizeSeed: true, overrides })`. The `overrides` callback (L74-L82) offsets each duplicate by `+DEFAULT_GRID_SIZE/2` in both x and y, and remaps `frameId` to the duplicated frame's id when the original's frame was also duplicated (`origIdToDuplicateId.get(origElement.frameId)`), preserving relative frame membership.
    - If `app.props.onDuplicate` is set, it lets the host app remap `elementsWithDuplicates` (host can return a replacement array).
    - Returns `elements: syncMovedIndices(elementsWithDuplicates, arrayToMap(duplicatedElements))` (fixes fractional z-indices for the inserted copies) and an `appState` merged with `getSelectionStateForElements(duplicatedElements, ...)` so the new copies become the selection; `IMMEDIATELY`.
  - `keyTest(event)` (L111): `CTRL_OR_CMD && key === KEYS.D`.
  - `PanelComponent({ elements, appState, updateData, app })` (L112-L134): Reads `useStylesPanelMode()` hook to detect `"mobile"`. Renders a `ToolButton` with `DuplicateIcon`, the `CtrlOrCmd+D` shortcut in the title, disabled when nothing is selected, and applies `MOBILE_ACTION_BUTTON_BG` style on mobile (unless the compact-other-properties popup is open). `onClick` → `updateData(null)`.

---

### packages/excalidraw/actions/actionElementLink.ts

Purpose: Two actions for element deep-links — copy a link to the selected element(s), and open the dialog to link to a target element.

- `actionCopyElementLink` (exported const) — `register({ name: "copyElementLink", label, icon: copyIcon, trackEvent: { category: "element" }, perform (async), predicate })` (L16-L71).
  - `perform(elements, appState, _, app)` (L21-L68): Gets selected elements; if `window.location` exists, derives `getLinkIdAndTypeFromSelection(selectedElements, appState)`. When an id/type is found, copies a URL to the system clipboard via `copyTextToSystemClipboard(...)` — using `app.props.generateLinkForSelection(id, type)` if provided, else `defaultGetElementLinkFromSelection(id, type)` — and returns a toast (`toast.elementLinkCopied`, closable) with `captureUpdate: EVENTUALLY`. If no id/type, returns an unchanged passthrough (`EVENTUALLY`). Errors are caught and `console.error`'d; falls through to a final unchanged passthrough. Side effect: writes to clipboard.
  - `predicate(elements, appState)` (L69-L70): `canCreateLinkFromElements(getSelectedElements(...))`.
- `actionLinkToElement` (exported const) — `register({ name: "linkToElement", label, icon: elementLinkIcon, perform, predicate, trackEvent: false })` (L73-L113).
  - `perform(elements, appState, _, app)` (L77-L102): If exactly one element is selected and link-creatable, opens `openDialog: { name: "elementLinkSelector", sourceElementId: <that element's id> }` (`IMMEDIATELY`). Otherwise returns an unchanged passthrough (`EVENTUALLY`).
  - `predicate(elements, appState, appProps, app)` (L103-L111): True only when the elementLinkSelector dialog isn't already open, exactly one element is selected, and it's link-creatable.

---

### packages/excalidraw/actions/actionElementLock.ts

Purpose: Lock/unlock the selection (with multi-select grouping semantics) and an "unlock all" action; non-trivial group-id bookkeeping for locked multi-selections.

- `shouldLock(elements)` — `(readonly ExcalidrawElement[]) => boolean` (L21-L22). Returns `true` (i.e. the toggle should LOCK) when every element is currently unlocked; otherwise the toggle unlocks. Drives the lock/unlock direction of the toggle.
- `actionToggleElementLock` (exported const) — `register({ name: "toggleElementLock", label (fn), icon (fn), trackEvent: { category: "element" }, predicate, perform, keyTest })` (L24-L154).
  - `label(elements, appState, app)` (L26-L35): Dynamically returns `labels.elementLock.lock` or `.unlock` based on `shouldLock` of the selection (excluding bound text).
  - `icon(appState, elements)` (L36-L39): Returns `LockedIcon` or `UnlockedIcon` similarly.
  - `predicate(elements, appState, _, app)` (L41-L47): Enabled when ≥1 element selected and no selected element is both `locked` and inside a frame (`element.locked && element.frameId`).
  - `perform(elements, appState, _, app)` (L48-L142): Core logic. Gets selected elements (incl. bound text and elements-in-frames); `false` if none. Computes `nextLockState = shouldLock(...)`. Determines `isAGroup` (>1 element AND all share a group via `elementsAreInSameGroup`) and `isASingleUnit` (single element or a group). `newGroupId = isASingleUnit ? null : randomId()` — i.e. a *temporary* group id is minted only when locking a loose multi-selection that isn't already a single group. Maintains `appState.lockedMultiSelections` (a map of these temporary group ids): on lock, adds `newGroupId`; on unlock of an existing group, deletes its last group id. Builds `nextElements` mapping over all elements: for selected ones, sets `locked: nextLockState` and adjusts `groupIds` — when locking with a `newGroupId` it appends that id; when unlocking it filters out any group ids that exist in `lockedMultiSelections` (removing the temporary group). Performance/invariant detail: it reuses the original `groupIds` array reference when length is unchanged ("do not recreate the array unnecessarily"). Computes `nextSelectedElementIds` (empty when locking — locked elements deselect; all selected when unlocking) and `nextSelectedGroupIds` (empty when locking, else `selectGroupsFromGivenElements`). Computes `activeLockedId` (the new/last group id or single element id when locking, else `null`). Returns `{ elements, appState: { selectedElementIds, selectedGroupIds, selectedLinearElement (nulled when locking), lockedMultiSelections, activeLockedId }, IMMEDIATELY }`.
  - `keyTest(event, appState, elements, app)` (L143-L153): `key.toLowerCase() === KEYS.L && CTRL_OR_CMD && shiftKey` with ≥1 element selected (Ctrl/Cmd+Shift+L).
- `actionUnlockAllElements` (exported const) — `register({ name: "unlockAllElements", trackEvent: { category: "canvas" }, viewMode: false, icon: UnlockedIcon, predicate, perform, label })` (L156-L214).
  - `predicate(elements, appState)` (L161-L167): Only when nothing is selected AND at least one element is locked.
  - `perform(elements, appState)` (L168-L213): Filters locked elements; maps over all elements unlocking each locked one and stripping any temporary group ids found in `lockedMultiSelections` (same "don't recreate array unnecessarily" guard). Selects all previously-locked elements (`selectedElementIds`), recomputes `selectedGroupIds` via `selectGroupsFromGivenElements`, clears `lockedMultiSelections` to `{}`, nulls `activeLockedId`. `IMMEDIATELY`.

---

### packages/excalidraw/actions/actionEmbeddable.ts

Purpose: Single action that activates the "embeddable" creation tool and updates the canvas cursor.

- `actionSetEmbeddableAsActiveTool` (exported const) — `register({ name: "setEmbeddableAsActiveTool", trackEvent: { category: "toolbar" }, target: "Tool", label: "toolBar.embeddable", perform })` (L9-L35).
  - `perform(elements, appState, _, app)` (L14-L34): Computes `nextActiveTool = updateActiveTool(appState, { type: "embeddable" })`, then calls `setCursorForShape(app.canvas, { ...appState, activeTool: nextActiveTool })` as a side effect to set the canvas cursor. Returns `elements` unchanged and `appState` with `activeTool` set to `updateActiveTool(appState, { type: "embeddable" })` (recomputed inline), `captureUpdate: EVENTUALLY`. Note: `updateActiveTool` is called twice (once for cursor, once for the returned state) rather than reusing `nextActiveTool` in the result.

---

### packages/excalidraw/actions/actionExport.tsx

Purpose: All export/save-related actions — project name, image export scale/background/embed-scene/dark-mode toggles, save-to-active-file, save-to-disk, and load-scene — plus the `props.onExport` interception/progress plumbing.

- `actionChangeProjectName` (exported const) — `register<AppState["name"]>({ name: "changeProjectName", label, trackEvent: false, perform, PanelComponent })` (L46-L64). `perform(_elements, appState, value)` sets `appState.name = value` (`EVENTUALLY`). `PanelComponent` renders `<ProjectName>` bound to `app.getName()`, calling `updateData(name)` on change, honoring `data.ignoreFocus`.
- `actionChangeExportScale` (exported const) — `register<AppState["exportScale"]>({ ... })` (L66-L114). `perform` sets `appState.exportScale = value` (`EVENTUALLY`). `PanelComponent` (L76-L113): computes the exported element set (selection if any, else all non-deleted), then for each scale `s` in `EXPORT_SCALES` calls `getExportSize(exportedElements, DEFAULT_EXPORT_PADDING, s)` to compute `[width,height]` and renders a radio `ToolButton` showing `${s}x (WxH)`; checked when `s === appState.exportScale`. Geometry detail: actual export-size math is in `scene/export.getExportSize`.
- `actionChangeExportBackground` (exported const) — `register<AppState["exportBackground"]>` (L116-L136). `perform` toggles `appState.exportBackground` (`EVENTUALLY`); `PanelComponent` is a `CheckboxItem`.
- `actionChangeExportEmbedScene` (exported const) — `register<AppState["exportEmbedScene"]>` (L138-L161). `perform` toggles `appState.exportEmbedScene` (`EVENTUALLY`); `PanelComponent` is a `CheckboxItem` with an explanatory `Tooltip`.
- `onExportInProgress` — module-level mutable `let` flag (L167). Guards against concurrent save operations (re-entrancy lock for `actionSaveToActiveFile` / `actionSaveFileToDisk`).
- `onProgressToast(app, progress)` — `(AppClassProperties, { message?, progress?: number|null }) => void` (L169-L191). Side effect: sets `app` toast state, rendering a `Toast.ProgressBar` when `progress.progress != null`, else a plain message; `duration: Infinity` (sticky until replaced).
- `handleOnExportResult(onExportResult, opts)` — `async (ReturnType<...onExport>, { signal: AbortSignal, app }) => Promise<void>` (L193-L234). Awaits the host app's `onExport` result and surfaces progress. If the app is loading, shows an indeterminate toast and awaits `app.onStateChange({ predicate: state => !state.isLoading })`. If the result is an async iterator, iterates it, aborting (`onExportResult.return()`) when `signal.aborted`, updating the progress toast on `"progress"` values and returning on `"done"`. If it's a `Promise`, shows an indeterminate toast and awaits it. Side effects: toast UI, possible generator teardown.
- `prepareDataForJSONExport(elements, appState, files, app)` — `(readonly ExcalidrawElement[], AppState, BinaryFiles, AppClassProperties) => { abortController: AbortController; data: Promise<JSONExportData> }` (L236-L294). Creates an `AbortController`, then a promise that (if `app.props.onExport` exists) runs `handleOnExportResult` against `onExport("json", { elements, appState, files }, { signal })`, swallowing/logging errors (distinguishing `AbortError`). Resolves to `{ elements, appState, files: app.files }` — note it intentionally re-reads `app.files` so files that finished loading during `onExport` are included. Invariant: host apps cannot cancel the save; on error it resolves to the original data.
- `actionSaveToActiveFile` (exported const) — `register({ name: "saveToActiveFile", label, icon: ExportIcon, trackEvent, predicate, perform (async), keyTest })` (L300-L373). `predicate`: enabled only when `UIOptions.canvasActions.saveToActiveFile`, a `fileHandle` exists, and not view-mode. `perform`: re-entrancy-guarded by `onExportInProgress`; builds export data, then either `resaveAsImageWithScene(...)` if the previous handle is an image handle (`isImageFileHandle`) or `saveAsJSON(...)`. On success returns the new `fileHandle` + a localized "saved" toast and `captureUpdate: NEVER`. On error aborts the controller, logs (warn for AbortError), and clears the toast (`NEVER`); always resets the in-progress flag in `finally`. `keyTest`: `S && CTRL_OR_CMD && !shiftKey` (Ctrl/Cmd+S).
- `actionSaveFileToDisk` (exported const) — `register({ name: "saveFileToDisk", label, icon: ExportIcon, viewMode: true, trackEvent, perform (async), keyTest, PanelComponent })` (L375-L438). Like above but always `saveAsJSON({ fileHandle: null })` (forces a new file), closes `openDialog`, sets the returned `fileHandle`, and shows a 3s toast. `keyTest`: `S && shiftKey && CTRL_OR_CMD` (Ctrl/Cmd+Shift+S). `PanelComponent`: a "Save as" `ToolButton`, hidden unless `nativeFileSystemSupported`, shows aria label on phone form factor (`useEditorInterface().formFactor === "phone"`).
- `actionLoadScene` (exported const) — `register({ name: "loadScene", label, trackEvent, predicate, perform (async), keyTest })` (L440-L476). `predicate`: enabled when `UIOptions.canvasActions.loadScene` and not view-mode. `perform`: `await loadFromJSON(appState, elements)` → returns loaded `elements/appState/files` with `IMMEDIATELY`; on `AbortError` returns `false`; on other errors returns unchanged elements with `appState.errorMessage` set (`EVENTUALLY`). `keyTest`: `CTRL_OR_CMD && key === KEYS.O`.
- `actionExportWithDarkMode` (exported const) — `register<AppState["exportWithDarkMode"]>({ ... })` (L478-L509). `perform` side-effect: sets `app.sessionExportThemeOverride = value ? THEME.DARK : THEME.LIGHT` and toggles `appState.exportWithDarkMode` (`EVENTUALLY`). `PanelComponent` renders a `DarkModeToggle` (with a `-45px` top margin hack to overlap the preview).

---

Notes: No file in this cluster was empty or types-only. All modules are `register`-based action definitions; the substantive geometry (element distribution), z-index reindexing (`syncMovedIndices`), duplication, group-selection, and export-size math live in `@excalidraw/element` / `scene/export` and are merely orchestrated here.
