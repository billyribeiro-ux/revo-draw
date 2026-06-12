## Cluster: element__src__6

Files documented: `transform.ts`, `transformHandles.ts`, `typeChecks.ts`, `types.ts`, `utils.ts`, `visualdebug.ts`, `zindex.ts` (all under `packages/element/src/`).

---

### packages/element/src/transform.ts

Purpose: Converts a loosely-typed "skeleton" element description (the public `convertToExcalidrawElements` API used by programmatic creation, mermaid import, and the test fixtures) into fully-realized Excalidraw elements, wiring up bound text labels, arrow bindings, and frame geometry.

Exported types (skeleton input shapes):
- `ValidLinearElement` (L65-L160): A skeleton for `"arrow" | "line"` with `x`,`y`, optional `label`, and `start`/`end` binding descriptors. `start`/`end` may reference an existing element by `id`, declare a new bindable element by `type` (excluding image/text/frame/magicframe/embeddable/iframe), or declare a `"text"` element. Intersected with `Partial<ExcalidrawLinearElement>`.
- `ValidContainer` (L162-L173): Skeleton for a generic element (excluding `"selection"`) with an optional text `label`.
- `ExcalidrawElementSkeleton` (L175-L209): The union of all accepted skeleton inputs — generic/iframe/freedraw extract, line, container, linear, text (requires `text`,`x`,`y`), image (requires `fileId`), frame (requires `children` id list), magicframe.

Constants:
- `DEFAULT_LINEAR_ELEMENT_PROPS` (L211-L214): `{ width: 100, height: 0 }` — default size for skeleton line/arrow.
- `DEFAULT_DIMENSION` (L216): `100` — default w/h for generic/image/binding elements.

Internal functions / class:
- `bindTextToContainer(container, textProps, scene)` (L218-L243): Creates a center/middle-aligned `newTextElement` with `containerId = container.id`, appends `{type:"text", id}` to the container's `boundElements`, then calls `redrawTextBoundingBox` to size/position. Mutates `container` in place via `Object.assign`. Returns `[container, textElement] as const`. Side effect: mutates container, creates text element.
- `bindLinearElementToElement(linearElement, start, end, elementStore, scene): {linearElement, startBoundElement?, endBoundElement?}` (L245-L481): Core binding builder for arrows. Initializes `startBinding`/`endBinding` to null. For each of `start`/`end`: looks up existing element by id (logs error if missing), computes default placement (start at `linearElement.x - width`, `y - height/2`; end at `linearElement.x + width`, `y - height/2`), creates a `newTextElement` or generic `newElement` (rectangle/ellipse/diamond; `assertNever` otherwise), then calls `bindBindingElement(..., "orbit", "start"/"end", scene)`. After binding (L418-L474): if `points.length < 2` returns early; otherwise shifts the first and last point by `delta = 0.5` away from the bound element based on the direction the arrow runs (4 directional cases comparing last two points on x and y axes — see L434-L466), then re-normalizes via `LinearElementEditor.getNormalizeElementPointsAndCoords`. Notable geometry: the 0.5px nudge prevents endpoints overlapping bound-element coordinates. Side effects: mutates `linearElement`, creates bound elements.
- `class ElementStore` (L483-L507): In-memory `Map<string, ExcalidrawElement>`. Methods: `add(ele?)` (no-op if falsy, keyed by `ele.id`), `getElements()` (returns array passed through `syncInvalidIndices` to fix fractional indices), `getElementsMap()` (branded `NonDeletedSceneElementsMap` via `arrayToMap`+`toBrandedType`), `getElement(id)`.
- `convertToExcalidrawElements(elementsSkeleton, opts?): ExcalidrawElement[]` (L509-L809): THE public compiler. Steps:
  1. Returns `[]` for null input; deep-clones input via `cloneJSON`.
  2. Pass 1 (L522-L651): For each skeleton, optionally regenerates `id` with `randomId()` (unless `opts.regenerateIds === false`). Switches on `type` building each element: rectangle/ellipse/diamond (width/height 0 if a label is present and dimension undefined, else `DEFAULT_DIMENSION`); line (`newLinearElement` with 2-point default `[(0,0),(w,h)]`); arrow (`newArrowElement` with `endArrowhead:"arrow"`, then `getSizeFromPoints` reconciles width/height); text (measures via `measureText`+`getFontString`+`getLineHeight`/`normalizeText`); image; frame/magicframe (x=y=0 default); freedraw/iframe/embeddable pass-through; `assertNever` default. Records dupes, tracks `oldToNewElementIdMap`.
  3. Builds a temp `Scene` from the elements map (L653-L655) — comment notes there is "no real scene", just a scratch scene for queries/mutations.
  4. Pass 2 (L658-L736): Adds labels and arrow bindings. For container types with a `label.text`, binds text; if the container is an arrow, remaps original start/end ids through `oldToNewElementIdMap` then calls `bindLinearElementToElement`. For arrows without labels, similarly remaps ids and binds.
  5. Pass 3 (L741-L806): Frames last (needs children laid out first). Maps each child id, assigns `frameId`, also re-parents the children's bound elements; computes `getCommonBounds` of children, applies `PADDING = 10`, and sets frame x/y/w/h (honoring any user-supplied values). In dev (`isDevEnv()`) logs an info note if user provided frame coords.
  6. Returns `elementStore.getElements()`.
  Invariant: deterministic ordering relies on `syncInvalidIndices`. Geometry is world-space throughout. Frame bounds derived from `getCommonBounds`.

