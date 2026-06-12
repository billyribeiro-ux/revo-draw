## Cluster: excalidraw__components__19

This cluster covers the **Stats panel** of Excalidraw — a floating, collapsible "inspector" Island that shows scene-wide stats (shape count, bounding-box width/height, grid step) and per-element editable properties (X/Y position, W/H dimension, angle, font size). The common interaction primitive is a **drag-to-scrub numeric input** (`DragInput`), shared by every stat field. Files in this cluster: `CanvasGrid.tsx`, `Collapsible.tsx`, `Dimension.tsx`, `DragInput.tsx`, `FontSize.tsx`, `index.tsx`, `MultiAngle.tsx`. (`Position`, `Angle`, `MultiPosition`, `MultiDimension`, `MultiFontSize`, and `utils.ts` are referenced here but live in cluster `__20`.)

---

### packages/excalidraw/components/Stats/CanvasGrid.tsx

Stats field that lets the user scrub/type the grid step size (in scene units) when grid mode is enabled; it edits `appState.gridStep` rather than any element.

- **`STEP_SIZE` (const = 5)** — L17. The Shift-modifier coarse step for grid-step changes.
- **`CanvasGrid({ property, scene, appState, setAppState }: PositionProps)` → JSX** — L19-L68. Renders a `StatsDragInput` (`DragInput`) labelled "Grid step", with `sensitivity={8}` (8px drag per unit) and `elements={[]}` (no element is mutated). Props interface `PositionProps` (L10-L15): `property: "gridStep"`, `scene: Scene`, `appState: AppState`, `setAppState` typed as `React.Component<any, AppState>["setState"]`.
  - The inline `dragInputCallback` (L30-L61): receives `{ nextValue, instantChange, shouldChangeByStepSize, setInputValue }`. Inside a functional `setAppState`: if `nextValue` (typed value) present, use it; else if `instantChange` (drag) present, either snap via `getStepSizedValue(state.gridStep + STEP_SIZE * Math.sign(instantChange), STEP_SIZE)` when Shift held, or add the raw `instantChange`. If the computed `nextGridStep` is falsy (e.g. 0), it resets the input to the current `state.gridStep` and returns `null` (no state change). Otherwise it normalizes via `getNormalizedGridStep(nextGridStep)`, echoes it back to the input via `setInputValue`, and returns `{ gridStep }`.
  - Side effect / invariant: never produces a 0 or negative grid step; `getNormalizedGridStep` (from `../../scene`) clamps to a valid grid step. `Math.sign(instantChange)` makes a single Shift-drag pixel always move exactly one `STEP_SIZE` increment in the drag direction.

---

### packages/excalidraw/components/Stats/Collapsible.tsx

A small controlled expand/collapse section wrapper (label row + chevron icon + conditionally-rendered children) used to group the Stats panels.

- **`CollapsibleProps` (interface)** — L4-L14: `label: React.ReactNode`, `open: boolean`, `openTrigger: () => void`, `children: React.ReactNode`, `className?: string`, `showCollapsedIcon?: boolean`. The comment (L6-L8) notes `open` is deliberately controlled by the parent so the user's expand choice survives unmount of the Collapsible.
- **`Collapsible({ label, open, openTrigger, children, className, showCollapsedIcon = true }: CollapsibleProps)` → JSX** — L16-L48. Renders a clickable header row (flex, space-between, `cursor: pointer`) wired to `openTrigger` on click; shows `label`, and when `showCollapsedIcon` is true an `InlineIcon` that is `collapseUpIcon` when open else `collapseDownIcon`. Children are rendered (in a vertical flex column) only when `open` is true (L41-L45). No internal state — purely presentational/controlled.

---

### packages/excalidraw/components/Stats/Dimension.tsx

Stats field for editing a single element's `width` or `height`, including special handling for image-crop mode and frame re-membership; the heaviest geometry file in the cluster.

