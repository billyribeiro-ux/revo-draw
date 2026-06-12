## Parity: rendering

Axis: Canvas2D draw of elements + selection overlay, DPR, dirty rendering.

Scope note: Excalidraw splits rendering across **two canvases** — a *static scene*
(`staticScene.ts` → `renderElement.ts`) for element bodies, and an *interactive scene*
(`interactiveScene.ts`) for selection/handles/overlays. Ours is a **single** canvas drawn by one
`render()` pass in `renderer.ts` that paints both element bodies and the selection overlay. So the
correct correspondence is: our `render()` ≈ `_renderStaticScene` + `_renderInteractiveScene` merged,
our `drawElement` ≈ `renderElement`/`drawElementOnCanvas`, our `drawSelection` ≈
`renderSelectionBorder`+`renderTransformHandles`. Frameworks differ (React-orchestrated vs Svelte
`$effect`), so I judge algorithm/behavior, not call structure.

The two products also have disjoint element vocabularies. Excalidraw draws *freehand geometric
shapes* (rectangle/ellipse/diamond/line/arrow/freedraw/text/image/frame/embeddable) via roughjs into
**per-element cached offscreen canvases**. Ours draws ~35 *semantic UI primitives* (button, input,
table, chart, nav, hero, …) with bespoke hand-coded glyphs directly to the main context, no caching,
no roughjs. That is an intentional product divergence, not a defect — but it dominates the table
below.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `_renderStaticScene` (top-level paint loop: clear, bg, grid, paint visible in order) | MATCH (algorithm) | `render` renderer.ts:62-93 | staticScene.ts:229-479 | Same shape: reset transform, paint bg, optional grid, iterate ordered elements painting each. |
| `bootstrapCanvas` (setTransform→scale, paint bg or clear) | MATCH | `render` renderer.ts:66-71 | helpers.ts:31-77 | We `setTransform(dpr,…)`, `clearRect`, then `fillRect` bg. Excal scales by `scale` (=DPR) then fills bg. Same net effect; we always clear+fill, Excal clears only for transparent bg. |
| `getNormalizedCanvasDimensions` (canvas.width / scale) | DIVERGENT (cosmetic) | Canvas.svelte:60-61,100-101 | helpers.ts:23-29 | Excal stores backing px in `canvas.width` and divides by scale to get CSS px. We keep CSS px in `camera.viewportWidth` and set `canvas.width = rect.width*dpr` separately. Equivalent result; bookkeeping differs. |
| `context.scale(zoom, zoom)` + scroll-translate camera application | MATCH | `render` renderer.ts:76-77 | staticScene.ts:261 | Excal applies `scale(zoom)` then each element self-translates by `scrollX/Y`. We compose `dpr * worldToScreen` into one `setTransform` so world coords map straight to device px. Same world→screen mapping. |
| `strokeGrid` (grid lines, bold every `gridStep`, hide regular when actualGridSize<10, 0.5px crisp offset) | DIVERGENT (cosmetic) | `drawGrid` renderer.ts:97-139 | staticScene.ts:56-130 | Both adapt density to zoom and have a major/minor tier. Excal draws **dashed lines**; ours draws **dots** (editorial style). Excal hides regular lines at `actualGridSize<10`; ours doubles/halves world step to stay 14–48px and bails at screenStep<4. Excal uses 0.5px crisp-offset at zoom===1; ours has no sub-pixel snap. Intentional visual-language difference. |
| `renderElement` / `drawElementOnCanvas` (per-type dispatch: rect/ellipse/diamond/line/arrow/freedraw/text/image/frame) | DIVERGENT (behavioral, by design) | `drawElement` renderer.ts:148-272 | renderElement.ts:387-601, 780-1072 | Same role (switch on `element.type`, save/rotate/alpha, dispatch to a per-type drawer). Bodies are wholly different: Excal renders roughjs `Drawable`s for geometric primitives; ours renders ~35 semantic UI glyphs. No type overlaps. Intentional product divergence. |
| element rotation about center (`translate(c)→rotate(angle)→translate(-c)`) | MATCH | `drawElement` renderer.ts:150-155 | drawElementFromCanvas renderElement.ts:703-719 | Both rotate around element center. Ours rotates the live draw; Excal rotates the cached-canvas blit. Same transform math. |
| per-element opacity (`globalAlpha`) | DIVERGENT (behavioral) | `drawElement` renderer.ts:156 | `getRenderOpacity` renderElement.ts:108-132,794-800 | We set `globalAlpha = style.opacity ?? 1`. Excal combines element×frame opacity and erase-pending dimming. We have no frame-opacity inheritance or erase state (no frames-with-opacity, no eraser tool). Scope-appropriate. |
| element canvas caching (`generateElementWithCanvas` / `elementWithCanvasCache` WeakMap, regen on zoom/theme/version) | ABSENT (intentional) | — | renderElement.ts:603-663 | Excal rasterizes each element to an offscreen canvas keyed by zoom/theme/version and blits it; a perf optimization for expensive roughjs shapes. Ours draws every element live each frame. Acceptable: our glyphs are cheap vector ops and our scenes are small/single-user. Real but deliberate gap. |
| `cappedElementCanvasSize` (clamp offscreen canvas to Safari area/dim limits) | ABSENT (intentional) | — | renderElement.ts:149-202 | Only relevant to the offscreen-canvas cache, which we don't have. |
| `imageSmoothingEnabled=false` for axis-aligned/right-angle elements | ABSENT (gap, minor) | — | renderElement.ts:1000-1061 | Excal disables smoothing when angle is 0 or a right angle to sharpen blitted bitmaps. We draw vectors live so there's no blit to sharpen; mostly N/A, but our raster `drawImage`/icon paths (renderer.ts:854-962) don't toggle smoothing. Low impact. |
| `drawImagePlaceholder` (image element placeholder glyph) | DIVERGENT (cosmetic) | `drawImage` renderer.ts:586-605 | renderElement.ts:361-385 | Both paint a placeholder for an image. Excal blits a FontAwesome "image" SVG centered; ours strokes a mountains-and-sun glyph. Same intent. |
| frame outline render (roundRect with `FRAME_STYLE.radius/zoom`, name tab) | DIVERGENT (cosmetic) | `drawFrame` renderer.ts:348-365 | renderElement.ts:802-845 | Both: rounded rect + a title label above the frame. Excal uses theme stroke + magicframe color; ours adds a drop shadow and uses paper fill. Behaviorally equivalent role. |
| text rendering with manual multiline wrap | DIVERGENT (behavioral) | `drawText`+`wrapText` renderer.ts:543-584 | renderElement.ts:546-595 | Excal splits on explicit `\n` and lays each line at `getLineHeightInPx` with `getVerticalOffset`; it does NOT auto-wrap (width is precomputed). Ours measures and **greedily word-wraps** to `el.width`. Different algorithm: ours wraps, Excal honors hard newlines only. Also ours ignores RTL handling (renderElement.ts:548-555). For a wireframe spec tool the difference is benign. |
| `frameClip` / `shouldApplyFrameClip` (clip element draw to containing frame) | ABSENT (intentional) | — | staticScene.ts:132-156, 318-345 | Excal clips children to their frame. Our "frame" is a styling element, not a clipping container; children aren't clipped. Deliberate per our model (geometry is world-space, no frame clip). |
| `renderLinkIcon` (cached per-zoom link badge canvas) | ABSENT (intentional) | — | staticScene.ts:158-228 | No hyperlink feature in ours. |
| iframe/embeddable second-pass render + placeholder label | ABSENT (intentional) | — | staticScene.ts:387-461 | No embeddables/iframes in ours. |
| `renderStaticScene` throttle via `throttleRAF` (coalesce to one paint per frame, latest-args) | DIVERGENT (behavioral) | Canvas.svelte:45-87 `$effect` | staticScene.ts:482-501; throttleRAF utils.ts:155-188 | Both are dirty-driven, not a constant loop. Excal coalesces repeated `renderStaticScene(throttle=true)` calls into one rAF with latest args. Ours relies on Svelte `$effect` reactive batching: the effect re-runs when any read dep changes and Svelte coalesces synchronous invalidations into one microtask flush. Net: both paint once per burst of changes; ours flushes on microtask (sooner), Excal on next rAF. The pointermove path in Canvas.svelte:185 does its own rAF throttle. Functionally close; timing model differs. |
| `_renderInteractiveScene` (overlay paint loop) | MATCH (role) | `drawSelection`/`drawGuides`/`drawMarquee` renderer.ts:1756-1886 + `render` renderer.ts:90-92 | interactiveScene.ts:1552-2076 | Same role: after elements, paint selection borders, transform handles, marquee, snap guides. Merged into our single pass vs Excal's separate canvas. |
| `renderSelectionElement` (the marquee/drag-selection rectangle) | MATCH | `drawMarquee` renderer.ts:1872-1885 | renderElement.ts:756-778 | Both: translucent fill + 1/zoom stroked rect in selection color. Excal hardcodes `rgba(0,0,200,0.04)` fill + 0.5/zoom offset for crisp 1px; ours uses `globalAlpha=0.09` over the shell selection color and no 0.5 offset. Same behavior, minor color/offset diff. |
| `renderSelectionBorder` (per-element selection outline, rotated, dashed for groups/remote, multi-pass for multi-color) | DIVERGENT (behavioral) | `drawSelection` renderer.ts:1756-1796 | interactiveScene.ts:947-1000 | Both stroke a rotated rect around each selected element, outset by padding (ours `3/zoom`; Excal `DEFAULT_TRANSFORM_HANDLE_SPACING*2/zoom`). Ours draws a solid 1.5/zoom accent outline per element + a plain union AABB for multi-select. Excal supports **layered multi-color dashed borders** (one stroke per remote collaborator color, lineDashOffset-staggered) and dashed for locked/remote/group. We have no collab/locking/groups, so single solid color is correct for our scope. |
| `renderTransformHandles` (resize squares + rotation circle, roundRect handles, selectionColor stroke) | MATCH | `drawSelection` handle loop renderer.ts:1810-1829 | interactiveScene.ts:1345-1386 | Both: white-filled handles stroked in selection color; rotation handle drawn as a filled circle; resize handles as small squares (Excal prefers roundRect 2/zoom corners, ours sharp `rect`). Both size handles in screen-constant units (Excal via `getTransformHandles(zoom)`, ours via `handleSizeWorld`). Same behavior; corner-rounding cosmetic. |
| rotation-handle stalk (line from top-mid to rotate handle) | MATCH | `drawSelection` renderer.ts:1798-1808 | (implicit in `getTransformHandles` spacing) interactiveScene.ts:1899-1905 | Excal positions the rotation handle above the box with a gap (no explicit stalk line — the gap is visual). Ours explicitly strokes a connector line from the `n` handle to the rotate handle. Behaviorally equivalent affordance; ours adds an explicit stalk. |
| multi-select union bounding box (dashed, transform handles on common bounds) | MATCH | `drawSelection` renderer.ts:1789-1796 + handles | interactiveScene.ts:1936-1983 | Both compute common bounds and draw a dashed/plain rect + corner handles for >1 selection. Excal dashes (`2/zoom`); ours strokes solid 1/zoom. Excal omits rotation handle when a frame is in the set; ours relies on editor-supplied handle list. Minor. |
| `getCommonBounds` multi-selection AABB | MATCH (delegated) | `scene.selectionBounds` (consumed at renderer.ts:1790) | interactiveScene.ts:1944 | We consume precomputed `selectionBounds`; Excal computes inline. Equivalent. |
| `renderFrameHighlight` (drop-target/frame-hover highlight) | DIVERGENT (cosmetic) | `drawDropTarget` renderer.ts:1737-1754 | interactiveScene.ts:1002-1030 | Both highlight a single hovered drop-target element. Excal strokes `rgb(0,118,255)` rounded rect at frame radius. Ours fills translucent accent + dashed accent stroke. Same role (reparent/frame drop hint), different look. |
| `renderSnaps` / alignment-guide overlay | MATCH (role) | `drawGuides` renderer.ts:1832-1870 | interactiveScene.ts:2030 (`renderSnaps`) | Both draw alignment/snap guide lines during drag. Ours draws guide lines with end-caps and dashes distribute-guides; Excal's `renderSnaps` (separate file) draws point/gap snaps. Same purpose; our guide algorithm is independent (see snapping axis). |
| `renderElementsBoxHighlight` (group/locked highlight) | ABSENT (intentional) | — | interactiveScene.ts:1032-1078 | No groups/locked-element highlighting in ours. |
| `renderLinearPointHandles` / `renderSingleLinearPoint` (per-point handles for lines/arrows) | ABSENT (intentional) | — | interactiveScene.ts:1080-1203, 196-224 | No linear/arrow element type in ours. |
| `renderBindingHighlightForBindableElement*` (arrow-binding suggestion highlights) | ABSENT (intentional) | — | interactiveScene.ts:226-931 | No arrows/bindings in ours. |
| `renderFocusPointIndicator` / connection line / circle (arrow focus points) | ABSENT (intentional) | — | interactiveScene.ts:1205-1343 | No arrows in ours. |
| `renderCropHandles` (image crop affordance) | ABSENT (intentional) | — | interactiveScene.ts:1388-1491 | No image cropping in ours. |
| `renderTextBox` / `renderResetAutoResizeHandle` (text-edit affordances) | ABSENT (intentional) | — | interactiveScene.ts:1493-1550 | No in-canvas text editing in ours. |
| `renderRemoteCursors` (collab cursors) | ABSENT (intentional) | — | interactiveScene.ts:2034-2040 | No collaboration in ours (single-user per CLAUDE.md). |
| scrollbars (`getScrollBars` + roundRect paint) | ABSENT (gap) | — | interactiveScene.ts:2042-2068 | Excal paints overlay scrollbars. Ours has none (relies on infinite-pan + zoom-to-fit). Real but minor UX gap. |
| search-match highlight rects | ABSENT (intentional) | — | interactiveScene.ts:1987-2028 | No canvas search in ours. |
| `getCornerRadius` (size-aware radius clamp) | MATCH | `roundRect` clamp renderer.ts:274-285 | utils.ts (getCornerRadius), used renderElement.ts:456 | Both clamp corner radius to half the min dimension. Ours: `Math.min(r, min(w,h)/2)`. Equivalent guard. |

