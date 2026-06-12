## Cluster: excalidraw__actions__2

This cluster contains seven action modules from `packages/excalidraw/actions/`. Each module uses the `register()` factory (from `./register`) to declare one or more `Action` objects with a `perform` reducer, optional `keyTest`, `predicate`, `PanelComponent`, and metadata. Actions return an `ActionResult` (`{ elements?, appState?, captureUpdate }`) or `false` (no-op). `CaptureUpdateAction.IMMEDIATELY` records an undo entry; `EVENTUALLY` defers/no-history; `NEVER` does not record (used by undo/redo themselves).

---

### packages/excalidraw/actions/actionFinalize.tsx

Purpose: Defines the single `finalize` action that ends multi-point linear-element editing / element creation (Enter/Escape, or pointer-up at the end of an arrow/line/freedraw drag), committing or discarding the in-progress element and resetting the active tool.

- **Type `FormData`** (L47-L50): `{ event: PointerEvent; sceneCoords: { x: number; y: number } }` — the payload passed to `perform` when finalize is triggered by a pointer-up gesture (as opposed to a keyboard finalize, where `data` is undefined).

- **`actionFinalize` (register<FormData>)** (L52-L366): `name: "finalize"`, empty `label`, `trackEvent: false`.
  - **`perform: (elements, appState, data, app) => ActionResult`** (L56-L349): The core finalize reducer. Behavior in stages:
    1. Captures `interactiveCanvas`, `focusContainer`, `scene` from `app`; `elementsMap = scene.getNonDeletedElementsMap()` (L58-L59).
    2. **Pointer-driven branch** (L61-L188), entered when `data` and `appState.selectedLinearElement` both exist. Looks up the linear element via `LinearElementEditor.getElement(...)` and asserts it exists and `sceneCoords` is defined via `invariant` (L63-L76). Calls `LinearElementEditor.handlePointerUp(event, selectedLinearElement, appState, scene)` to produce an updated editor (L78-L83).
       - **Binding sub-branch** (L85-L123): if the element `isBindingElement` and no segment-midpoint is hovered, computes `selectedPointsIndices` (last point for a new arrow, else the editor's selected indices), builds a `PointsPositionUpdates` Map mapping each index to a local point computed from `LinearElementEditor.pointFromAbsoluteCoords(...)` using `sceneCoords` minus `linearElementEditor.pointerOffset` (coordinate-space note: scene/global coords are offset-corrected then converted to element-local coords). Calls `bindOrUnbindBindingElement(...)` with `{ newArrow, altKey, angleLocked: shouldRotateWithDiscreteAngle(event) }` to (un)bind arrow endpoints (L96-L123).
       - **Line-element sub-branch** (L124-L134): if editing an existing line that is no longer a valid polygon, mutates `polygon: false`.
       - **Editor-changed return** (L136-L187): if `handlePointerUp` returned a new editor instance, deletes the element if invisibly small (`isInvisiblySmallElement`) by mapping to `newElementWith(el, { isDeleted: true })`; returns elements (deleting if `points.length < 2` or invisibly small) and a reset appState (`cursorButton: "up"`, `selectedLinearElement` cleared/normalized unless tool is locked, clears `selectionElement/suggestedBinding/newElement/multiElement`), `captureUpdate: IMMEDIATELY`.
    3. **Focus restore** (L190-L192): if `document.activeElement` is an `HTMLElement`, calls `focusContainer()`.
    4. **Resolve target `element`** (L194-L209): picks `multiElement`, else a freedraw/binding `newElement`, else the sole selected element.
    5. **Element-finalize block** (L211-L273): for pen/mouse hover, trims a trailing uncommitted point from a multiElement (`points.slice(0, -1)`) when the last point isn't the `lastCommittedPoint` (L213-L229). Deletes invisibly-small elements (L231-L239). For linear/freedraw elements, detects a closed loop via `isPathALoop(points, zoom.value)` (zoom-dependent loop tolerance) and, for line/freedraw, snaps the last point exactly to the first point and sets `polygon: true` for line elements; clears `polygon` for invalid line polygons (L241-L272).
    6. **Cursor reset** (L275-L281): `resetCursor` unless tool is locked/freedraw with a live element.
    7. **Next active tool** (L283-L295): if current tool is `eraser`, restores `lastActiveTool` (clearing `lastActiveToolBeforeEraser`); otherwise switches to `preferredSelectionTool`.
    8. **Selected linear element** (L297-L314): if the finalized element is linear, constructs a fresh `new LinearElementEditor(element, arrayToMap(newElements))` so it is selected after multi-point editing; normalizes `isEditing`, `lastClickedPoint: -1`, `origin: null`.
    9. **Final return** (L316-L348): resets a large set of appState fields (`activeTool`, `activeEmbeddable`, `newElement`, `selectionElement`, `multiElement`, `editingTextElement`, `suggestedBinding`, `frameToHighlight`), adds the finalized element to `selectedElementIds` unless the tool is locked/freedraw, sets `selectedLinearElement`, `captureUpdate: IMMEDIATELY`.
  - **`keyTest: (event, appState) => boolean`** (L350-L353): true when Escape while `selectedLinearElement.isEditing`, OR (Escape or Enter) while a `multiElement` is active.
  - **`PanelComponent: ({ appState, updateData, data }) => JSX`** (L354-L365): renders a `ToolButton` ("done" icon) visible only when `appState.multiElement != null`; `onClick={updateData}`; size from `data?.size`; `pointerEvents: "all"`.

  Performance/geometry note: loop closure uses `isPathALoop(points, zoom.value)` so the snap-to-close tolerance scales with zoom; closing rewrites the last point to equal the first point exactly so the loop stays closed at any scale.

---

### packages/excalidraw/actions/actionFlip.ts

Purpose: Defines `flipHorizontal` / `flipVertical` actions that mirror the current selection in place, with special handling for bound arrows and re-centering to prevent positional drift on repeated flips.

- **`actionFlipHorizontal` (register)** (L29-L52): `name: "flipHorizontal"`, `label: "labels.flipHorizontal"`, icon `flipHorizontal`, `trackEvent: { category: "element" }`.
  - **`perform: (elements, appState, _, app) => ActionResult`** (L34-L50): returns `elements` from `updateFrameMembershipOfSelectedElements(flipSelectedElements(elements, scene.getNonDeletedElementsMap(), appState, "horizontal", app), appState, app)`; passes appState through unchanged; `captureUpdate: IMMEDIATELY`.
  - **`keyTest`** (L51): Shift + key code `H`.

- **`actionFlipVertical` (register)** (L54-L78): mirror of the above with `"vertical"`.
  - **`keyTest`** (L76-L77): Shift + code `V` and NOT Ctrl/Cmd (so it doesn't collide with paste-as-vertical or similar).

- **`flipSelectedElements(elements, elementsMap, appState, flipDirection, app)`** (L80-L108): Resolves `selectedElements` via `getSelectedElements(getNonDeletedElements(elements), appState, { includeBoundTextElement: true, includeElementsInFrames: true })`, calls `flipElements(...)`, builds a map of the updated elements, and returns `elements.map(el => updatedMap.get(el.id) || el)` (replaces flipped elements in place, preserving array order). Returns the full element array.

- **`flipElements(selectedElements, elementsMap, flipDirection, app): ExcalidrawElement[]`** (L110-L196): The geometric core.
  - **Bound-arrow special case** (L116-L129): if every selected element is an arrow with a start or end binding, flipping is implemented purely by swapping `startArrowhead` and `endArrowhead` (via `newElementWith`) rather than spatial mirroring — returns early.
  - **Spatial flip** (L131-L150): computes the selection's common bounding box center `{ midX, midY }` via `getCommonBoundingBox`, then calls `resizeMultipleElements(selectedElements, elementsMap, "nw", app.scene, originalElementsMap, { flipByX/flipByY, shouldResizeFromCenter: true, shouldMaintainAspectRatio: true })`. The original-elements snapshot is built by deep-copying every element in `elementsMap` (`deepCopyElement`). Flip is expressed as a resize from the `"nw"` handle with negative scaling on the chosen axis.
  - **Re-bind** (L152-L156): `bindOrUnbindBindingElements` on the arrow subset to refresh bindings after the move.
  - **Re-centering** (L158-L193): partitions selection into `elbowArrows` vs `otherElements`; recomputes the new bounding-box center after the resize; computes `diffX = midX - newMidX`, `diffY = midY - newMidY`; and shifts every element (both groups) by that delta via `scene.mutateElement`. This compensates for arrows "bumping against the wall" of the selection box so repeated flips don't accumulate an offset (documented at L158-L163).
  - Returns the (now-mutated) `selectedElements`.

  Geometry/parity note: flip is NOT a simple `x -> 2*midX - x` per element; it routes through `resizeMultipleElements` with `shouldResizeFromCenter` + aspect-ratio lock, then corrects center drift — important to replicate exactly for arrow/elbow parity.

---

### packages/excalidraw/actions/actionFrame.ts

Purpose: Defines frame-related actions: select all children of a frame, remove all children, toggle frame rendering, activate the frame tool, and wrap the current selection in a new frame.

- **`isSingleFrameSelected(appState, app): boolean`** (L29-L38): helper returning true when exactly one element is selected and it `isFrameLikeElement`. Used as the predicate for the next two actions.

- **`actionSelectAllElementsInFrame` (register)** (L40-L75): `name: "selectAllElementsInFrame"`, `trackEvent: { category: "canvas" }`.
  - **`perform`** (L44-L72): if the first selected element is frame-like, gets `getFrameChildren(nonDeleted, frame.id)` excluding bound text (`type === "text" && containerId`), and sets `selectedElementIds` to all those children; `captureUpdate: IMMEDIATELY`. Otherwise no-op with `EVENTUALLY`.
  - **`predicate`** (L73-L74): `isSingleFrameSelected`.

- **`actionRemoveAllElementsFromFrame` (register)** (L77-L106): `name: "removeAllElementsFromFrame"`, `trackEvent: { category: "history" }`.
  - **`perform`** (L81-L103): if a frame is selected, `removeAllElementsFromFrame(elements, frame)` and selects only the frame; `IMMEDIATELY`. Else no-op `EVENTUALLY`.
  - **`predicate`** (L104-L105): `isSingleFrameSelected`.

- **`actionupdateFrameRendering` (register)** (L108-L127): `name: "updateFrameRendering"`, `viewMode: true`.
  - **`perform`** (L113-L125): toggles `appState.frameRendering.enabled`; `captureUpdate: EVENTUALLY` (UI state, not undoable).
  - **`checked: (appState) => appState.frameRendering.enabled`** (L126).

- **`actionSetFrameAsActiveTool` (register)** (L129-L161): `name: "setFrameAsActiveTool"`, `label: "toolBar.frame"`, icon `frameToolIcon`, `viewMode: false`.
  - **`perform`** (L135-L155): builds `updateActiveTool(appState, { type: "frame" })`, sets the canvas cursor via `setCursorForShape`, and sets `appState.activeTool` to the frame tool; `EVENTUALLY`. (Note: it computes `nextActiveTool` then calls `updateActiveTool` a second time inline for the returned appState.)
  - **`keyTest`** (L156-L160): plain `F` with no Ctrl/Cmd, Shift, or Alt.

- **`actionWrapSelectionInFrame` (register)** (L163-L218): `name: "wrapSelectionInFrame"`, `trackEvent: { category: "element" }`.
  - **`predicate`** (L167-L174): true when ≥1 element selected and none are frame-like.
  - **`perform`** (L175-L217): computes the selection's common bounds `[x1,y1,x2,y2]` via `getCommonBounds`, then creates a `newFrameElement` enlarged by `PADDING = 16` on every side (`x: x1-16`, `width: x2-x1+32`, etc.). If `editingGroupId` is set, strips that group id (and everything after it) from each in-group element so a partial group gets removed from its enclosing group (L189-L202). Calls `addElementsToFrame([...allIncludingDeleted, frame], selectedElements, frame)` to assign frame membership; selects only the new frame; `captureUpdate: IMMEDIATELY`.

  Geometry note: the frame is padded by a fixed 16px world-space margin around the selection bounds.

---

### packages/excalidraw/actions/actionGroup.tsx

Purpose: Defines `group` and `ungroup` actions, managing `groupIds` on elements, z-order coalescing of grouped elements, and frame-membership consistency.

- **`allElementsInSameGroup(elements): boolean`** (L52-L67): returns true if (≥2 elements and) there exists a common `groupId` present on every element (via `isElementInGroup`). Used to disable grouping when everything is already in one group.

- **`enableActionGroup(elements, appState, app): boolean`** (L69-L84): predicate — true when ≥2 selected elements (including bound text), NOT all already in the same group, and not a frame-with-children selected together (`frameAndChildrenSelectedTogether`).

- **`actionGroup` (register)** (L86-L212): `name: "group"`, `label: "labels.group"`, dynamic `icon` `<GroupIcon theme={appState.theme}/>`, `trackEvent: { category: "element" }`.
  - **`perform`** (L91-L196):
    1. `selectedElements = getRootElements(scene.getSelectedElements({ ..., includeBoundTextElement: true }))`. Early no-op if `< 2` (L92-L105).
    2. Idempotency guard (L107-L130): if exactly one group is selected and the selected ids add nothing new to that group's element set, no-op `EVENTUALLY`.
    3. **Cross-frame handling** (L134-L149): if selected elements span more than one `frameId`, remove the in-frame ones from their frames (`groupByFrameLikes` then `removeElementsFromFrame`) before grouping.
    4. Generates `newGroupId = randomId()`, maps each selected element to `newElementWith(el, { groupIds: addToGroup(el.groupIds, newGroupId, editingGroupId) })` (L151-L165).
    5. **Z-order coalescing** (L166-L182): finds the highest-stacked element in the new group, moves all group members contiguously to just below it: builds `[elementsBeforeGroup (minus group members), elementsInGroup, elementsAfterGroup]`, then `syncMovedIndices(...)` to fix fractional indices.
    6. Returns appState merged with `selectGroup(newGroupId, ...)` and `elements: reorderedElements`; `captureUpdate: IMMEDIATELY`.
  - **`predicate`** (L197-L198): `enableActionGroup`.
  - **`keyTest`** (L199-L200): Ctrl/Cmd + `G` without Shift.
  - **`PanelComponent`** (L201-L211): `ToolButton` (GroupIcon) hidden unless `enableActionGroup`, visible when some element selected; `onClick={() => updateData(null)}`; title shows `CtrlOrCmd+G` shortcut.

- **`actionUngroup` (register)** (L214-L320): `name: "ungroup"`, dynamic `<UngroupIcon/>`.
  - **`perform`** (L219-L302):
    1. `groupIds = getSelectedGroupIds(appState)`; no-op `EVENTUALLY` if none (L220-L229).
    2. For each element, collects `boundTextElementIds` (elements `isBoundToContainer`) and removes the selected group ids from `groupIds` via `removeFromSelectedGroups`; unchanged elements are returned as-is, others via `newElementWith` (L233-L248).
    3. Recomputes selection groups via `selectGroupsForSelectedElements` (L250-L255).
    4. **Frame consistency** (L257-L282): for frames containing the (now-ungrouped) selected elements, re-runs `replaceAllElementsInFrame(nextElements, getElementsInResizingFrame(...), frame)` so frame membership stays correct.
    5. Strips bound-text element ids from `selectedElementIds` (L284-L295).
    6. Returns merged appState + `nextElements`; `captureUpdate: IMMEDIATELY`.
  - **`keyTest`** (L303-L306): Shift + Ctrl/Cmd + uppercase `G`.
  - **`predicate`** (L307): `getSelectedGroupIds(appState).length > 0`.
  - **`PanelComponent`** (L309-L319): `ToolButton` (UngroupIcon) with `CtrlOrCmd+Shift+G` title.

---

### packages/excalidraw/actions/actionHistory.tsx

Purpose: Factory-creates the `undo` and `redo` actions, wiring them to the editor `History` instance and gating them so history isn't traversed mid-interaction.

- **`executeHistoryAction(app, appState, updater): ActionResult`** (L26-L61): Guard + executor for history traversal. Only runs `updater()` when NO interaction is in progress — i.e. all of `multiElement`, `resizingElement`, `editingTextElement`, `newElement`, `selectedElementsAreBeingDragged`, `selectionElement` are falsy AND `app.flowChartCreator.isCreatingChart` is false (L31-L39). If `updater()` returns nothing (empty stack), returns `{ captureUpdate: EVENTUALLY }`. Otherwise destructures `[nextElementsMap, nextAppState]`, re-orders elements deterministically via `orderByFractionalIndex(Array.from(nextElementsMap.values()))` (defensive against accidental map mutation), and returns them with `captureUpdate: NEVER` (history operations must not themselves create new history entries). If the interaction guard fails, returns `EVENTUALLY` (no-op).

- **Type `ActionCreator`** (L63): `(history: History) => Action`.

- **`createUndoAction: ActionCreator`** (L65-L102): returns the `undo` action. `perform` calls `executeHistoryAction(app, appState, () => history.undo(arrayToMap(elements), appState))`. `keyTest`: Ctrl/Cmd + `Z` without Shift. `viewMode: false`.
  - **`PanelComponent`** (L77-L101): subscribes to `history.onHistoryChangedEmitter` via `useEmitter<HistoryChangedEvent>` to get live `isUndoStackEmpty`; reads `useStylesPanelMode() === "mobile"`; renders a `ToolButton` (UndoIcon) `disabled={isUndoStackEmpty}`, `data-testid="button-undo"`, applying `MOBILE_ACTION_BUTTON_BG` style on mobile.

- **`createRedoAction: ActionCreator`** (L104-L142): mirror of undo. `perform` calls `history.redo(...)`. `keyTest`: (Ctrl/Cmd + Shift + `Z`) OR (Ctrl/Cmd + `Y`). `PanelComponent` mirrors undo with `isRedoStackEmpty` and `data-testid="button-redo"`.

  Note: these are exported as creator functions (not bare actions) because each closes over a runtime `History` instance.

---

### packages/excalidraw/actions/actionLinearEditor.tsx

Purpose: Defines `toggleLinearEditor` (enter/exit point-editing mode for a single linear element) and `togglePolygon` (convert line elements to/from a closed polygon).

- **`actionToggleLinearEditor` (register)** (L29-L110): `name: "toggleLinearEditor"`, `category: DEFAULT_CATEGORIES.elements`, `keywords: ["line"]`, `trackEvent: { category: "element" }`.
  - **`label: (elements, appState, app) => string`** (L32-L40): returns `"labels.lineEditor.editArrow"` if the single selected element is an arrow, else `"labels.lineEditor.edit"`.
  - **`predicate`** (L45-L56): true only when NOT already editing, exactly one element is selected, it `isLinearElement`, and it is NOT an elbow arrow (`!isElbowArrow`).
  - **`perform`** (L57-L85): re-fetches the selected linear element (including bound text), asserts via `invariant` that it exists, that `appState.selectedLinearElement` exists, and that their ids match. Toggles `selectedLinearElement.isEditing` and returns it in appState; `captureUpdate: IMMEDIATELY`.
  - **`PanelComponent`** (L86-L109): renders a `ToolButton` (lineEditorIcon) with an arrow/line-specific label; returns `null` if nothing selected.

- **`actionTogglePolygon` (register)** (L112-L217): `name: "togglePolygon"`, `category: elements`, icon `polygonIcon`, `keywords: ["loop"]`.
  - **`label`** (L117-L129): `"labels.polygon.breakPolygon"` if all selected are already polygons, else `"labels.polygon.convertToPolygon"`.
  - **`predicate`** (L133-L144): true when >0 selected and every selected element `isLineElement` with `points.length >= 4`.
  - **`perform`** (L145-L175): bails (`return false`) if any selected element is not a line. Computes `nextPolygonState = some element is not yet a polygon` (i.e. if any isn't a polygon, convert all to polygon). For each target line element, applies `newElementWith(element, { backgroundColor: nextPolygonState ? element.backgroundColor : "transparent", ...toggleLinePolygonState(element, nextPolygonState) })` — note: breaking a polygon forces `backgroundColor: "transparent"`. `captureUpdate: IMMEDIATELY`.
  - **`PanelComponent`** (L176-L216): renders a `ButtonIcon` (polygonIcon, `active={allPolygon}`, `marginLeft: auto`) only when every selected element is a polygon line with `points.length >= 3`; otherwise `null` — so the button only appears to allow disabling an existing polygon.

  Note: this file imports `newElementWith` from a deep relative path `../../element/src/mutateElement` (L25) rather than the package barrel — an inconsistency worth noting for a reimplementation.

---

### packages/excalidraw/actions/actionLink.tsx

Purpose: Defines the single `hyperlink` action that opens the hyperlink editor popup for a single selected element (or embeddable).

- **`actionLink` (register)** (L16-L59): `name: "hyperlink"`, dynamic `label: (elements, appState) => getContextMenuLabel(elements, appState)`, icon `LinkIcon`, `trackEvent: { category: "hyperlink", action: "click" }`.
  - **`perform: (elements, appState) => ActionResult | false`** (L20-L34): if `appState.showHyperlinkPopup === "editor"` already, returns `false` (no-op). Otherwise sets `showHyperlinkPopup: "editor"` and `openMenu: null`; `captureUpdate: IMMEDIATELY`.
  - **`keyTest`** (L36): Ctrl/Cmd + `K`.
  - **`predicate`** (L37-L40): exactly one selected element.
  - **`PanelComponent`** (L41-L58): renders a `ToolButton` (LinkIcon) whose title is `labels.link.labelEmbed` for embeddables (`isEmbeddableElement(elements[0])`) else `labels.link.label`, suffixed with the `CtrlOrCmd+K` shortcut; `selected` is true when one element is selected and it has a `link`.