- **`DimensionDragInputProps` (interface)** — L27-L32: `property: "width" | "height"`, `element: ExcalidrawElement`, `scene: Scene`, `appState: AppState`.
- **`STEP_SIZE` (const = 10)** — L34. Shift-modifier coarse step for dimension changes.
- **`_shouldKeepAspectRatio(element)` → boolean** — L35-L37. Returns true only when `element.type === "image"` (images always lock aspect ratio).
- **`handleDimensionChange: DragInputCallbackType<"width" | "height">`** — L39-L279. The core mutation callback. Resolves `origElement = originalElements[0]` and the live `latestElement` from the scene map; bails if either missing.
  - **Aspect ratio** (L59-L61): `keepAspectRatio = shouldKeepAspectRatio || _shouldKeepAspectRatio(origElement)`; `aspectRatio = origElement.width / origElement.height`.
  - **Crop-mode branch** (L63-L162): when `originalAppState.croppingElementId === origElement.id` and the element is an image with a `crop`. Computes flip flags from `element.scale` (`isFlippedByX/Y`), gets uncropped dims via `getUncroppedWidthAndHeight`, and the natural-to-uncropped ratios. `MAX_POSSIBLE_WIDTH/HEIGHT` account for flip (L83-L89). `MIN_WIDTH/HEIGHT = MINIMAL_CROP_SIZE * naturalToUncropped*Ratio` (L91-L92). For a typed `nextValue` (L94-L130): converts the displayed value to natural-space, `clamp`s the crop dimension between min and max, adjusts crop `x`/`y` when flipped (so the crop grows from the correct edge), then `scene.mutateElement` sets `crop` plus a back-converted `width`/`height` (crop dim divided by natural/uncropped ratio). For a drag (L132-L161): same clamp logic using `instantChange` as the delta (note: height clamp uses `MIN_WIDTH` as its lower bound at L143 — a minor inconsistency worth replicating-or-fixing in parity).
  - **Typed-value branch (non-crop)** (L165-L215): computes `nextWidth`/`nextHeight`, applying `aspectRatio` to the non-edited dimension when `keepAspectRatio`, each floored at `MIN_WIDTH_OR_HEIGHT`. Calls `resizeSingleElement(nextWidth, nextHeight, latestElement, origElement, originalElementsMap, scene, property === "width" ? "e" : "s", { shouldMaintainAspectRatio })` — i.e. resize from the east handle for width, south handle for height. If the element is a frame, recomputes frame membership via `getElementsInResizingFrame` and commits it with `replaceAllElementsInFrame` + `scene.replaceAllElements`.
  - **Drag branch (non-crop)** (L218-L277): `changeInWidth/Height = accumulatedChange` for the active property. Computes raw next dim (floored at 0), then either `getStepSizedValue` snap (Shift) or `Math.round`. When `keepAspectRatio`, derives the opposite dimension from `aspectRatio`, rounded to 2 decimals (`Math.round(x*100)/100`). Both clamped up to `MIN_WIDTH_OR_HEIGHT`, then `resizeSingleElement` from the same handle. For frames, instead of committing membership it sets `appState.elementsToHighlight` to the candidate elements (live highlight during drag).
- **`handleDragFinished: DragFinishedCallbackType`** — L281-L312. On drag end, if the resized element is a frame, recomputes `getElementsInResizingFrame`, commits via `replaceAllElementsInFrame` + `replaceAllElements`, and clears `elementsToHighlight` to `null`. Otherwise no-op.
- **`DimensionDragInput({ property, element, scene, appState }: DimensionDragInputProps)` → JSX** — L314-L353. Computes the displayed `value`: `round(width|height, 2)` normally (L320); in crop mode for an image with a crop, instead shows the cropped portion scaled to uncropped space — `value = round(element.crop.width * (uncroppedWidth / crop.naturalWidth), 2)` for width (and analogous for height) (L322-L338). Renders `DragInput` with label "W"/"H", `editable={isPropertyEditable(element, property)}`, and `dragFinishedCallback={handleDragFinished}`.
  - Coordinate/perf note: all width/height values are in **scene (world) units**; rounding to 2 decimals (`round(x, 2)`) keeps the UI stable. Crop math converts between displayed-uncropped space and the image's natural pixel space via the natural/uncropped ratio — important for a parity reimplementation of image cropping.

---

### packages/excalidraw/components/Stats/DragInput.tsx

The shared draggable/typable numeric stat input — owns the pointer-drag scrubbing gesture, debounced/idempotent commit logic, and the generic `DragInputCallbackType` contract used by every other Stats field.

