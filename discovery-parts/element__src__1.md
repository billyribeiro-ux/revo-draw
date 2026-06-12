## Cluster: element__src__1

This cluster covers seven files from `packages/element/src/`: element-type capability predicates (`comparisons.ts`), a small module-level cache of original text-container heights (`containerCache.ts`), point-to-element euclidean distance math (`distance.ts`), multi-element distribution layout (`distribute.ts`), image crop geometry (`cropElement.ts`), drag-translation logic for selected and new elements (`dragElements.ts`), and the change-tracking / undo-redo / collaboration delta engine (`delta.ts`).

---

### packages/element/src/comparisons.ts

Type-capability predicate functions: given an `ElementOrToolType`, answer whether that element/tool category supports a particular style property. Pure, side-effect-free boolean predicates driven by string-literal comparison; these gate which property controls appear in the UI for a given tool.

- `hasBackground = (type: ElementOrToolType) => boolean` — L3-L10. Returns true for `rectangle`, `iframe`, `embeddable`, `ellipse`, `diamond`, `line`, `freedraw`. Notable: `text`, `image`, `arrow` are excluded (no fill).
- `hasStrokeColor = (type: ElementOrToolType) => boolean` — L12-L20. True for `rectangle`, `ellipse`, `diamond`, `freedraw`, `arrow`, `line`, `text`, `embeddable`. Notably includes `text` and `arrow` (which lack background).
- `hasStrokeWidth = (type: ElementOrToolType) => boolean` — L22-L30. True for `rectangle`, `iframe`, `embeddable`, `ellipse`, `diamond`, `freedraw`, `arrow`, `line`. Excludes `text`.
- `hasStrokeStyle = (type: ElementOrToolType) => boolean` — L32-L39. True for `rectangle`, `iframe`, `embeddable`, `ellipse`, `diamond`, `arrow`, `line`. Notably excludes `freedraw` (which has width but not style) and `text`.
- `canChangeRoundness = (type: ElementOrToolType) => boolean` — L41-L47. True for `rectangle`, `iframe`, `embeddable`, `line`, `diamond`, `image`. Notably `ellipse` is excluded (already round) and `image` is included.
- `toolIsArrow = (type: ElementOrToolType) => boolean` — L49. `type === "arrow"`.
- `canHaveArrowheads = (type: ElementOrToolType) => boolean` — L51. `type === "arrow"`.

Parity note: these inclusion sets are subtly asymmetric (e.g. `freedraw` has width but no style; `text` has stroke color but no width). A reimplementation must preserve these exact membership sets rather than infer them.

---

### packages/element/src/containerCache.ts

A module-level singleton cache holding the *original* (pre-edit) height of text containers, keyed by element id; used so that a container can be restored to its natural height when bound text is removed/shrunk.

- `originalContainerCache: { [id]: { height } | undefined }` — L3-L9. Module-global mutable object (singleton state, survives across calls; **invariant: this is process-global, not per-scene** — important for a reimplementation that may need per-document scoping).
- `updateOriginalContainerCache = (id, height) => { height }` — L11-L19. Gets-or-creates the entry for `id`, then overwrites `data.height = height` and returns the entry. Side effect: mutates the global cache. Note both the `||=`-style create AND the unconditional reassignment, so the passed `height` always wins.
- `resetOriginalContainerCache = (id) => void` — L21-L27. Deletes the entry for `id` if present. Side effect: mutates global cache.
- `getOriginalContainerHeightFromCache = (id) => number | null` — L29-L33. Returns cached height or `null` (via `?? null`).

---

### packages/element/src/distance.ts

Computes the euclidean distance from a global point to the *outline* of any element type, accounting for roundness and rotation. Used for hit-testing / proximity. Rotation is handled by inverse-rotating the query point about the element center rather than rotating the element geometry.

