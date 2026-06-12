## Cluster: excalidraw__components__20

This cluster covers the multi-selection Stats editors (W/H, font size, X/Y), the single-element Position editor, shared Stats geometry/grouping utilities, the SVG overlay layer for animated trails, and the toggle Switch. The Stats files implement the numeric drag-input panels in the right-hand stats sidebar; their math (rotation about element center, aspect-ratio-locked group resize, crop adjustment) is the parity-critical part.

---

### packages/excalidraw/components/Stats/MultiDimension.tsx

Numeric drag-input editor for the width/height of a multi-selection, treating selected groups as single aspect-ratio-locked units and individual elements independently.

- **`MultiDimensionProps` (interface, L40-L47)** — props: `property: "width" | "height"`, `elements: readonly ExcalidrawElement[]`, `elementsMap: NonDeletedSceneElementsMap`, `atomicUnits: AtomicUnit[]`, `scene: Scene`, `appState: AppState`.
- **`STEP_SIZE` (const = 10, L49)** — step granularity when Shift-dragging / step-mode is active.
- **`getResizedUpdates(anchorX, anchorY, scale, origElement) => {width,height,x,y, ...rescalePointsInElement(...), ...(fontSize?)}` (L51-L74)** — Computes a uniformly scaled element relative to a fixed anchor point. Offsets `(origElement.x - anchorX, origElement.y - anchorY)` are multiplied by `scale`; width/height scaled by `scale`; rescales internal points; for text elements also scales `fontSize`. Pure (no mutation). Coordinate detail: anchor is a world-space point (group's `(x1,y1)` top-left); element's offset from anchor scales linearly so the whole group scales about that anchor.
- **`resizeElementInGroup(anchorX, anchorY, property, scale, latestElement, origElement, originalElementsMap, scene) => void` (L76-L111)** — Mutates `latestElement` with `getResizedUpdates`, then if the original has a bound text element, scales the bound text's `fontSize` by `scale`, calls `updateBoundElements`, re-fetches the latest bound text from the (mutated) map, mutates its font size, and calls `handleBindTextResize` with handle `"e"` (width) or `"s"` (height). Side effects: scene mutations. Invariant: anchor stays fixed for every element in the group.
- **`resizeGroup(nextWidth, nextHeight, initialHeight, aspectRatio, anchor: GlobalPoint, property, latestElements, originalElements, originalElementsMap, scene) => void` (L113-L149)** — Enforces aspect ratio: if editing width, recomputes `nextHeight = round((nextWidth/aspectRatio)*100)/100`; else recomputes `nextWidth = round(nextHeight*aspectRatio*100)/100`. Derives `scale = nextHeight / initialHeight` and applies `resizeElementInGroup` to each (latest, original) pair using `anchor[0]/anchor[1]`. Notable math: rounding to 2 decimals on the derived dimension; single scalar scale drives all group members so the group stays self-consistent.
- **`handleDimensionChange: DragInputCallbackType<"width"|"height">` (L151-L393)** — The drag callback. Recomputes atomic units from `originalElements`+`originalAppState`. Two branches:
  - **Absolute (`nextValue !== undefined`, L167-L275):** for each atomic unit, if `>1` element it computes common bounds of *originals*, `aspectRatio = initialWidth/initialHeight`, clamps the edited dim to `>=0` then `>= MIN_WIDTH_OR_HEIGHT`, and calls `resizeGroup` anchored at `(x1,y1)`. For a single editable element it computes next width/height (step-rounded via `getStepSizedValue` or plain round), clamps to `MIN_WIDTH_OR_HEIGHT`, and calls `resizeSingleElement` with handle `"e"`/`"s"` and `shouldInformMutation:false`. For frame-like elements it recomputes frame membership (`getElementsInResizingFrame`) and `replaceAllElementsInFrame`. Returns after `scene.triggerUpdate()`.
  - **Relative (drag delta, L277-L392):** `changeInWidth/Height = property===... ? accumulatedChange : 0`. Same group vs single logic but adds the delta to initial/original dimensions; for frames it accumulates `elementsToHighlight` (highlight candidates) instead of committing membership, then `setAppState({elementsToHighlight})` and `scene.triggerUpdate()`.
  - Side effects: scene mutations, app-state highlight set. Invariant: groups keep aspect ratio; singles do not.
- **`handleDragFinished: DragFinishedCallbackType` (L395-L426)** — On drag end, if the first original element is now a frame-like element, recomputes frame membership and commits it via `replaceAllElementsInFrame`, then clears `elementsToHighlight: null`. Side effect: finalizes frame membership and clears highlight state.
- **`MultiDimension` (React component, L428-L478)** — Renders a `DragInput` labeled "W"/"H". `useMemo` (`sizes`, L436-L458) computes each atomic unit's dimension: groups use `getCommonBounds(latest)` (`x2-x1` or `y2-y1`), singles use `latest.width/height`, both rounded to 2 decimals; deps `[elementsMap, atomicUnits, property]`. `value` (L460-L461) is the single rounded size if all equal else `"Mixed"`. `editable = sizes.length > 0`. Wires `dragInputCallback`/`dragFinishedCallback`. No local state/refs beyond the memo.

---

### packages/excalidraw/components/Stats/MultiFontSize.tsx

Numeric drag-input editor for the font size of all standalone text elements (and bound text of selected containers) in a multi-selection.

- **`MultiFontSizeProps` (interface, L25-L31)** — props: `elements`, `scene`, `elementsMap: NonDeletedSceneElementsMap`, `appState`, `property: "fontSize"`.
- **`MIN_FONT_SIZE` (const = 4, L33)** and **`STEP_SIZE` (const = 4, L34)** — minimum font and step granularity.
- **`getApplicableTextElements(elements, elementsMap) => ExcalidrawTextElement[]` (L36-L61)** — Reduces a list to editable text elements: skips falsy or in-group elements (`isInGroup`); pushes the element itself if it is a text element; otherwise if it has a bound text element, resolves and pushes that. Pure; produces the set whose font is editable as a unit. Invariant: in-group elements are excluded (groups are handled elsewhere).
- **`handleFontSizeChange: DragInputCallbackType<"fontSize", ExcalidrawTextElement>` (L63-L125)** — Resolves latest text elements by id from the scene map. Two branches:
  - **Absolute (`nextValue` truthy, L80-L95):** `nextFontSize = max(round(nextValue), MIN_FONT_SIZE)`; mutates each text element's `fontSize` and calls `redrawTextBoundingBox` (with its container, from `scene.getContainerElement`); then `scene.triggerUpdate()`.
  - **Relative (L96-L124):** for each (latest, original) pair adds `round(accumulatedChange)` to `round(originalFontSize)`, clamps to `MIN_FONT_SIZE`, optionally step-snaps via `getStepSizedValue`, mutates and redraws; then `triggerUpdate`.
  - Side effects: scene mutations + bounding-box recompute. Note: uses `nextValue` truthiness (not `!== undefined`), so `0` is treated as relative — a subtle difference vs MultiDimension/Position.
- **`MultiFontSize` (React component, L127-L159)** — Computes `latestTextElements` via `getApplicableTextElements`; returns `null` (renders nothing) if none. `fontSizes` rounded to 1 decimal (`*10/10`); `value` is the shared font if all equal else `"Mixed"`; `editable = fontSizes.length > 0`. Renders `StatsDragInput` labeled "F" with `fontSizeIcon`. No local state/refs/effects.

---

### packages/excalidraw/components/Stats/MultiPosition.tsx

Numeric drag-input editor for the X/Y top-left position of a multi-selection, treating groups as one unit and respecting per-element rotation.

- **`MultiPositionProps` (interface, L25-L32)** — props: `property: "x" | "y"`, `elements`, `elementsMap: ElementsMap`, `atomicUnits`, `scene`, `appState`.
- **`moveElements(property, changeInTopX, changeInTopY, originalElements, originalElementsMap, scene, appState) => void` (L34-L72)** — Relative move of each element. For each original it computes the rotated top-left via `pointRotateRads(pointFrom(x,y), pointFrom(cx,cy), angle)` (center = element midpoint), adds the delta on the edited axis, rounds, then delegates to `moveElement`. Coordinate detail: position shown/edited is the *rotated* top-left corner, not raw `x/y`; `moveElement` inverts the rotation to recover raw `x/y`.
- **`moveGroupTo(nextX, nextY, originalElements, originalElementsMap, scene, appState) => void` (L74-L119)** — Absolute move of a group: computes `getCommonBounds(originalElements)` top-left `(x1,y1)`, derives `offsetX/Y = next - x1/y1`, then for each latest element (skipping bound texts that have a `containerId`, which move with their container) computes its rotated top-left and calls `moveElement` shifted by the offset. Invariant: whole group translates rigidly by the same offset; bound texts ride their containers.
- **`handlePositionChange: DragInputCallbackType<"x"|"y">` (L121-L217)** — Two branches:
  - **Absolute (`nextValue !== undefined`, L136-L197):** for each atomic unit, groups (>1) compute common-bounds top-left and call `moveGroupTo` (edited axis = `nextValue`, other axis kept). Singles (editable) compute rotated top-left and call `moveElement` with the edited axis set to `nextValue`. Returns after `triggerUpdate`.
  - **Relative (L199-L216):** `change` step-snapped via `getStepSizedValue(accumulatedChange, STEP_SIZE)` if step-mode; sets `changeInTopX/Y` and calls `moveElements`; then `triggerUpdate`.
- **`MultiPosition` (React component, L219-L267)** — `useMemo` (`positions`, L227-L252) per atomic unit: groups use `getCommonBounds` `x1`/`y1`; singles compute the rotated top-left (`pointRotateRads` about element center) and take x or y; both rounded to 2 decimals; deps `[atomicUnits, elementsMap, property]`. `value` = shared position or `"Mixed"`. Renders `StatsDragInput` labeled "X"/"Y". No refs/effects.

---

### packages/excalidraw/components/Stats/Position.tsx

Numeric drag-input editor for a single element's X/Y top-left, with special handling for image crop editing.

- **`PositionProps` (interface, L19-L25)** — props: `property: "x" | "y"`, `element`, `elementsMap`, `scene`, `appState`.
- **`handlePositionChange: DragInputCallbackType<"x"|"y">` (L27-L170)** — Computes the original element's rotated top-left (`pointRotateRads` about its center). Two top-level modes:
  - **Crop mode (`croppingElementId === origElement.id`, L51-L125):** only for image elements with a `crop`. Detects per-axis flip from `element.scale`. Uses `getUncroppedWidthAndHeight`. Absolute (`nextValue !== undefined`): converts the displayed value into natural-pixel space via `nextValue * (naturalWidth/uncroppedWidth)` (and the height analogue), clamping `crop.x` into `[0, naturalWidth-crop.width]`; for an X-flipped image it mirrors as `naturalWidth - nextValueInNatural - crop.width`. Relative: adds `instantChange` (sign-flipped on flipped axes) to `crop.x/y`, clamped to natural bounds. Mutates only the `crop` field; returns early (no positional move).
  - **Normal mode (L127-L169):** Absolute sets the edited axis to `nextValue` and calls `moveElement`. Relative computes the new rotated top-left, optionally step-snapping `origElement.x/y + change` via `getStepSizedValue`, rounding, then `moveElement`.
  - Notable math: crop coordinate-space conversion between displayed (uncropped) pixels and natural image pixels; flip-aware mirroring. Side effects: scene mutation.
- **`Position` (React component, L172-L214)** — Computes the element's rotated top-left for display (`pointRotateRads` about center), `value = round(x or y, 2)`. If the element is the cropping image with a crop, overrides `value` with `getFlipAdjustedCropPosition(element)` (flip-corrected crop x/y), rounded to 2. Renders `StatsDragInput` labeled "X"/"Y" with `elements=[element]`. No local state/refs/effects beyond the computed value.

---

### packages/excalidraw/components/Stats/utils.ts

Shared Stats helpers: property-editability gates, step-snapping, atomic-unit grouping, the rotation-preserving origin formula, and the canonical single-element `moveElement`.

- **`StatsInputProperty` (type, L33-L40)** — union: `"x"|"y"|"width"|"height"|"angle"|"fontSize"|"gridStep"`.
- **`SMALLEST_DELTA` (const = 0.01, L42)** and **`STEP_SIZE` (const = 10, L43)** — minimum delta and default step size.
- **`isPropertyEditable(element, property) => boolean` (L45-L53)** — Returns `false` for `angle` on frame-like elements (frames can't be rotated), else `true`.
- **`getStepSizedValue(value, stepSize) => number` (L55-L58)** — Rounds `value` to the nearest multiple of `stepSize` via `v = value + stepSize/2; return v - (v % stepSize)`. Pure; this is the snap-to-grid used across all Stats editors.
- **`AtomicUnit` (type = `Record<string, true>`, L60)** — a set of element ids treated as one editing unit (a group or a single element).
- **`getElementsInAtomicUnit(atomicUnit, elementsMap, originalElementsMap?) => {original, latest}[]` (L61-L75)** — Maps each id to `{original: (originalElementsMap ?? elementsMap).get(id), latest: elementsMap.get(id)}`, filtering out entries missing either. Lets callers compare pre-drag vs current state per element.
- **`newOrigin(x1, y1, w1, h1, w2, h2, angle) => {x, y}` (L77-L111)** — Geometry-critical. Computes the new top-left `(x2,y2)` such that after a dimension change `(w1,h1)->(w2,h2)` the element's rotated top-left corner stays fixed on canvas. Closed-form solution of `rotate(x1,y1,cx1,cy1,angle)=rotate(x2,y2,cx2,cy2,angle)`: `x = x1 + (w1-w2)/2 + ((w2-w1)/2)cos(angle) + ((h1-h2)/2)sin(angle)`; `y = y1 + (h1-h2)/2 + ((w2-w1)/2)sin(angle) + ((h2-h1)/2)cos(angle)`. Pure. Parity-critical for rotated resize.
- **`moveElement(newTopLeftX, newTopLeftY, originalElement, scene, appState, originalElementsMap, shouldInformMutation = true) => void` (L113-L232)** — Canonical single-element move used by Position/MultiPosition. Behavior: (1) if the element is a binding (arrow) element with start/end bindings and the move exceeds `DRAGGING_THRESHOLD` on either axis, it unbinds both ends (small moves below threshold are a no-op early-return, L126-L131). (2) Computes the original rotated top-left, derives `changeInX/Y = newTopLeft - topLeft`, then inverts the rotation about the *shifted* center to recover the new raw `(x,y)` via `pointRotateRads(newTopLeft, shiftedCenter, -angle)`. (3) Mutates `x,y` (with `informMutation`, `isDragging:false`), calls `updateBindings`. (4) Moves any bound text element by the same `changeInX/Y`. (5) For frame-like elements, translates every frame child by the same delta (recomputing each child's rotated top-left, rounding, inverting rotation) and updates each child's bindings with `simultaneouslyUpdated: originalChildren`. Coordinate detail: all moves are expressed via rotated top-left then inverse-rotated back to storage coordinates, so rotation is preserved exactly.
- **`getAtomicUnits(targetElements, appState) => AtomicUnit[]` (L234-L253)** — Builds the unit list: one unit per selected group id (`getSelectedGroupIds` -> `getElementsInGroup` -> id set), plus one singleton unit per non-grouped element (`!isInGroup`). Drives how multi-editors batch elements.

---

### packages/excalidraw/components/SVGLayer.tsx

Thin React wrapper hosting an `<svg>` element into which animated `Trail` instances (laser pointer / collaborator trails) draw.

- **`SVGLayerProps` (type, L7-L9)** — `{ trails: Trail[] }`.
- **`SVGLayer` (React component, L11-L34)** — Owns `svgRef: useRef<SVGSVGElement|null>`. A `useEffect` (L14-L27) starts every trail on the mounted SVG node (`trail.start(svgRef.current)`) and stops them on cleanup (`trail.stop()`). Performance/dependency note: the effect's dependency array is the `trails` array spread (`}, trails)`) rather than `[trails]`, with an eslint-disable on exhaustive-deps — so the effect re-runs when the *number/identity of trail entries* changes, not when the array reference changes. Renders `<div className="SVGLayer"><svg ref={svgRef} /></div>`. No props validation beyond the type.

---

### packages/excalidraw/components/Switch.tsx

A controlled checkbox styled as a toggle switch.

- **`SwitchProps` (type, L5-L11)** — `name: string`, `checked: boolean`, `title?: string`, `onChange: (value: boolean) => void`, `disabled?: boolean`.
- **`Switch` (React component, L13-L38)** — Stateless/controlled. Wrapper `div` gets classes `Switch` plus conditional `toggled` (when `checked`) and `disabled` via `clsx`. Renders an `<input type="checkbox">` with `name`/`id`/`title`/`checked`/`disabled`; `onChange` and the Space-key `onKeyDown` both invoke `onChange(!checked)` (toggling the controlled value). `disabled` defaults to `false`. No local state/refs/effects — parent owns the value.