- **`DragInputCallbackType<P extends StatsInputProperty, E = ExcalidrawElement>` (type)** — L24-L41. Callback signature receiving `{ accumulatedChange, instantChange, originalElements, originalElementsMap, shouldKeepAspectRatio, shouldChangeByStepSize, scene, nextValue?, property, originalAppState, setInputValue, app, setAppState }`, returns `void`. `accumulatedChange` = total scaled drag delta; `instantChange` = per-tick delta; `nextValue` present only when the user typed and committed.
- **`DragFinishedCallbackType<E = ExcalidrawElement>` (type)** — L43-L48. `{ app, setAppState, originalElements, originalAppState }` → `void`. Fired once on pointer-up.
- **`StatsDragInputProps<T, E>` (interface)** — L50-L67. Props: `label`, optional `icon`, `value: number | "Mixed"`, `elements`, `editable = true`, `shouldKeepAspectRatio?`, `dragInputCallback`, `property`, `scene`, `appState`, `sensitivity?` (px-of-drag per 1 unit change), `dragFinishedCallback?`.
- **`StatsDragInput<T, E>({...})` → JSX | null** — L69-L382. The component.
  - **Hooks/refs/state**: `useApp()` and `useExcalidrawSetAppState()` (L86-L87); `inputRef` (the `<input>`), `labelRef` (the drag handle, L88-L89); `inputValue` state initialized from `value.toString()` (L91); a lazily-initialized `stateRef` (L93-L106) holding `{ originalAppState, originalElements, lastUpdatedValue, updatePending }`; a `callbacksRef` (L161-L167) holding the latest `handleInputValue`/`onPointerMove`/`onPointerUp` (so the unmount cleanup can call the freshest closures).
  - **`useEffect` on `[value]`** (L108-L112): syncs `inputValue` and `stateRef.lastUpdatedValue` whenever the external `value` prop changes (external truth wins over stale typed text).
  - **`handleInputValue(updatedValue, elements, appState)`** (L114-L159): the commit path. No-ops unless `stateRef.updatePending`. Parses the string; on NaN resets input to `value`. Rounds to 2 decimals; only fires `dragInputCallback` (with `nextValue: rounded`, zero deltas) when the original was "Mixed" (`isNaN(original)`) OR the change exceeds `SMALLEST_DELTA` (0.01) — this idempotency guard avoids redundant mutations. After the callback, commits history via `app.syncActionResult({ captureUpdate: CaptureUpdateAction.IMMEDIATELY })`.
  - **Unmount `useEffect` keyed on `[editable]`** (L172-L207): on cleanup, if the input still has a value, calls `handleInputValue` with the saved original elements/appState — this catches the case where clicking the canvas unmounts the component without firing `blur`. Also defensively removes the global pointer listeners. Keyed on `editable` because React doesn't fire `blur` on disabled inputs (referenced React issue #9142), so toggling editability is used as a synthetic mount/unmount to force a commit.
  - **Early return `null` when `!editable`** (L209-L211).
  - **Label drag handle** (L218-L339): `onPointerDown` starts a scrub. Adds `excalidraw-cursor-resize` to `document.body`; snapshots `originalElementsMap` by `deepCopyElement`-ing every non-deleted element into a fresh `Map`, derives `originalElements`, and `cloneJSON(appState)`. Accumulators `accumulatedChange` and `stepChange` start at 0.
    - **`onPointerMove(event)`** (L251-L293): `instantChange = event.clientX - lastPointer.x`. Adds to `stepChange`; once `|stepChange| >= sensitivity`, quantizes it to `sign * floor(|stepChange|/sensitivity)`, adds to `accumulatedChange`, and fires `dragInputCallback` with `instantChange: stepChange`, `shouldChangeByStepSize: event.shiftKey`, then resets `stepChange = 0`. Always updates `lastPointer`. **Perf/geometry note**: horizontal mouse movement (`clientX` only) drives scrubbing; `sensitivity` is the px-per-unit divisor so larger sensitivity = slower change; the `floor`+remainder accounting means sub-sensitivity motion accumulates rather than being lost.
    - **`onPointerUp()`** (L295-L323): removes the move listener, commits history (`syncActionResult` IMMEDIATELY), calls `dragFinishedCallback`, resets all accumulators/originals to null, removes the resize cursor, removes the up listener.
    - Listeners are registered on `window` (L328-L329) and mirrored into `callbacksRef`.
  - **`onPointerEnter`** (L332-L336): sets the label cursor to `ew-resize`.
  - **`<input>` handlers** (L340-L379): `onKeyDown` commits on Enter via `handleInputValue` then `app.focusContainer()`; `onChange` sets `updatePending = true` and updates `inputValue`; `onFocus` selects all text and snapshots originals; `onBlur` resets to `value` if empty else commits. `disabled={!editable}`.
  - Invariants: all mutations route through `dragInputCallback`; history is captured exactly once per gesture (drag) or per commit (type); originals are deep-copied at gesture start so resize math is always relative to the pre-drag state, not the mutating live element.