- `distanceToElement(element: ExcalidrawElement, elementsMap: ElementsMap, p: GlobalPoint): number` — L29-L53. Dispatch table over `element.type`: `selection`/`rectangle`/`image`/`text`/`iframe`/`embeddable`/`frame`/`magicframe` → rectanguloid; `diamond` → diamond; `ellipse` → ellipse; `line`/`arrow`/`freedraw` → linear/freedraw. Exhaustive switch with no default (relies on union exhaustiveness).
- `distanceToRectanguloidElement(element, elementsMap, p)` (internal) — L63-L82. Computes `center` via `elementCenterPoint`, inverse-rotates `p` by `-element.angle` about center, calls `deconstructRectanguloidElement(element)` to get `[sides, corners]`, then returns `Math.min` of `distanceToLineSegment` over sides and `curvePointDistance` over corners (corner curves model rounded corners; `null` curve distances are filtered out). Math note: rounded-rectangle outline = straight sides + corner arcs.
- `distanceToDiamondElement(element, elementsMap, p): number` (internal) — L92-L111. Same inverse-rotation strategy; `deconstructDiamondElement` yields `[sides, curves]`; `Math.min` over segment distances and curve-point distances (null-filtered).
- `distanceToEllipseElement(element, elementsMap, p): number` (internal) — L121-L132. Inverse-rotates the point, then delegates to `ellipseDistanceFromPoint(rotatedPoint, ellipse(center, width/2, height/2))`. Note ellipse is built from center + semi-axes.
- `distanceToLinearOrFreeDraElement(element, elementsMap, p)` (internal, note the typo'd name "FreeDra") — L134-L147. No rotation pre-step (deconstruction already returns world-space `[lines, curves]`); `Math.min` over `distanceToLineSegment` and `curvePointDistance`. Note: unlike the rectanguloid/diamond cases, curve distances are NOT null-filtered here.

Parity note: the universal trick is "rotate the point by `-angle` about the element center instead of rotating the shape." Rounded shapes decompose into line segments plus bezier corner curves.

---

### packages/element/src/distribute.ts

Distributes a set of selected elements evenly along the X or Y axis (the "distribute horizontally/vertically with equal spacing" action), respecting group membership so grouped elements move together.

- `interface Distribution { space: "between"; axis: "x" | "y" }` — L12-L15. Currently only "between" spacing is modeled.
- `distributeElements(selectedElements, elementsMap, distribution, appState, scene): ExcalidrawElement[]` — L17-L111. Algorithm:
  1. L24-L27: picks tuple of accessor keys based on axis — `["minX","midX","maxX","width"]` for x, else the Y variants.
  2. L29: `bounds = getCommonBoundingBox(selectedElements)` (the overall extent).
  3. L30-L36: groups elements via `getSelectedElementsByGroup`, maps each group to `[group, getCommonBoundingBox(group)]`, and **sorts by mid-point** (`mid`) ascending.
  4. L38-L43: `span` = sum of each group's extent; `step = (bounds[extent] - span) / (groups.length - 1)` = the gap to insert between groups.
  5. **Negative-step branch (L45-L83):** when groups overlap (`step < 0`), it distributes by *centers* instead of gaps. Finds the indices of the boxes touching the overall start (`index0`) and end (`index1`), computes `step` between their centers, pins those two boxes, and walks `pos` for the interior boxes, translating each group along `distribution.axis` by `pos - box[mid]`.
  6. **Positive-step branch (L85-L110):** distributes from gaps. Walks `pos` from `bounds[start]`, translating each group so its `start` lands at `pos`, then advances `pos += step; pos += box[extent]`.
  - Side effects per element: `scene.mutateElement(element, { x: element.x + tx, y: element.y + ty })` and `updateBoundElements(element, scene, { simultaneouslyUpdated: group })`. Returns flat list of updated elements via `flatMap`.

Parity note: only one axis is translated at a time (the other translation component stays 0). The two-branch design (gap vs center distribution) is the non-obvious part — overlapping selections cannot be gap-distributed so it falls back to fixing endpoints and spreading centers.

---

### packages/element/src/cropElement.ts

All geometry for cropping an image element: resizing the crop window via transform handles (with aspect-ratio and flip support), and reconstructing the uncropped image element/dimensions. Works in image natural-pixel space mapped to on-canvas "uncropped" dimensions.

- `MINIMAL_CROP_SIZE = 10` — L32. Floor for crop width/height in canvas units.
- `cropElement(element, elementsMap, transformHandle, naturalWidth, naturalHeight, pointerX, pointerY, widthAspectRatio?)` — L34-L406. The main crop-drag handler. Returns `{ x, y, width, height, crop }`.
  - L44-L51: computes `uncroppedWidth/Height` from `getUncroppedWidthAndHeight`, the natural→uncropped scale factors, and `croppedLeft/croppedTop` (current crop offset expressed in uncropped/canvas units).
  - L64-L71: inverse-rotates the pointer by `-element.angle` about element center, so all subsequent math is in unrotated space.
  - L76-L83: initializes `crop` to existing crop or a full-image crop `{x:0,y:0,width:naturalWidth,height:naturalHeight,naturalWidth,naturalHeight}`.
  - L88-L89: `isFlippedByX/Y` from `element.scale[0]/[1] === -1`.
  - L94-L127: per-edge clamping. For each of `n/s/e/w` contained in the handle, computes the new width/height clamped between `MINIMAL_CROP_SIZE` and a flip-dependent max (you can't crop beyond the original image bounds; flip swaps which side the slack is on).
  - `updateCropWidthAndHeight(crop)` (L129-L132): maps `nextHeight/Width` back into natural pixels via the scale factors.
  - `adjustFlipForHandle(handle, crop)` (L136-L161): re-derives crop w/h, then shifts `crop.x`/`crop.y` by the delta of crop dimension change — direction depends on the handle edge and flip state (this is the "which corner stays anchored" bookkeeping in crop space).
  - L163-L378: the big `switch (transformHandle)`. Edge handles (`n/s/e/w`) when `widthAspectRatio` is set compute a `MAX_WIDTH`/`MAX_HEIGHT` from distance-to-left/right (or top/bottom) times 2 and lock the other dimension to the ratio, then center-shift the crop on the perpendicular axis. Corner handles (`ne/nw/se/sw`) decide which dimension is dominant by comparing `changeInWidth` vs `changeInHeight` signs, clamp to a flip-aware max, and lock the other to the aspect ratio. Every case calls `adjustFlipForHandle`.
  - L383-L389: `recomputeOrigin(...)` to get the new top-left origin.
  - L392-L397: **resets `crop` to `null`** when the new crop width/height are `isCloseTo` the natural dimensions (back to full image). Invariant: a full-coverage crop is represented as `null`.
- `recomputeOrigin(stateAtCropStart, transformHandle, width, height, shouldMaintainAspectRatio?)` (internal) — L408-L476. Computes the element's new `(x,y)` so the correct corner stays fixed during a crop-resize. Uses `getResizedElementAbsoluteCoords` at both old and new sizes, picks `newTopLeft` from which corner is anchored (`n/w/nw` anchor bottom-right; `ne` anchors bottom-left; `sw` anchors top-right). For aspect-ratio edge drags it re-centers on the perpendicular axis. Then performs a double rotation: rotate `newTopLeft` and `newCenter` into the original angle, then rotate top-left back by `-angle` about the rotated new center — this keeps the visual rotation pivot stable. Finally offsets by `stateAtCropStart.x - newBoundsX1` to convert from bounds space to element-origin space. Note: `startCenter` typed `any` (L423) and `Point` cast at L460.
- `getUncroppedImageElement(element, elementsMap)` — L479-L548. Reconstructs the full (uncropped) image element from a cropped one. Builds edge-direction unit vectors (`topEdgeNormalized`, `leftEdgeNormalized`) from rotated absolute corners, applies `adjustCropPosition` for flips, then walks back along the negative crop offset (scaled by `width/naturalWidth`) to find the uncropped rotated top-left, computes the uncropped center, and inverse-rotates to get the unrotated `(x,y)`. Returns a new element with `crop: null`, full `width/height`. Returns the element unchanged if no crop. Math note: this is vector-space (not matrix) — uses `vectorAdd/Scale/Normalize/Subtract` and `pointFromVector`.
- `getUncroppedWidthAndHeight(element)` — L550-L567. If cropped, `uncroppedWidth = element.width / (crop.width / crop.naturalWidth)` (and symmetric for height) — i.e. scale the displayed size up by the inverse of the crop fraction. Otherwise returns element's own w/h.
- `adjustCropPosition(crop, scale)` (internal) — L569-L591. For flipped axes, mirrors the crop origin: `cropX = naturalWidth - |cropX| - crop.width` (and Y analog). Returns `{ cropX, cropY }`.
- `getFlipAdjustedCropPosition(element, natural = false)` — L593-L629. Returns the crop origin adjusted for flips, either in natural pixels (`natural=true`) or scaled into uncropped/canvas units (dividing by `naturalWidth/width`). Returns `null` if no crop. Note slightly different flip formula than `adjustCropPosition` (`naturalWidth - crop.width - crop.x`, no `Math.abs`).

Parity note: two coordinate spaces are juggled — image *natural pixels* (`crop.x/y/width/height/naturalWidth/naturalHeight`) and *canvas* dimensions (`element.width/height`, "uncropped" sizes). The scale factors `naturalWidthToUncropped`/`naturalHeightToUncropped` bridge them. Flips (`scale === -1`) invert anchoring everywhere.

---

### packages/element/src/dragElements.ts

Handles translating elements while dragging: existing selections (with grid snap, group/frame inclusion, bound-element updates, and arrow-unbinding rules) and live-creating a new element by drag (with aspect ratio, resize-from-center, text auto-wrap, image initial dimensions).

- `dragSelectedElements(pointerDownState, _selectedElements, offset, scene, snapOffset, gridSize)` — L35-L171. Moves the current selection.
  - L46-L52: early-return guard — a single *bound* elbow arrow is not dragged directly (it follows its bindings).
  - L54-L67: filters out elbow arrows whose both bound endpoints aren't also in the selection (avoids dragging an elbow arrow whose anchors aren't moving).
  - L69-L85: builds `elementsToUpdate` as a `Set` (dedupe), and if any selected element is a frame-like, **adds all elements whose `frameId` is in the selected frames** so frame contents move with the frame. Comment notes the Set guards against double-updating frame children.
  - L87-L97: collects `origElements` from `pointerDownState.originalElements`; **bails entirely (`return`) if any original is missing** (e.g. duplicate-during-drag) to avoid undefined behavior.
  - L99-L104: `adjustedOffset = calculateOffset(getCommonBounds(origElements), offset, snapOffset, gridSize)`.
  - L110-L170: for each element, computes whether its start/end bound elements are themselves selected; for non-arrows it moves the element + its bound text via `updateElementCoords`, then `updateBoundElements(... simultaneouslyUpdated)`. For arrows it only moves when (selection > 1, OR drag exceeds `DRAGGING_THRESHOLD`, OR arrow has no bindings) — and **unbinds** start/end when that endpoint's bindable is not part of the selection (prevents arrows snapping weirdly when dragged off a shape). The `isArrow` variable at L111 is `!isArrowElement(element)` (inverted naming — actually "is NOT arrow").
- `calculateOffset(commonBounds, dragOffset, snapOffset, gridSize): {x,y}` (internal) — L173-L202. Adds drag + snap offset to the common-bounds top-left; if either snap axis is 0 it applies grid snapping (`getGridPoint`) on that axis only. Returns the delta relative to the original common-bounds origin. Invariant: snap offset takes precedence over grid; grid only applies on axes with no active snap.
- `updateElementCoords(pointerDownState, element, scene, dragOffset)` (internal) — L204-L220. Reads the element's *original* position from `pointerDownState.originalElements` (falls back to current element), adds `dragOffset`, and `scene.mutateElement` to the new `x/y`. Invariant: drag is always computed relative to the at-pointer-down position, not cumulative — avoids drift.
- `getDragOffsetXY(selectedElements, x, y): [number, number]` — L222-L229. Returns `[x - x1, y - y1]` where `(x1,y1)` is the common-bounds top-left — the pointer offset from selection origin.
- `dragNewElement({ ... }): void` — L231-L353. Creates/sizes a new element during the initial draw-drag. Destructured options object (L247-L268) including `newElement`, `elementType`, origin/current coords, `width/height`, `shouldMaintainAspectRatio`, `shouldResizeFromCenter`, `zoom`, `scene`, optional `widthAspectRatio`, `originOffset`, `informMutation`.
  - L269-L294: aspect-ratio logic. If `widthAspectRatio` provided, `height = width / widthAspectRatio`. Else uses `getPerfectElementSize` picking the dominant axis (whichever of |y-originY| vs |x-originX| is larger) so the cursor "sticks" to one side of the bounding box; signs propagate via `x<originX ? -width : width`. Negative heights are absoluted.
  - L296-L304: positions `newX/newY` (drag up/left flips origin); `shouldResizeFromCenter` doubles width/height and centers on origin.
  - L306-L329: text-element special case — height fixed to `newElement.height`, width clamped to a minimum via `getMinTextElementWidth`, and `autoResize:false` set once the horizontal drag exceeds `TEXT_AUTOWRAP_THRESHOLD / zoom` (zoom-aware threshold).
  - L331-L352: only mutates when `width !== 0 && height !== 0`; for images records `initialWidth/initialHeight`; applies `originOffset`; calls `scene.mutateElement(newElement, {...}, { informMutation, isDragging: false })`.

Parity note: drag offsets are always anchored to original positions (pointer-down snapshot) to prevent floating-point drift. `DRAGGING_THRESHOLD` gates arrow unbinding so a click-select on a bound arrow doesn't accidentally unbind it. Grid snap only applies on axes without an active alignment snap.

---

### packages/element/src/delta.ts

The change-tracking engine: a generic `Delta<T>` (forward/backward partial diffs), plus `AppStateDelta` and `ElementsDelta` that wrap deltas for app-state and element-map changes respectively. These power undo/redo (via `inverse`), history squashing (via `squash`), and applying changes (`applyTo`) including collaboration conflict resolution, z-index reordering, binding re-resolution, and text/arrow redraw. This is the heart of the store/history system.

#### `class Delta<T>` — L75-L495

A pure data holder of two partials: `deleted` (old values) and `inserted` (new values).

- `private constructor(deleted: Partial<T>, inserted: Partial<T>)` — L76-L79.
- `static create<T>(deleted, inserted, modifier?, modifierOptions?)` — L81-L100. Optionally runs a `modifier(partial, "deleted"|"inserted")` over one or both partials (`modifierOptions` selects which) before constructing.
- `static calculate<T>(prevObject, nextObject, modifier?, postProcess?): Delta<T>` — L110-L141. Returns `Delta.empty()` if reference-equal. Else iterates `getDifferences(prev,next)` filling `deleted[key]=prev[key]`, `inserted[key]=next[key]`, optionally runs `postProcess` then `create`. Comment (L126-L130) notes O(n^3) cost but justifies it (only on store recordings, only on changed elements, shallow first-level compare).
- `static empty()` — L143-L145. `new Delta({}, {})`.
- `static isEmpty<T>(delta): boolean` — L147-L151. True when both partials have zero keys.
- `static merge<T>(delta1, delta2, delta3 = empty())` — L156-L165. Object-spread-merges the three deltas' deleted/inserted partials (later wins).
- `static mergeObjects<T>(prev, added, removed = {}): T` — L170-L182. Clones `prev`, deletes `removed` keys, spreads `added`. Used for id-set merging.
- `static mergeArrays<T>(prev, added, removed, predicate?)` — L187-L200. Converts arrays to keyed objects (via `arrayToObject` + `predicate`), merges with `mergeObjects`, returns `Object.values`. Used to merge `boundElements` lists by id.
- `static diffObjects<T,K,V>(deleted, inserted, property, setValue)` — L205-L256. Post-process helper: for a reference-typed `property`, computes left/right key differences between the deleted-object and inserted-object, rebuilds each side via `setValue`, and either re-sets the property to just the differing keys or deletes the property from both partials when no real diff exists. Handles non-object equal primitives by deleting from both (L252-L255).
- `static diffArrays<T,K,V>(deleted, inserted, property, groupBy)` — L261-L312. Array analog of `diffObjects`: groups arrays by `groupBy`, finds left/right key differences, filters each array to only the differing members, re-sets or deletes the property.
- `static isLeftDifferent / isRightDifferent / isInnerDifferent / isDifferent<T>(object1, object2, skipShallowCompare=false): boolean` — L317-L384. Each calls `distinctKeysIterator` with join `"left"/"right"/"inner"/"full"` and returns whether any distinct key exists (`.next().value` truthiness).
- `static getLeftDifferences / getRightDifferences / getInnerDifferences / getDifferences<T>(...)` — L389-L436. Same iterator but materialized to a **sorted** array of differing keys.
- `private static *distinctKeysIterator<T>(join, object1, object2, skipShallowCompare=false)` — L445-L494. Generator. Returns immediately if reference-equal. Selects key set by join type (left=keys of o1, right=keys of o2, inner=intersection, full=union; `assertNever` on unknown). For each key with `value1 !== value2`, **skips** the key if both values are non-null objects that are `isShallowEqual` (unless `skipShallowCompare`); otherwise yields the key. Performance/parity note: comparison is shallow at the first level only — deep object changes that are shallow-equal at top level are treated as equal.

#### `interface DeltaContainer<T>` — L500-L522

Contract for app-level delta collections: `inverse(): DeltaContainer<T>`, `applyTo(previous, ...options): [T, boolean]` (boolean = visible change), `squash(delta): this`, `isEmpty(): boolean`.

#### `class AppStateDelta implements DeltaContainer<AppState>` — L524-L1013

Wraps a `Delta<ObservedAppState>`.

- `private constructor(delta)` / `static create(delta)` — L525-L529.
- `static calculate<T extends ObservedAppState>(prevAppState, nextAppState): AppStateDelta` — L531-L544. Builds delta via `Delta.calculate` with `orderAppStateKeys` modifier (stable key order for hashing) and `postProcess`.
- `static restore(dto)` — L546-L549; `static empty()` — L551-L553.
- `inverse(): AppStateDelta` — L555-L558. Swaps inserted/deleted.
- `squash(delta): this` — L560-L630. Specially merges the reference-typed id maps (`selectedElementIds`, `selectedGroupIds`, `lockedMultiSelections`) via `mergeObjects` on both deleted and inserted sides, only re-adding them to the merged partials if non-empty, then `Delta.merge`s the rest. Mutates `this.delta`.
- `applyTo(appState, nextElements): [AppState, boolean]` — L632-L710. Pulls deleted/inserted id maps out, merges selection/group/locked maps via `mergeObjects(current, inserted, deleted)`, reconstructs `selectedLinearElement` as a fresh `LinearElementEditor` if the inserted element still exists in `nextElements`, spreads the directly-applicable partial, then calls `filterInvisibleChanges` to decide the visible-change boolean. Wrapped in try/catch that rethrows in test/dev, else returns `[appState, false]`.
- `isEmpty()` — L712-L714.
- `private filterInvisibleChanges(prevAppState, nextAppState, nextElements): boolean` — L721-L871. **Mutates** `nextAppState` to strip state referencing deleted elements, and returns whether a *visible* change remains. Splits observed app-state into standalone props (`stripElementsProps`) and element-related props (`stripStandaloneProps`); a standalone diff is always visible. For element-related changed keys it switches per key: `selectedElementIds` → `filterSelectedElements`; `selectedGroupIds` → `filterSelectedGroups` (computing `nonDeletedGroupIds` lazily once); `croppingElementId`/`editingGroupId`/`selectedLinearElement` → null out if the referenced element is deleted/missing, else flag visible; `lockedMultiSelections`/`activeLockedId` → shallow/identity compare flags visible (with TODOs noting these may be redundant). `assertNever` default.
- `private static filterSelectedElements(selectedElementIds, elements, visibleDifferenceFlag)` — L873-L900. Drops ids whose element is deleted/missing; sets flag visible if any surviving id maps to a live element (or if the set was empty to begin with).
- `private static filterSelectedGroups(selectedGroupIds, nonDeletedGroupIds, visibleDifferenceFlag)` — L902-L927. Analog for groups against `nonDeletedGroupIds`.
- `private static stripElementsProps(delta): Partial<ObservedStandaloneAppState>` — L929-L948. Destructures away `editingGroupId, selectedGroupIds, selectedElementIds, selectedLinearElement, croppingElementId, lockedMultiSelections, activeLockedId`, returning the rest (the standalone props). Type-cast comments warn not to remove casts.
- `private static stripStandaloneProps(delta): Partial<ObservedElementsAppState>` — L950-L961. Inverse: removes `name, viewBackgroundColor`, returns element-related props.
- `private static postProcess<T>(deleted, inserted): [Partial<T>, Partial<T>]` — L967-L1001. Runs `Delta.diffObjects` for `selectedElementIds` (setValue → `true`), `selectedGroupIds` (→ prev ?? false), `lockedMultiSelections` (→ prev ?? {}); try/catch with rethrow in test/dev, `finally` returns the (mutated) pair.
- `private static orderAppStateKeys(partial)` — L1003-L1012. Returns a new object with keys inserted in sorted order (deterministic for hashing).

#### Types — L1015-L1026

- `type ElementPartial<TElement = ExcalidrawElement>` — L1015-L1016. `Omit<Partial<Ordered<TElement>>, "id" | "updated" | "seed">` — the diff-able element shape (id/updated/seed excluded from deltas).
- `type ApplyToOptions = { excludedProperties?: Set<keyof ElementPartial> }` — L1018-L1020.
- `type ApplyToFlags = { containsVisibleDifference: boolean; containsZindexDifference: boolean; applyDirection: "forward"|"backward"|undefined }` — L1022-L1026.

#### `class ElementsDelta implements DeltaContainer<SceneElementsMap>` — L1032-L2066

Holds three records keyed by element id: `added`, `removed`, `updated`, each a `Delta<ElementPartial>`.

- `private constructor(added, removed, updated)` — L1033-L1037.
- `static create(added, removed, updated, options={shouldRedistribute:false})` — L1039-L1084. When `shouldRedistribute`, re-buckets every delta into added/removed/updated by testing `satisfiesAddition/Removal` (else updated). In test/dev runs `validate` on each bucket. Returns the new instance.
- `static restore(dto)` — L1086-L1089.
- `private static satisfiesAddition = ({deleted,inserted}) => deleted.isDeleted === true && !inserted.isDeleted` — L1091-L1096. (An "add" goes from deleted→not-deleted.)
- `private static satisfiesRemoval = ({deleted,inserted}) => !deleted.isDeleted && inserted.isDeleted === true` — L1098-L1102.
- `private static satisfiesUpdate = ({deleted,inserted}) => !!deleted.isDeleted === !!inserted.isDeleted` — L1104-L1107.
- `private static satisfiesCommmonInvariants = ({deleted,inserted})` — L1109-L1124. Both versions are non-negative integers and differ. (Note misspelled name "Commmon".)
- `private static satisfiesUniqueInvariants = (elementsDelta, id)` — L1126-L1133. Exactly one of added/removed/updated holds the id.
- `private static validate(elementsDelta, type, satifiesSpecialInvariants)` — L1135-L1153. Throws if any delta in the bucket breaks common/unique/special invariants (only run in test/dev).
- `static calculate<T extends OrderedExcalidrawElement>(prevElements, nextElements): ElementsDelta` — L1163-L1261. Core diff. Returns empty if reference-equal. (1) For prev elements missing in next: synthesize a deletion (`inserted={isDeleted:true, version+1, versionNonce}`), bucket as `removed` (or `updated` if already deleted). (2) For next elements missing in prev: synthesize an addition (`deleted={isDeleted:true, version-1, versionNonce}`), bucket as `added` (or `updated` if the new element is itself deleted). (3) For elements present in both with differing `versionNonce`: `Delta.calculate` with `stripIrrelevantProps` + `postProcess`; if `isDeleted` flipped (both booleans), bucket as added/removed accordingly, else `updated`. Notable: uses `randomInteger()` for synthetic versionNonces, and `version±1` to keep version monotonic.
- `static empty()` — L1263-L1265.
- `inverse(): ElementsDelta` — L1267-L1284. Swaps each delta's inserted/deleted, AND **swaps the `removed` and `added` buckets** (passing `removed` as added arg) to preserve invariants.
- `isEmpty(): boolean` — L1286-L1292. All three records empty.
- `applyLatestChanges(prevElements, nextElements, modifierOptions?): ElementsDelta` — L1301-L1386. Refreshes captured delta values with the latest element state. The `modifier` (L1306-L1346) picks `prevElement` for "deleted" partials and `nextElement` for "inserted", and copies each key's latest value from that element — **except** `boundElements`, which is kept as the captured diff. Per-bucket it rebuilds deltas via `Delta.create(...modifier...)`, dropping deltas that become inner-equal. Returns a redistributed `ElementsDelta` (since `isDeleted` may have changed).
- `applyTo(elements, snapshot=StoreSnapshot.empty().elements, options?): [SceneElementsMap, boolean]` — L1388-L1465. The big apply. Clones `elements` into a new `nextElements` Map (no mutation of input). Builds an applier via `createApplier`, applies added→removed→updated, then `resolveConflicts` for bindings, merges all changed elements. On error returns `[elements, true]` (intentionally true — see comment L1437-L1439 about avoiding broken redo). Then in a second try block reorders by fractional index (`reorderElements`) and `redrawElements`; `finally` returns `[nextElements, flags.containsVisibleDifference]`.
- `squash(delta): this` — L1467-L1565. Merges another ElementsDelta into this one. For each id in the incoming added/removed/updated, finds any existing delta across all three buckets, merges `boundElements` arrays specially (`mergeBoundElements`, L1474-L1509, keyed by `x.id`), deletes the id from the other buckets, and re-files the merged delta into the correct bucket (for `updated` it keeps it in whichever bucket the prevDelta lived). Validates in test/dev.
- `private static createApplier = (prevElements, nextElements, snapshot, flags, options?) => (deltas) => Map` — L1567-L1610. Returns a function that reduces a delta record into a Map of next elements: for each id it gets the element (via `createGetter`), applies the delta (`applyDelta`), sets it into `nextElements` and the accumulator, and infers `flags.applyDirection` from version comparison (prev.version > next.version ⇒ "backward", else "forward") the first time.
- `private static createGetter = (elements, snapshot, flags) => (id, partial) => element` — L1612-L1645. Resolves an element by id: from `elements`, else from `snapshot` (setting `containsZindexDifference` and possibly `containsVisibleDifference`), else **synthesizes** a brand-new element via `newElementWith({id, version:1}, partial)` (handles remotely-added elements).
- `private static applyDelta(element, delta, flags, options?)` — L1647-L1706. Builds the directly-applicable partial from `delta.inserted` keys, **skipping** `boundElements` and any `options.excludedProperties`. Merges `boundElements` separately via `mergeArrays`. If no visible diff yet, strips `index` and runs `checkForVisibleDifference`. Sets `containsZindexDifference` if `delta.deleted.index !== delta.inserted.index`. Returns `newElementWith(element, partial, true)` (the `true` bumps version).
- `private static checkForVisibleDifference(element, partial): boolean` — L1711-L1732. Deleted+still-deleted ⇒ false; deleted→undeleted ⇒ true (add); live→deleted ⇒ true (remove); else `Delta.isRightDifferent(element, partial)`.
- `private resolveConflicts(prevElements, nextElements, applyDirection="forward")` — L1742-L1831. The collaboration/binding fixer. Defines an `updater` (L1748-L1791) that only ever mutates `nextElements` entries (via `newElementWith` if untouched, else `mutateElement`), bumping version forward/backward. Then: for every `removed` id calls `unbindAffected`; for every `added` id calls `rebindAffected`; for `updated` ids **only those whose changed props intersect `bindingProperties`** calls `rebindAffected` (skipping deleted). Computes `prevAffectedElements`, then `squash`es a freshly-calculated delta of the affected elements back into `this`. Returns the affected-elements map.
- `private static unbindAffected(prevElements, nextElements, id, updater)` — L1837-L1855. Calls `BoundElement.unbindAffected` and `BindableElement.unbindAffected` for both the before- and after-removal element instances (re-fetched each call via closures, since instances may change).
- `private static rebindAffected(prevElements, nextElements, id, updater)` — L1861-L1889. Unbinds the prev `BoundElement`, rebinds the next; for `BindableElement` it unbinds prev but only forwards the update for **text** elements (comment: arrows can't be auto-rebound to bindables, TODO #7348), and rebinds the next bindable.
- `static redrawElements(nextElements, changedElements)` — L1891-L1914. Creates a temp `Scene(nextElements, {skipValidation:true})` (because no real scene exists during history/server apply), then redraws text bounding boxes and bound arrows. try/catch rethrow in test/dev; `finally` returns `nextElements`.
- `private static redrawTextBoundingBoxes(scene, changed)` — L1916-L1962. Collects container+boundText pairs (both directions: a bound-text element points to its container, and a container points to its bound text), dedup by container id, then `redrawTextBoundingBox` for each pair (skipping if either is deleted).
- `private static redrawBoundArrows(scene, changed)` — L1964-L1976. For each non-deleted bindable changed element, calls `updateBoundElements(element, scene, {changedElements: changed})`. Comment flags this as expensive (a possible optimization target).
- `private static reorderElements(elements, changed, flags)` — L1978-L2012. Short-circuits if no z-index difference. Else orders all elements by fractional index (`orderByFractionalIndex`), finds which changed elements actually moved (`getRightDifferences` between unordered and ordered, `skipShallowCompare=true`), flags visible difference if any moved, and returns `arrayToMap(syncMovedIndices(ordered, moved))`. Performance note: only synchronizes actually-moved indices, with a fallback to fixing all invalid indices.
- `private static postProcess(deleted, inserted): [ElementPartial, ElementPartial]` — L2018-L2057. Diffs `boundElements` arrays by id; for `points` (linear/freedraw) it **does not diff** — it either keeps both captured point arrays as-is or deletes `points` from both partials when `!Delta.isDifferent(deletedPoints, insertedPoints)` (comment: can't ensure multiplayer order without per-point fractional indices). try/catch rethrow in test/dev; `finally` returns the pair.
- `private static stripIrrelevantProps(partial): ElementPartial` — L2059-L2065. Destructures away `id` and `updated`, returning the rest.

Parity/architecture notes for `delta.ts`:
- The whole module is the undo/redo + collaboration substrate; a Canvas/Svelte reimplementation that wants real history fidelity must reproduce: forward/backward partial diffs, shallow-first-level comparison semantics, deterministic key ordering, the added/removed/updated tri-bucket with strict invariants (`version` integer, monotonic, unique bucket per id), z-index resync via fractional indices, and binding re-resolution (`unbind`/`rebind`) plus text/arrow redraw on apply.
- `version`/`versionNonce`/`seed`/`updated`/`id` handling is deliberate: `id`,`updated`,`seed` are stripped from element deltas; `version`/`versionNonce` drive direction inference and conflict resolution.
- Error handling pattern throughout: try/catch that **rethrows in test/dev** but degrades gracefully in production, often via `finally`-return.