### Divergences & gaps

Behavioral / bug-risk items worth tracking:

1. **No per-element render caching** (`generateElementWithCanvas`, renderElement.ts:603-663) — ABSENT
   by design. Ours redraws every visible element on every dirty paint. Fine for small single-user
   scenes and cheap vector glyphs, but there is no upper bound: a document with hundreds of richly
   detailed primitives will repaint all of them each frame during a drag. Severity: behavioral
   (perf), acceptable for stated scope, but the only structural perf risk in the renderer.

2. **Text wrapping diverges** (`drawText`/`wrapText` renderer.ts:543-584 vs renderElement.ts:546-595)
   — ours greedily word-wraps to `el.width`; Excal honors only explicit `\n` and never auto-wraps.
   Also ours has no RTL handling. For a wireframe-spec tool this is benign, but text laid out in our
   canvas will not match a faithful Excalidraw text element. Severity: behavioral.

3. **Throttle/dirty model differs** (Canvas.svelte:45-87 `$effect` vs `throttleRAF`,
   staticScene.ts:482-501). Both are dirty-driven (no constant rAF). Ours coalesces via Svelte's
   reactive flush (microtask); Excal coalesces via one rAF with latest-args. The pointermove handler
   (Canvas.svelte:185) adds its own rAF throttle, so high-frequency drags are frame-bounded. Net
   behavior matches "paint once per burst." Severity: cosmetic (timing).