---

### packages/excalidraw/components/Stats/FontSize.tsx

Stats field for editing a single text element's (or a container's bound-text element's) `fontSize`.

- **`FontSizeProps` (interface)** — L22-L27: `element`, `scene`, `appState`, `property: "fontSize"`.
- **`MIN_FONT_SIZE` (const = 4)** — L29. Floor for font size.
- **`STEP_SIZE` (const = 4)** — L30. Shift-modifier coarse step.
- **`handleFontSizeChange: DragInputCallbackType<"fontSize", ExcalidrawTextElement>`** — L32-L78. Resolves the live element from the scene map; bails unless it is a text element. If `nextValue` (typed) given: `nextFontSize = max(round(nextValue), MIN_FONT_SIZE)`. Else for drag on a text element: `originalFontSize + round(accumulatedChange)`, floored at min, optionally snapped via `getStepSizedValue` when Shift held. If a font size was produced, `scene.mutateElement(latestElement, { fontSize })` then `redrawTextBoundingBox(latestElement, scene.getContainerElement(latestElement), scene)` to re-layout/wrap the text within its container.
- **`FontSize({ element, scene, appState, property }: FontSizeProps)` → JSX | null** — L80-L103. Resolves `_element`: the element itself if it's text, else its bound text element via `getBoundTextElement` if it has one, else `null` (returns `null`, hiding the field). Renders `DragInput` labelled "F" with the `fontSizeIcon`, `value = Math.round(_element.fontSize * 10) / 10` (1-decimal display).

---

### packages/excalidraw/components/Stats/index.tsx

The top-level Stats panel: a memoized Island showing general scene stats and (when 1 or >1 elements are selected) the per-element property editors; also defines `StatsRow`/`StatsRows` layout helpers.

- **`StatsProps` (interface)** — L43-L47: `app: AppClassProperties`, `onClose: () => void`, `renderCustomStats: ExcalidrawProps["renderCustomStats"]`.
- **`STATS_TIMEOUT` (const = 50)** — L49. Throttle window (ms) for recomputing scene bounds.
- **`Stats(props: StatsProps)` → JSX** — L51-L69. The outer component: pulls `appState` (`useExcalidrawAppState`), reads `sceneNonce` (`getSceneNonce() || 1`), computes `selectedElements` (excluding bound text), and `gridModeEnabled` (`isGridModeEnabled`), then forwards everything to memoized `StatsInner`. The nonce is the cheap change-detector that drives re-render of scene dimensions.
- **`StatsRow({ children, columns = 1, heading, style, ...rest })` → JSX** — L71-L93. A grid row with `grid-template-columns: repeat(columns, 1fr)` and an optional `--heading` class. `displayName = "StatsRow"`; attached as `Stats.StatsRow` (L112).
- **`StatsRows({ children, order, style, ...rest })` → JSX** — L96-L109. Vertical container with optional flex `order`. `displayName = "StatsRows"`; attached as `Stats.StatsRows` (L113).
- **`StatsInner = memo((props) => ..., areEqual)`** — L115-L443. The heavy panel.
  - **Derived/owned state**: `singleElement` (selection length 1, L135-L136), `multipleElements` (>1, L138-L139), `cropMode` (`croppingElementId && isImageElement(singleElement)`, L141-L142), `unCroppedDimension` (L144-L146). `sceneDimension` state `{ width, height }` (L148-L154).
  - **`throttledSetSceneDimension`** (`useMemo` + lodash `throttle`, L156-L166): computes `getCommonBounds(elements)` and sets `sceneDimension` to the rounded box width/height (`round(box[2]) - round(box[0])`, etc.). Throttled at `STATS_TIMEOUT` to avoid recompute thrash on large scenes.
  - **Effects**: recompute scene dimension when `[sceneNonce, elements, throttledSetSceneDimension]` change (L168-L170); cancel the throttle on unmount (L172-L175).
  - **`atomicUnits`** = `useMemo(() => getAtomicUnits(selectedElements, appState), ...)` (L177-L179) — used to treat groups/frames as single draggable units in the multi-element editors.
  - **`_frameAndChildrenSelectedTogether`** = memoized `frameAndChildrenSelectedTogether(selectedElements)` (L181-L183) — when true, the element-properties panel is suppressed.
  - **Render** (L185-L431): an `.exc-stats` div wrapping an `<Island padding={3}>` with a title + close button (`CloseIcon` → `onClose`). A `Collapsible` "General stats" panel (open state bit-tested via `appState.stats.panels & STATS_PANELS.generalStats`; toggled by XORing the bit, L197-L207) showing shape count, scene width/height, and — only if `gridModeEnabled` — the `CanvasGrid` field. Then `renderCustomStats?.(elements, appState)`. If not frame+children and there is a selection, an "Element properties" `Collapsible` (bit `STATS_PANELS.elementProperties`): for `singleElement` it renders crop-dimension rows (when cropping), a type heading, and `Position` (x/y), `Dimension` (w/h), `Angle`, `FontSize`; for `multipleElements` it renders a group heading (if `elementsAreInSameGroup`), shape count, and `MultiPosition`, `MultiDimension`, `MultiAngle`, `MultiFontSize`.
  - **Memo comparator** (L433-L442): re-renders only when `sceneNonce`, `selectedElements` (referential), `appState.stats.panels`, `gridModeEnabled`, `appState.gridStep`, or `appState.croppingElementId` change — a hand-tuned bail-out to keep the panel cheap.

