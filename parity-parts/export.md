## Parity: export

Axis focus: visual SVG/PNG export of the scene, plus our semantic Markdown compiler (which has no
Excalidraw analogue). The two codebases pursue **different goals** for the visual export:

- **Excalidraw** renders a *pixel-faithful* SVG/canvas via roughjs + a shape cache, reproducing the
  exact hand-drawn look (stroke styles, roughness, bound text, frames, images, embeddables, dark
  mode filters, font inlining, scene-embed payloads).
- **Ours** (`to-svg.ts`) is explicitly a *best-effort approximate* visual reference ("not meant to
  be pixel-perfect"), drawing each semantic element as a plain rect/text/line/polyline. Our raster
  export (`to-png.ts`) reuses the *live Canvas 2D renderer* (`render()`), so it is faithful to OUR
  renderer, the way Excalidraw's `exportToCanvas` is faithful to ITS renderer.

So at the algorithm level, our SVG path is a parallel reimplementation, not a port. The
correspondences below judge behavioral intent (frame the content, pad it, paint in z-order,
honor rotation/opacity, deterministic numbers), not the hand-drawn fidelity Excalidraw layers on.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `getCanvasSize` (common bounds + padding ×2 → [minX,minY,w,h]) | MATCH | `to-png.ts:12` `contentBounds` + `rasterize` `to-png.ts:24-37` | `export.ts:564-573` | Both compute union bounds of all elements and add `padding*2` on each dimension. Ours uses `orientedBBox`+`unionBBox`; Excal uses `getCommonBounds`+`distance`. SVG side: ours uses a fixed `canvas.width/height + 80` frame instead (see divergence). |
| `getExportSize` (truncated w×h × scale) | DIVERGENT | `to-png.ts:36-41` | `export.ts:575-585` | Ours rounds `cssW/cssH` then multiplies by `scale` for the bitmap (`Math.round`); Excal `Math.trunc(dimension*scale)`. Rounding vs truncation differs by ≤1px. severity cosmetic. |
| `exportToCanvas` (offscreen raster, scrollX/Y offset, scale, bg, theme) | DIVERGENT | `to-png.ts:24-78` `rasterize` | `export.ts:176-280` | Same shape: create canvas at `size*scale`, offset content into a padded frame, render via the real renderer, paint bg, disable grid. Differences: ours has no dark-mode theme, no font preloading, no image cache, no frame-rendering config, and applies `maxDimension` clamp (Excal has none). severity behavioral (scope: single-user, no dark export, no embedded images). |
| `exportToSvg` (build `<svg>` root, viewBox, w/h×scale, bg rect, render elements) | DIVERGENT | `to-svg.ts:12-27` `compileToSvg` | `export.ts:289-506` | Both produce an `<svg>` with viewBox, width/height, a background rect, then per-element nodes. Ours omits: scene-embed metadata payload, font-face inlining, frame clip-paths, `exportScale`, dark-mode. Ours frames by `canvas.width/height+80` not by content bounds. severity behavioral. |
| `renderSceneToSvg` (paint-order iteration, skip deleted, skip bound text, embeddables on top) | DIVERGENT | `to-svg.ts:21-24` loop + `paintOrder` `to-svg.ts:29-48` | `staticSvgScene.ts:708-786` | Both iterate elements and emit one node each. Ours sorts by `(parentId tree, z, id)` depth-first; Excal relies on caller-provided fractional-index order and splits iframe-like to a second pass. Ours has no `try/catch` per element (a throw aborts the whole SVG). severity bug-risk (one malformed element aborts our entire SVG; Excal isolates failures). |
| `renderElementToSvg` (per-type SVG node: rect/diamond/ellipse/line/arrow/freedraw/image/text/frame/embeddable) | DIVERGENT | `to-svg.ts:56-199` `renderEl` | `staticSvgScene.ts:87-706` | Both are the per-element dispatch. Excal uses roughjs `ShapeCache` for hand-drawn shapes, supports bound text masks, image symbols/crop, embeddables, links; ours emits plain primitives for our richer semantic types (table/chart/list/input/button). Disjoint type sets — no shape is a literal match, but the *role* (one node per element, honoring transform+opacity) matches. severity behavioral. |
| rotation transform `rotate(degree cx cy)` | MATCH | `to-svg.ts:50-54` `transform` | `staticSvgScene.ts:99-117,163-167` | Both rotate about the element's bbox center. Excal computes `cx,cy` from `getElementAbsoluteCoords`; ours from `bboxCenter`. Excal degree = `180*angle/Math.PI` (angle already radians); ours `rotation*180/Math.PI`. Same formula, same pivot. |
| opacity attr (`stroke-opacity`/`fill-opacity` when !=1) | DIVERGENT | `to-svg.ts:62` | `staticSvgScene.ts:137-141,157-160` | Both gate on `opacity !== 1`. Excal folds in the *containing frame's* opacity (`frame.opacity * element.opacity / 10000`) and sets separate stroke/fill opacity; ours uses a single `opacity=` attr from `el.style.opacity` only (no frame compositing). severity cosmetic (we have no frame-opacity concept). |
| `truncateText` (ellipsize frame label to frame width) | ABSENT | — | `export.ts:65-94` | No equivalent. Our SVG draws container labels as a fixed-position `<text>` without measuring/truncating (`to-svg.ts:188-194`). Intentional per scope: we don't render frame name labels at all, and our labels are short region names. Minor gap. |
| `addFrameLabelsAsTextElements` (inject frame titles as text elements for export) | ABSENT | — | `export.ts:102-131` | No equivalent. Our frames become Markdown "Screen" headings; in SVG/PNG we draw the container box + optional label text inline, not a separate measured title element. Intentional per scope. |
| `getFrameRenderingConfig` / `prepareElementsForRender` (frame clip/outline/name toggles; export-single-frame; overlapping-frame filtering) | ABSENT | — | `export.ts:133-174,207-222` | No frame-rendering subsystem (no clip paths, no "export just this frame", no overlap filtering). Intentional: single-document export, no Excalidraw frames feature. |
| `encodeSvgBase64Payload` / `decodeSvgBase64Payload` (embed scene JSON in SVG metadata for round-trip) | ABSENT | — | `export.ts:508-561` | No scene-embed in SVG. Intentional: our round-trip format is the `.lfdoc` JSON file on disk, not an embedded SVG payload. |
| font-face inlining (`Fonts.generateFontFaceDeclarations`) | ABSENT | — | `export.ts:435-447` | Ours sets `font-family="Inter, system-ui, sans-serif"` on the `<svg>` and relies on viewer fonts; no `@font-face` data-URL inlining. severity cosmetic (text may render with a fallback font in an isolated viewer). |
| `applyDarkModeFilter` / `exportWithDarkMode` theme path | ABSENT | — | `export.ts:462-465`, `staticSvgScene.ts:388-392,624-627,679-683` | No dark-mode export. PNG always paints `doc.canvas.background` (`to-png.ts:68`). Intentional per scope (no theme toggle in product). |
| image `symbol`/`use` caching + crop mask + roundness clip | ABSENT | — | `staticSvgScene.ts:437-597` | Our `image` element in SVG falls through to a plain `box` rect (`to-svg.ts` has no `image` case → default), and `to-png.ts` relies on the live renderer. No dataURL embedding, no crop, no reuse-cache. severity behavioral (images export as empty boxes in SVG). |
| `maybeWrapNodesInFrameClipPath` (clip children to containing frame) | ABSENT | — | `staticSvgScene.ts:66-85` | No frame clipping. Children are not clipped to parents in our export. Intentional (no frames feature). |
| bound-text rendering (text bound to container/arrow, mask) | ABSENT | — | `staticSvgScene.ts:101-116,283-376,648-689` | No bound-text concept; our `text` is a standalone element. Intentional. |
| `MAX_DECIMALS_FOR_SVG_EXPORT` precision clamp on rough output | MATCH (intent) | `to-svg.ts:206-209` `round` (dp=0 coords, 2-4 for transform/scale) | `staticSvgScene.ts:50-64,155` | Both bound numeric precision for deterministic/compact SVG. Excal clamps roughjs decimal places; ours rounds every emitted coordinate to integers (or 2-4 dp for transforms/scale). Same goal (stable, low-precision numbers). |

### Divergences & gaps

1. **SVG framing differs from PNG framing and from Excalidraw (behavioral).**
   `to-svg.ts:14-20` frames the SVG by `doc.canvas.width/height + 80` with a fixed `viewBox="-40 -40 …"`,
   i.e. it frames the *document canvas*, not the *content bounds*. `to-png.ts` (and Excalidraw's
   `getCanvasSize`) frame by the **union of element bounds** + padding. Consequence: elements placed
   outside the nominal `doc.canvas` rectangle are clipped/offset in the SVG but correctly captured in
   the PNG. Two of our own exports disagree on framing. This is the most material divergence on this axis.

2. **No per-element error isolation in SVG (bug-risk).**
   `renderSceneToSvg` (`staticSvgScene.ts:734-761`) wraps each element in `try/catch` so one bad
   element does not abort the export. Our `compileToSvg` loop (`to-svg.ts:21-24`) calls `renderEl`
   directly; a throw (e.g. malformed `viewBox`/`svgPath` on an `icon`) aborts the entire SVG string.
   `parseVb` (`to-svg.ts:201-204`) is defensive, but other element branches assume well-formed data.

3. **Rounding vs truncation of export pixel size (cosmetic).**
   `getExportSize` uses `Math.trunc(dimension*scale)` (`export.ts:580`); ours rounds CSS dims then
   multiplies (`to-png.ts:36-41`). Off-by-one bitmap dimensions on fractional bounds; not visible.

4. **`maxDimension` clamp is ours-only (extension, but a behavioral divergence from Excal).**
   `to-png.ts:31-34` shrinks `scale` so neither side exceeds `maxDimension` (4096 for PNG, 360 for
   thumbnails). Excalidraw's `exportToCanvas` has no such cap (it multiplies by `exportScale`
   unconditionally). Reasonable for a thumbnail generator; means very large LayoutForge documents
   export at <2× where Excalidraw would honor the requested scale.