---

### packages/element/src/transformHandles.ts

Purpose: Computes the on-canvas selection/resize/rotation handle rectangles (in world space, accounting for zoom, rotation, element type, and device) used by the interactive overlay.

Exported types:
- `TransformHandleDirection` (L31-L39): `"n"|"s"|"w"|"e"|"nw"|"ne"|"sw"|"se"`.
- `TransformHandleType` (L41): direction `| "rotation"`.
- `TransformHandle = Bounds` (L43); `TransformHandles = Partial<{ [T in TransformHandleType]: TransformHandle }>` (L44-L46); `MaybeTransformHandleType = TransformHandleType | false` (L47).

Constants:
- `transformHandleSizes` (L49-L53): per-PointerType handle size in px — `mouse: 8, pen: 16, touch: 28`. Performance/UX note: larger hit targets for pen/touch.
- `ROTATION_RESIZE_HANDLE_GAP = 16` (L55): vertical gap (px) above the bbox for the rotation handle.
- `DEFAULT_OMIT_SIDES` / `OMIT_SIDES_FOR_MULTIPLE_ELEMENTS` (L57-L69): omit the 4 cardinal sides `{e,s,n,w:true}` (corners + rotation kept).
- `OMIT_SIDES_FOR_FRAME` (L71-L77): cardinal sides + `rotation` omitted.
- `OMIT_SIDES_FOR_LINE_SLASH` (L79-L86): omits cardinals + `nw`+`se` (keeps `ne`,`sw` for a `/`-oriented 2-point line).
- `OMIT_SIDES_FOR_LINE_BACKSLASH` (L88-L93): omits cardinals only (keeps all 4 corners for a `\` line).

Functions:
- `generateTransformHandle(x, y, width, height, cx, cy, angle: Radians): TransformHandle` (L95-L110): Rotates the handle's CENTER point `(x+w/2, y+h/2)` around the element center `(cx,cy)` by `angle` using `pointRotateRads`, then returns the un-rotated-size bounds `[xx-w/2, yy-h/2, w, h]`. Key geometry: handle position is rotated but the handle box itself stays axis-aligned (the bounds tuple is not rotated).
- `canResizeFromSides(editorInterface): boolean` (L112-L121): Returns `false` on phone + mobile device (no side handles), else `true`.
- `getOmitSidesForEditorInterface(editorInterface)` (L123-L131): `DEFAULT_OMIT_SIDES` if side-resize allowed, else `{}` (show sides).
- `getTransformHandlesFromCoords([x1,y1,x2,y2,cx,cy], angle, zoom, pointerType, omitSides={}, margin=4, spacing=DEFAULT_TRANSFORM_HANDLE_SPACING): TransformHandles` (L133-L270): The core layout. Handle width/height and margins are `size/zoom.value` (zoom-invariant screen size). `dashedLineMargin = margin/zoom`; `centeringOffset = (size - spacing*2)/(2*zoom)`. Always emits corners `nw,ne,sw,se` (unless omitted) and `rotation` (placed at top-center, lifted by `ROTATION_RESIZE_HANDLE_GAP/zoom`). Cardinal `n`/`s` only added when `Math.abs(width) > minimumSizeForEightHandles`; `w`/`e` only when `Math.abs(height) >` that threshold. `minimumSizeForEightHandles = (5 * transformHandleSizes.mouse)/zoom` (L218-L219) — note: uses `mouse` size regardless of pointer because rendering uses mouse size. All handle origins computed from bbox corners then fed to `generateTransformHandle` for rotation. Performance/parity detail: positions adjust per zoom so handles maintain constant screen size; the 8-handle visibility gate is size-dependent.
- `getTransformHandles(element, zoom, elementsMap, pointerType="mouse", omitSides=DEFAULT_OMIT_SIDES): TransformHandles` (L272-L326): Element-aware wrapper. Returns `{}` for locked elements and elbow arrows (cannot rotate/resize). For freedraw/linear 2-point elements, chooses `OMIT_SIDES_FOR_LINE_SLASH`/`BACKSLASH` based on the sign of the second point's coords (L290-L305). For frame-like, forces `rotation:true`. Margin: linear → `DEFAULT_TRANSFORM_HANDLE_SPACING + 8`, image → `0`, else `DEFAULT_TRANSFORM_HANDLE_SPACING`. Calls `getElementAbsoluteCoords(element, elementsMap, true)` for the bbox, passing `element.angle` and `spacing=0` for images.
- `hasBoundingBox(elements, appState, editorInterface): boolean` (L328-L354): Returns `false` while a selected linear element is being edited or dragged; `true` for multi-selection; `false` for elbow arrow single-selection or single linear elements with ≤2 points or on mobile; otherwise `true`. For linear: requires `points.length > 2 && !isMobileDevice`.

---

### packages/element/src/typeChecks.ts

Purpose: Central library of TypeScript type-guard predicates and small classification helpers over `ExcalidrawElement` (drives nearly all branching in the codebase).

All functions are exported. Each is a one-expression predicate unless noted.
- `isInitializedImageElement(element): element is InitializedExcalidrawImageElement` (L34-L38): image with truthy `fileId`.
- `isImageElement(element): element is ExcalidrawImageElement` (L40-L44): `type === "image"`.
- `isEmbeddableElement(element): element is ExcalidrawEmbeddableElement` (L46-L50): `type === "embeddable"`.
- `isIframeElement(element): element is ExcalidrawIframeElement` (L52-L56): `type === "iframe"`.
- `isIframeLikeElement(element)` (L58-L64): iframe or embeddable.
- `isTextElement(element)` (L66-L70): `type === "text"`.
- `isFrameElement` (L72-L76); `isMagicFrameElement` (L78-L82); `isFrameLikeElement` (L84-L91): frame or magicframe.
- `isFreeDrawElement(element)` (L93-L97) delegating to `isFreeDrawElementType(elementType)` (L99-L103): `=== "freedraw"`.
- `isLinearElement(element)` (L105-L109) delegating to `isLinearElementType(elementType)` (L152-L158): `"arrow" || "line"` (freedraw commented out).
- `isLineElement` (L111-L115): `type === "line"`.
- `isArrowElement` (L117-L121): `type === "arrow"`.
- `isElbowArrow(element)` (L123-L127): arrow AND `element.elbowed`.
- `isSimpleArrow(element)` (L132-L136): arrow AND not elbowed (sharp or curved).
- `isSharpArrow(element)` (L138-L142): arrow, not elbowed, no `roundness`.
- `isCurvedArrow(element)` (L144-L150): arrow, not elbowed, `roundness !== null`.
- `isBindingElement(element, includeLocked=true)` (L160-L169) + `isBindingElementType(elementType)` (L171-L175): binding element is `type === "arrow"` (respecting lock unless `includeLocked`).
- `isBindableElement(element, includeLocked=true)` (L177-L194): rectangle/diamond/ellipse/image/iframe/embeddable/frame/magicframe, or unbound text (no `containerId`); respects lock.
- `isRectanguloidElement(element)` (L196-L210): rectangle/diamond/image/iframe/embeddable/frame/magicframe or unbound text. (Note: excludes ellipse — distinct from bindable.)
- `isRectangularElement(element)` (L214-L228): rectangle/image/text/iframe/embeddable/frame/magicframe/freedraw (TODO comment notes it's a placeholder pending proper distance calc; note it includes text unconditionally and freedraw, excludes diamond/ellipse).
- `isTextBindableContainer(element, includeLocked=true)` (L230-L242): rectangle/diamond/ellipse or arrow (containers that can hold bound text).
- `isExcalidrawElement(element: any)` (L244-L272): exhaustive `switch` over all known types; `assertNever` on unknown.
- `isFlowchartNodeElement(element)` (L274-L282): rectangle/ellipse/diamond.
- `hasBoundTextElement(element)` (L284-L291): text-bindable container with a `boundElements` entry of `type === "text"`.
- `isBoundToContainer(element)` (L293-L302): text element with non-null `containerId`.
- `isArrowBoundToElement(element)` (L304-L306): truthy `startBinding` or `endBinding`.
- `isUsingAdaptiveRadius(type)` (L308-L312): rectangle/embeddable/iframe/image.
- `isUsingProportionalRadius(type)` (L314-L315): line/arrow/diamond.
- `canApplyRoundnessTypeToElement(roundnessType, element)` (L317-L338): ADAPTIVE_RADIUS or LEGACY applies to adaptive-radius types; PROPORTIONAL_RADIUS applies to proportional types; else false.
- `getDefaultRoundnessTypeForElement(element)` (L340-L356): returns `{type: PROPORTIONAL_RADIUS}` or `{type: ADAPTIVE_RADIUS}` or `null`.
- `getLinearElementSubType(element): ExcalidrawLinearElementSubType` (L358-L371): maps to `"sharpArrow"|"curvedArrow"|"elbowArrow"|"line"`.
- `isValidPolygon(points)` (L380-L384): `points.length > 3 && pointsEqual(first, last)` — checks closed-loop polygon (geometry: first==last point).
- `canBecomePolygon(points)` (L386-L394): `length > 3` OR (`length === 3` and first ≠ last).
- `isEligibleFrameChildType(type)` (L396-L414): switch allowing rectangle/diamond/ellipse/arrow/line/freedraw/text/image/frame/embeddable (excludes iframe, magicframe, selection).

---

### packages/element/src/types.ts

Purpose: Types-only module — the canonical element type system (the discriminated union `ExcalidrawElement` and all sub-types, branded map types, binding/arrowhead types). No runtime code.

Primitive/alias types: `ChartType` (L18), `FillStyle` (L19), `FontFamilyKeys`/`FontFamilyValues` (L20-L21), `Theme` (L22), `FontString` (branded string, L23), `GroupId` (L24), `PointerType` `"mouse"|"pen"|"touch"` (L25), `StrokeRoundness` (L26), `RoundnessType` (L27), `StrokeStyle` (L28), `TextAlign` (L29), `VerticalAlign` (L31-L32), `FractionalIndex` (branded string, L33).

- `BoundElement` (L35-L38): `{id, type: "arrow"|"text"}`.
- `_ExcalidrawElementBase` (L40-L82): the readonly base shared by all elements — `id,x,y,strokeColor,backgroundColor,fillStyle,strokeWidth,strokeStyle,roundness,roughness,opacity,width,height,angle(Radians),seed,version,versionNonce,index(FractionalIndex|null),isDeleted,groupIds,frameId,boundElements,updated,link,locked,customData?`. Doc comments clarify `seed` (deterministic rough.js), `version`/`versionNonce` (reconciliation), `index` (fractional ordering, kept in sync with array order). Geometry note: `groupIds` ordered deepest→shallowest.
- Concrete element types: `ExcalidrawSelectionElement` (L84-L86), `ExcalidrawRectangleElement` (L88-L90), `ExcalidrawDiamondElement` (L92-L94), `ExcalidrawEllipseElement` (L96-L98), `ExcalidrawEmbeddableElement` (L100-L103).
- `MagicGenerationData` (L105-L114): pending/done(html)/error union.
- `ExcalidrawIframeElement` (L116-L121) with optional `customData.generationData`; `ExcalidrawIframeLikeElement` (L123-L125).
- `IframeData` (L127-L135): intrinsicSize + video/generic/document variants.
- `ImageCrop` (L137-L144): `{x,y,width,height,naturalWidth,naturalHeight}`.
- `ExcalidrawImageElement` (L146-L156): adds `fileId|null`, `status`, `scale:[number,number]` (axis flip in <-1,1>), `crop`. `InitializedExcalidrawImageElement` (L158-L161): fileId non-nullable.
- `ExcalidrawFrameElement` (L163-L166) / `ExcalidrawMagicFrameElement` (L168-L171) with `name`; `ExcalidrawFrameLikeElement` (L173-L175).
- Group unions: `ExcalidrawGenericElement` (L180-L184: selection/rectangle/diamond/ellipse), `ExcalidrawFlowchartNodeElement` (L186-L189), `ExcalidrawRectanguloidElement` (L191-L199).
- `ExcalidrawElement` (L206-L216): THE top-level discriminated union. `ExcalidrawNonSelectionElement` (L218-L221).
- Wrapper generics: `Ordered<T>` (adds non-null `index`, L223-L225), `OrderedExcalidrawElement` (L227), `NonDeleted<T>` (L229-L231), `NonDeletedExcalidrawElement` (L233).
- `ExcalidrawTextElement` (L235-L257): adds `fontSize,fontFamily,text,textAlign,verticalAlign,containerId,originalText,autoResize` (default true), `lineHeight` (branded unitless — multiply by fontSize for px).
- `ExcalidrawBindableElement` (L259-L268); `ExcalidrawTextContainer` (L270-L274: rect/diamond/ellipse/arrow); `ExcalidrawTextElementWithContainer` (L276-L278).
- Binding types: `FixedPoint = [number, number]` (L280), `BindMode = "inside"|"orbit"|"skip"` (L282), `FixedPointBinding` (L284-L297): `{elementId, fixedPoint, mode}` — fixedPoint is a 0.0-1.0 ratio multiplied by bound element w/h to derive local coordinate (geometry note in comment).
- `Index = number` (L299); `PointsPositionUpdates = Map<Index, {point: LocalPoint; isDragging?}>` (L301-L304).
- Arrowheads: `CardinalityArrowhead` (L306-L312), `ArrowheadLegacy` (L314-L318), `Arrowhead` (L320-L329), `AnyArrowhead` (L331).
- `ExcalidrawLinearElement` (L333-L341): adds `points: readonly LocalPoint[]`, start/end bindings, start/end arrowheads. `ExcalidrawLineElement` (L343-L347) adds `polygon`. `FixedSegment` (L349-L353). `ExcalidrawArrowElement` (L355-L359) adds `elbowed`. `ExcalidrawElbowArrowElement` (L361-L385): elbowed:true plus `fixedSegments`, `startIsSpecial`/`endIsSpecial` (doc comments explain hiding first/last segment via the 3rd point when bound side flips between horizontal/vertical).
- `ExcalidrawFreeDrawElement` (L387-L393): `points`, `pressures`, `simulatePressure`.
- `FileId` (branded, L395); `ExcalidrawElementType` (L397).
- Map types (all branded): `ElementsMap` (L404), `NonDeletedElementsMap` (L410-L414), `SceneElementsMap` (L420-L424), `NonDeletedSceneElementsMap` (L430-L434), `ElementsMapOrArray` (L436-L438).
- `ExcalidrawLinearElementSubType` (L440-L444), `ConvertibleGenericTypes` (L446), `ConvertibleLinearTypes` (L447), `ConvertibleTypes` (L448).

---

### packages/element/src/utils.ts

Purpose: Geometry decomposition utilities — turns rectanguloid/diamond/linear/freedraw elements into world-space line-segment + cubic-Bézier-curve components (with a per-element version-keyed cache), plus arrow-to-shape projection helpers used for binding snap.

- `type ElementShape = [LineSegment<GlobalPoint>[], Curve<GlobalPoint>[]]` (L62): tuple of [segments, curves].
- `ElementShapesCache: WeakMap<element, {version, shapes: Map<offset, ElementShape>}>` (L64-L67): caches decomposition keyed by element version and offset. Performance: avoids recomputing shapes; invalidated when `element.version` changes.
- `getElementShapesCacheEntry(element, offset)` (L69-L87): returns cached shape if present AND version matches; deletes stale entry on version mismatch.
- `setElementShapesCacheEntry(element, shape, offset)` (L89-L117): stores shape, resetting the per-element record on version change.
- `deconstructLinearOrFreeDrawElement(element, elementsMap): [LineSegment[], Curve[]]` (L125-L200): Builds rough.js-style ops via `generateLinearCollisionShape`, then converts `move`/`lineTo`/`bcurveTo` ops into world-space `lineSegment`/`curve` objects by offsetting each op's data by `element.x/y` and using the previous op's last 2 coords as the start point (L141-L142). Returns ROTATED components (per JSDoc). Caches at offset 0. Throws if a lineTo/bcurveTo has no prevPoint.
- `deconstructRectanguloidElement(element, offset=0): [LineSegment[], Curve[]]` (L210-L340): Builds an UNROTATED rounded rectangle. Computes `radius` via `getCornerRadius(min(w,h), element)` (forced to 0.01 if 0 to keep curve math valid, L225-L227). Constructs 4 side segments (top/right/bottom/left, inset by radius) and 4 corner cubic Béziers using the `2/3` control-point factor (L251-L300) toward each rectangle corner. If `offset > 0`, each corner is offset (`curveOffsetPoints`) and re-approximated (`curveCatmullRomCubicApproxPoints`). Sides reconnect corner endpoints (L317-L334). Caches by offset. Key math: `2/3` factor approximates a circular arc with a cubic Bézier.
- `getDiamondBaseCorners(element, offset=0): Curve<GlobalPoint>[]` (L342-L412): Computes the 4 corner curves of a diamond. Uses `getDiamondPoints` for top/right/bottom/left, `verticalRadius`/`horizontalRadius` from `getCornerRadius` (or `*0.01` when no roundness). Returns RIGHT/BOTTOM/LEFT/TOP curves; each curve's control points coincide with the corner vertex (degenerate cubic forming a rounded corner). World-space (offset by element.x/y).
- `deconstructDiamondElement(element, offset=0): [LineSegment[], Curve[]]` (L422-L463): Like the rectanguloid version but for diamonds — maps `getDiamondBaseCorners` through `curveOffsetPoints`+`curveCatmullRomCubicApproxPoints`, then connects sides between corner endpoints. Caches by offset. UNROTATED.
- `isPathALoop(points, zoomValue=1): boolean` (L467-L481): For `points.length >= 3`, returns true if distance(first,last) ≤ `LINE_CONFIRM_THRESHOLD / zoomValue`. Zoom-aware: threshold shrinks when zoomed in.
- `getCornerRadius(x, element): number` (L483-L504): PROPORTIONAL/LEGACY → `x * DEFAULT_PROPORTIONAL_RADIUS`. ADAPTIVE → fixed `value` (default `DEFAULT_ADAPTIVE_RADIUS`) but proportional below a `CUTOFF_SIZE = fixedRadiusSize / DEFAULT_PROPORTIONAL_RADIUS`. Else 0. Key math: adaptive radius caps at a fixed px size but scales proportionally for small shapes.
- `getDiagonalsForBindableElement(element, elementsMap)` (internal, L506-L588): Returns the two diagonals (or center-lines for non-rectangular elements) of a bindable element, rotated by `element.angle` around its center. Rectangles get a 15px inward `OFFSET_PX` shrink on each diagonal (`shrinkSegment`, L513-L520) "because there's something going on with the focus points around the corners." For non-rectangular shapes, uses vertical and horizontal center lines instead of true diagonals. Coordinate space: world, rotated.
- `getSnapOutlineMidPoint(point, element, elementsMap, zoom): GlobalPoint | undefined` (L590-L651): Computes the rotated side-midpoints (4 for rect-like via direct edge midpoints; for diamond via `bezierEquation(curve, 0.5)` on each base corner). Returns the first midpoint within `maxBindingDistance_simple(zoom) + strokeWidth/2` of `point` that is NOT inside the element (`hitElementItself` with `overrideShouldTestInside:true`). Used for snapping arrow endpoints to edge midpoints.
- `projectFixedPointOntoDiagonal(arrow, point, element, startOrEnd, elementsMap, zoom, isMidpointSnappingEnabled=true): GlobalPoint | null` (L653-L744): Projects a desired binding `point` onto the element's diagonals/center-lines. `invariant` requires ≥2 arrow points; returns null if arrow is < 3px in both dimensions. If midpoint snapping enabled, prefers `getSnapOutlineMidPoint`. Otherwise: picks the opposite endpoint `a` (index 1 for start, length-2 for end) — for 2-point arrows uses the OTHER binding's global fixed point to avoid stale state (L694-L713). Builds a long ray `b` from `a` through `point` scaled by `2*dist + max(diagonal lengths)` (L715-L725), intersects both diagonals (`lineSegmentIntersectionPoints`), chooses the nearer intersection to `a`, and returns it only if it lies inside the element (`isPointInElement`). Key geometry: ray-cast from a stable anchor through the cursor onto the element's diagonal/center-line to find a deterministic binding point.

---

### packages/element/src/visualdebug.ts

Purpose: Development-only visual debugging API that collects line/curve/polygon/bounds primitives into a global `window.visualDebug.data` frame buffer for the debug canvas to render.

Global augmentation: `Window.visualDebug?: { data: DebugElement[][]; currentFrame?: number }` (L23-L30). Types: `DebugElement` (L32-L36: `{color, data: LineSegment|Curve|DebugPolygon, permanent}`), `DebugPolygon` (L38-L43: `{type:"polygon", points, fill?, close?}`).

- `debugDrawHitVolume(element, elementsMap, options?)` (L45-L95): Casts `rays` (default 100) rays from the element's bbox center outward at radius `2*max(w,h)`, intersects each ray with the element (`intersectElementWithLineSegment`), keeps the nearest hit per ray (sorts by `pointDistanceSq`), and draws the resulting polygon (≥3 points) — used to visualize an element's hit area. Returns early for non-loop linear/freedraw paths. Geometry: polar ray sweep `angle = (i/rays)*2π`.
- `debugDrawCubicBezier(c, opts?)` (L97-L109): Pushes a `Curve` debug element (default color purple).
- `debugDrawLine(segment | segment[], opts?)` (L111-L129): Normalizes to array (`isLineSegment`), pushes each as a debug element (default red).
- `debugDrawPolygon(points, opts?)` (L131-L154): Pushes a polygon (no-op if <2 points; default orange; supports fill/close).
- `debugDrawPoint(p, opts?)` (L156-L187): Draws an X mark (two crossing 20px line segments) at `p`, with optional random `fuzzy` jitter up to 3px (default cyan).
- `debugDrawBounds(box | box[], opts?)` (L189-L222): Draws the 4 edges of each `Bounds` rectangle as line segments (default green).
- `debugDrawPoints({x,y,points}, options?)` (L224-L239): Draws each LocalPoint offset by `(x,y)` as a debug point.
- `debugCloseFrame()` (L241-L243): Pushes a new empty frame array.
- `debugClear()` (L245-L249): Resets `window.visualDebug.data` to `[]`.
- `addToCurrentFrame(element)` (internal, L251-L257): Ensures frame 0 exists, pushes into the last frame. Side effect: mutates global debug buffer.

---

### packages/element/src/zindex.ts

Purpose: Implements z-order manipulation (move one/all forward/backward) over the flat element array, correctly handling deleted gaps, groups, frames (and their children), and tightly-bound container/text pairs, while keeping fractional indices in sync.

- `isOfTargetFrame(element, frameId)` (internal, L24-L26): element belongs to frame (its `frameId` matches or it IS the frame).
- `getIndicesToMove(elements, appState, elementsToBeMoved?)` (internal, L36-L70): Returns indices of selected elements, INCLUDING contiguous deleted elements sandwiched between selected ones (so z-moves skip gaps cleanly). `elementsToBeMoved` overrides `appState.selectedElementIds`. Algorithm tracks `includeDeletedIndex` to absorb runs of deleted elements.
- `toContiguousGroups(array)` (internal, L72-L81): Reduces a sorted index array into runs of consecutive integers (`number[][]`).
- `getTargetIndexAccountingForBinding(nextElement, elements, direction, scene)` (internal, L88-L127): Treats a container + its bound (non-arrow) text as one unit — returns the min (left) or max (right) index of the pair. Returns undefined if no binding. Uses `scene.getElement` to resolve container/bound ids.
- `getContiguousFrameRangeElements(allElements, frameId)` (internal, L129-L147): Slices the element array from first to last element belonging to `frameId` (the frame's contiguous z-range).
- `moveArrowAboveBindable(point, arrow, elements, elementsMap, scene, hit?): readonly OrderedExcalidrawElement[]` (EXPORTED, L153-L191): Ensures a bound arrow renders above the bindable it hovers/intersects. Resolves the hovered element (or `hit`), collects its id + bound text + container ids, and if the arrow currently sits below the bindable, splices the arrow to the bindable's index and calls `scene.replaceAllElements`. Side effect: mutates scene order. (Note: returns the ORIGINAL `elements` reference, mutation happens via scene.)
- `getTargetIndex(appState, elements, boundaryIndex, direction, containingFrame, scene)` (internal, L197-L303): Computes the next valid index to move toward. `indexFilter` excludes deleted, restricts to frame children when `containingFrame` set, or to the editing group's members. Uses `findLastIndex`/`findIndex` from a boundary. Handles: editing-group siblings (returns binding-aware index, or -1 if candidate leaves the group); frames (jumps over the whole contiguous frame range); group siblings (jumps to the sibling group's first/last element via `getElementsInGroup`, assumed z-sorted ascending); binding-aware adjustment otherwise. Returns -1 when no valid target.
- `getTargetElementsMap(elements, indices)` (internal, L305-L314): Builds a `Map<id, element>` for the given indices (used by `syncMovedIndices`).
- `shiftElementsByOne(elements, appState, direction, scene)` (internal, L316-L395): Move-one-step implementation. Gets indices, groups into contiguous runs, reverses for "right". For each run computes a `boundaryIndex` and a `containingFrame` (null if a fully-selected frame contains them), finds `targetIndex`, then reorders by slicing leading/target/displaced/trailing segments (asymmetric for left vs right, L362-L389). Finally `syncMovedIndices` to fix fractional indices. Returns reordered array.
- `shiftElementsToEnd(elements, appState, direction, containingFrame, elementsToBeMoved?)` (internal, L397-L481): Move-to-front/back implementation. Determines leading/trailing bounds based on direction, frame, or editing group (returns early if empty group). Collects non-moved elements between bounds as `displacedElements`, then concatenates leading + (target/displaced ordered by direction) + trailing. Calls `syncMovedIndices`.
- `shiftElementsAccountingForFrames(allElements, appState, direction, shiftFunction)` (internal, L483-L561): Frame-aware wrapper for the "to-end" moves. Partitions selected elements into `regularElements` (including fully-selected frames and their children) and per-frame `frameChildren` maps, then applies `shiftFunction` once per frame-children set and finally for the regular elements. Ensures frame children move within their frame's range.
- `moveOneLeft(allElements, appState, scene)` (EXPORTED, L566-L572): `shiftElementsByOne(..., "left", scene)`.
- `moveOneRight(allElements, appState, scene)` (EXPORTED, L574-L580): `shiftElementsByOne(..., "right", scene)`.
- `moveAllLeft(allElements, appState)` (EXPORTED, L582-L592): `shiftElementsAccountingForFrames(..., "left", shiftElementsToEnd)`.
- `moveAllRight(allElements, appState)` (EXPORTED, L594-L604): `shiftElementsAccountingForFrames(..., "right", shiftElementsToEnd)`.

Performance/parity note: all z-order math operates on the flat array order; fractional `index` strings are reconciled afterward via `syncMovedIndices` (never recomputed inline). Group elements are assumed pre-sorted by zIndex ascending.