---

### packages/excalidraw/components/Stats/MultiAngle.tsx

Stats field for editing the `angle` of multiple selected, ungrouped elements at once; mirrors single-`Angle` but operates per-element on the non-grouped subset.

- **`MultiAngleProps` (interface)** — L22-L27: `elements`, `scene`, `appState`, `property: "angle"`.
- **`STEP_SIZE` (const = 15)** — L29. Shift-modifier coarse step in degrees.
- **`handleDegreeChange: DragInputCallbackType<"angle">`** — L31-L100. Builds two parallel lists: `editableLatestIndividualElements` (live elements that are `!isInGroup` and `isPropertyEditable(el, "angle")`) and `editableOriginalIndividualElements` (same filter on the originals).
  - **Typed value branch** (L49-L69): converts `nextValue` degrees → radians (`degreesToRadians`), sets every editable element's `angle`, and for each non-arrow element with a bound text element sets the bound text's angle to match. Then `scene.triggerUpdate()`.
  - **Drag branch** (L71-L99): for each element by index, takes the original angle in degrees (`round(radiansToDegrees(originalElement.angle) * 100) / 100`), adds `round(accumulatedChange)`, wraps with `% 360`, optionally snaps via `getStepSizedValue(..., 15)`, then normalizes negatives into `[0,360)` by adding 360. Converts back to radians and mutates both the element and its bound text (non-arrow only). Ends with `scene.triggerUpdate()`.
  - Geometry note: angles are stored in **radians** on elements but displayed/edited in **degrees**; conversions are explicit via `@excalidraw/math` `degreesToRadians`/`radiansToDegrees`. Wrapping keeps the displayed angle in `[0, 360)`. Grouped elements are intentionally excluded (group rotation is handled elsewhere).
- **`MultiAngle({ elements, scene, appState, property }: MultiAngleProps)` → JSX** — L102-L133. Filters to ungrouped, angle-editable elements; maps each to its wrapped degree value (`round((radiansToDegrees(el.angle) % 360) * 100) / 100`); the displayed `value` is the single angle if all equal (`new Set(angles).size === 1`) else the string `"Mixed"`. `editable` is true if any qualifying element is angle-editable. Renders `DragInput` labelled "A" with `angleIcon`.

---

#### Cross-cutting parity notes
- Every Stats field is a thin wrapper around `DragInput`; to reimplement, the **scrub gesture** (px → quantized unit via `sensitivity`, Shift → `getStepSizedValue` snapping, deep-copied originals at gesture start, one history commit per gesture) and the **idempotent typed commit** (`SMALLEST_DELTA = 0.01` guard, NaN reset, commit on Enter/blur/unmount) are the load-bearing behaviors.
- All dimensions/positions are **scene/world units**; angles are **radians stored / degrees displayed**.
- History capture is always `CaptureUpdateAction.IMMEDIATELY` via `app.syncActionResult(...)`.