4. **Selection border is single-color/solid** (`drawSelection` renderer.ts:1756-1796 vs
   `renderSelectionBorder` interactiveScene.ts:947-1000). Excal's layered multi-color dashed borders
   exist to show remote collaborators and locked/group state — none of which we have. Correct for
   scope; flagged so a future collab/lock feature knows to extend `drawSelection`. Severity:
   cosmetic.

5. **Scrollbars absent** (interactiveScene.ts:2042-2068). Minor UX gap; ours relies on zoom-to-fit
   and infinite pan. Severity: cosmetic.

6. **Image-smoothing toggle absent** (renderElement.ts:1000-1061). Mostly N/A (we draw vectors, not
   blits), but our raster icon/SVG/image paths (renderer.ts:854-962, 586-605) never set
   `imageSmoothingEnabled`. Low impact. Severity: cosmetic.

7. **Grid is dots, not dashed lines** (`drawGrid` renderer.ts:97-139 vs `strokeGrid`
   staticScene.ts:56-130). Both density-adapt to zoom with a major/minor tier; Excal also applies a
   0.5px crisp offset at zoom===1 that ours lacks. Pure visual-language choice. Severity: cosmetic.

No correctness **bug-risk** divergences were found in the rendering math itself: DPR handling
(Canvas.svelte:98-101 + renderer.ts:66-77), rotation-about-center (renderer.ts:150-155), screen-
constant stroke widths (`strokeWidthFor` renderer.ts:143-146), and radius clamping
(renderer.ts:282) all mirror Excalidraw's behavior correctly.