5. **Opacity compositing (cosmetic).** Excal multiplies element opacity by its containing frame's
   opacity (`staticSvgScene.ts:137-141`); we have no frame-opacity, so a single `opacity=` attr
   suffices. Not a gap given our model.

6. **Images export as empty boxes in SVG (behavioral).** Our `image` element type has no case in
   `renderEl`, so it hits the `default` branch and draws a bordered box (no raster). Excal embeds the
   dataURL via `<symbol>/<use>`. PNG export is fine (live renderer draws images), but the SVG visual
   reference loses image content. Likely a real (if minor) gap, since `image` is a supported element type.

7. **Font inlining / dark mode / scene-embed are all absent**, all intentional per LayoutForge scope
   (single-user, no theme toggle, JSON round-trip on disk, portable visual reference only).

### Our extensions (no Excalidraw counterpart)

- **`compileToMarkdown` — the semantic Markdown layout-spec compiler (`to-markdown.ts:34-75`).**
  THE product. No Excalidraw analogue whatsoever. Excalidraw exports pixels/JSON; we export *layout
  intent* as a Claude-Code brief. Supporting algorithms, all extensions:
  - `buildForest` (`to-markdown.ts:95-127`): orphan/cycle-safe parent grouping with `effectiveParent`
    fallback (missing/non-container parents reparent to root) and a `visited` cycle guard.
  - `geometricOrder` (`to-markdown.ts:134-141`): banded top-to-bottom, then left-to-right reading
    order with a 12px row tolerance and id tiebreaker — a determinism primitive with no Excal peer.
  - `resolveIntent` / `inferMode` / `inferGap` / `inferGridCols` / `clusterCount` / `similarSizes`
    (`to-markdown.ts:574-662`): geometry → flex/grid/flow + gap + column-count inference.
  - `childSizingHint` (`to-markdown.ts:277-329`): infers grow/fixed/hug + cross-axis stretch per child.
  - `sizingDescriptor` / `regionDescriptor` / `leafDescriptor` / `containerSublines`
    (`to-markdown.ts:227-566`): semantic per-type descriptors for ~40 element types.
  - `layoutSentence` / `layoutClause` / `responsiveClause` (`to-markdown.ts:666-712`): natural-language
    layout + responsive directives.
  - `implementationInstructions` (`to-markdown.ts:716-738`): the deterministic SvelteKit/Svelte-5
    instruction footer.
  - `quote` (`to-markdown.ts:747-750`): whitespace-normalizing, determinism-preserving string quoter.
- **`makeThumbnail` (`to-png.ts:111-118`)**: small base64 PNG for the LibraryView grid. Excalidraw has
  thumbnailing elsewhere, but not in this export module.
- **Semantic-element SVG primitives in `renderEl` (`to-svg.ts:112-185`)**: table/chart/list/input/button
  draw bespoke approximations (header rows, axis polylines, bar/line series, placeholder text). No
  Excal counterpart — Excalidraw has no such high-level UI element types.