### Our extensions (no Excalidraw counterpart)

These exist only in ours because our product is a *semantic UI wireframe* tool, not a freehand
diagram tool:

- **~35 semantic primitive drawers** in renderer.ts — `drawButton` (variant-aware fills, embedded
  icon + centered label, 470-519), `drawInput` (522-541), `drawTable` (column/row skeleton, 607-649),
  `drawChart` (line/bar/pie/donut/area/scatter synthetic data, 651-740), `drawNav`/`drawSidebar`
  (413-468), `drawList` (742-777), `drawTabs` (779-821), `drawModal` (823-852), `drawCheckbox`/
  `drawRadio`/`drawToggle`/`drawSlider`/`drawDropdown` (1011-1161), `drawStatCard` (1163-1208),
  `drawBadge`/`drawProgress`/`drawAvatar`/`drawAlert`/`drawTooltip` (1210-1362),
  `drawBreadcrumb`/`drawPagination`/`drawStepper`/`drawAccordion` (1364-1551), and the marketing
  blocks `drawSectionHeader`/`drawHero`/`drawFeatureGrid`/`drawTestimonial`/`drawCtaSection`
  (1553-1733). None have an Excalidraw counterpart.
- **`drawEmbeddedIcon`** (renderer.ts:939-962) + **`drawIcon`/`drawSvg`** (854-934) — Phosphor/SVG
  path rasterization as a composable per-element property, with `parseViewBox` (964-970) and a
  sub-pixel skip (`size*zoom < 0.5`). Excalidraw has no equivalent "icon as element property."
- **`VARIANT_COLORS`** semantic palette (renderer.ts:1003-1009) + **`userStrokeWidth`** thin/bold/
  extra bucket resolution (288-292) + **`applyDash`** stroke-style buckets (295-307) — our style-token
  system, not present in Excal's roughjs-driven styling.
- **`labelText`** helper (renderer.ts:340-346) and the divider orientation-inference logic
  (`drawDivider` 972-999) — bespoke to our semantic elements.

The deeper extension noted in the prompt — the semantic Markdown export compiler
(`src/lib/export/to-markdown.ts`) — is the product's reason to exist and has no rendering-axis
counterpart in Excalidraw at all.
