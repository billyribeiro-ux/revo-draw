## Parity: snapping

Axis focus: alignment guides, equal-spacing distribution, snap thresholds, alt/modifier bypass.

OUR file: `/Users/billyribeiro/development/revo-draw/src/lib/canvas/snapping.ts` (216 lines, pure function `resolveSnap` + helper `detectEqualSpacing`).

EXCAL file: `/Users/billyribeiro/development/revo-draw/excalidraw-master/packages/excalidraw/snapping.ts` (1415 lines).

The two implementations solve the same UX problem (snap a moving/resizing box to neighbors, surface guide lines, do equal-spacing distribution) but with structurally different models:

- Ours is **AABB feature lines** (3 per axis: left/center/right edge) compared against every other box's 3 feature lines, axis-independent, single pure pass. World-space throughout, threshold passed in world units by the caller.
- Excalidraw is **corner point snapping** (`PointSnap`, rotated corners + center) plus a separate **gap snapping** model (`GapSnap`) built from precomputed `Gap` structures cached in `SnapCache`. Two-pass (compute offset, then recompute lines at snapped position). Threshold is `SNAP_DISTANCE=8` screen px divided by zoom.

Excalidraw's "gap" model and ours' "equal-spacing" model are the closest conceptual cousins but are NOT the same algorithm (see Divergences).

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `getSnapDistance(zoom)` — `SNAP_DISTANCE/zoom` | MATCH | snapping.ts:52-57 (`SnapConfig.thresholdWorld`, doc says caller converts screen px via zoom) | snapping.ts:48-50, const 41 | Same zoom-independent feel. Ours delegates the screen-px→world division to the caller; Excal bakes `8/zoom` here. Same result. |
| `isSnappingEnabled(...)` / alt/modifier bypass | DIVERGENT | snapping.ts:14 (doc) + caller in editor.svelte.ts | snapping.ts:162-192 | See divergences. Bypass key differs (we use Alt/skip-call; Excal uses CMD/CTRL toggle vs. a persisted snap-mode, plus lasso/arrow special cases). |
| `getPointSnaps(...)` — nearest edge/center point snap per axis | MATCH | `resolveSnap` align loops snapping.ts:80-104 | snapping.ts:636-690 | Same core: minimize abs offset independently per axis, keep nearest. Ours uses 3 feature lines/axis; Excal uses corner points incl. rotated corners + center. |
| `getElementsCorners(...)` — rotated corners + center; diamond/ellipse mid-edges | DIVERGENT | `xFeatures`/`yFeatures` snapping.ts:45-50 | snapping.ts:198-313 | Ours = axis-aligned edges+center only; no rotation, no shape-specific midpoints. Per-scope acceptable but a behavioral gap for rotated/ellipse elements. |
| `getVisibleGaps(...)` — build all pairwise gaps per axis, cached | DIVERGENT | `detectEqualSpacing` snapping.ts:160-215 | snapping.ts:328-444 | Ours computes nearest left/right (top/bottom) neighbor on the fly; no cache, no all-pairs gap set. |
| `getGapSnaps(...)` — center-of-gap + side (left/right/top/bottom) snapping | DIVERGENT | `detectEqualSpacing` snapping.ts:160-215 | snapping.ts:446-614 | Both do equal-spacing, but Excal snaps to gap CENTER and to MATCHING a neighbor's gap length (side snaps); ours only equalizes the two immediate gaps. Different feature set. |
| `snapDraggedElements(...)` — orchestrator for drag, two-pass | DIVERGENT | `resolveSnap` snapping.ts:63-148 | snapping.ts:692-807 | Ours is single-pass; Excal recomputes snaps at snapped position to draw lines without shift. See divergences. |
| `snapResizingElements(...)` — snap during resize handles | ABSENT | — | snapping.ts:1108-1244 | Our `resolveSnap` is move-only by signature (takes a Candidate box, returns top-left). Resize snapping not wired here. Likely real gap if resize snapping is in scope. |
| `snapNewElement(...)` — snap while drawing a new element | ABSENT | — | snapping.ts:1246-1316 | No equivalent entry point. |
| `getSnapLinesAtPointer(...)` — crosshair pointer snap lines | ABSENT | — | snapping.ts:1318-1400 | Intentional: no pointer-crosshair snapping feature in our scope. |
| `createPointSnapLines(...)` — group point snaps into rendered lines | MATCH (partial) | guide construction snapping.ts:109-133 | snapping.ts:828-896 | Both produce a guide line spanning aligned features. Ours emits `SnapGuide{axis,position,from,to}` directly; Excal groups by coordinate key and dedupes. Same intent. |
| `createGapSnapLines(...)` — render gap distribution guides | DIVERGENT | spacing guides snapping.ts:183-186, 206-209 | snapping.ts:915-1106 | Ours emits two `distribute` guide segments (the two gaps). Excal renders per-direction segment pairs with intersection clamping. Conceptually similar, geometrically different. |
| `areRoughlyEqual(a,b,prec=0.01)` | DIVERGENT | inline `Math.abs(gapL-gapR) <= tol*2` snapping.ts:178,201 | snapping.ts:194-196 | Ours uses a configurable spacing tolerance (`tol*2`); Excal uses a fixed 0.01 epsilon for the resize-angle guard, not for gap equality. |
| `round(x)` — 6-decimal rounding for determinism | ABSENT | — | snapping.ts:809-812 | Ours does not round snap coordinates; relies on float math. Cosmetic — could cause sub-pixel guide jitter vs. Excal's stable rounded coords. |
| `dedupePoints` / `dedupeGapSnapLines` | ABSENT | — | snapping.ts:814-826, 898-913 | Ours can emit duplicate/overlapping guides (one per axis per snap); no dedupe pass. Minor visual. |
| `SnapCache` (static reference points + gaps cache) | ABSENT (intentional) | — | snapping.ts:122-155 | Ours recomputes every call (pure). Excal caches across a drag gesture for perf on large scenes. Per-scope: acceptable for single-user small docs; perf gap at scale. |
| `isActiveToolNonLinearSnappable(...)` | ABSENT (intentional) | — | snapping.ts:1402-1414 | Tool-gating lives in our `editor.svelte.ts` controller, not in the pure module. |

### Divergences & gaps

1. **Alt bypass vs. CMD/CTRL toggle (behavioral).** Our module's contract (snapping.ts:14) is "holding the bypass modifier (alt) simply skips calling this" — snapping is ON by default, Alt disables. Excalidraw (`isSnappingEnabled`, snapping.ts:162-192) inverts this: snapping is OFF by default behind a persisted `objectsSnapModeEnabled` setting, and `CTRL_OR_CMD` toggles it (enables when off, disables when on). Excal also special-cases lasso dragging and refuses single-arrow snapping (give way to binding). Different default and different key. severity: behavioral.

2. **Equal-spacing model is narrower than gap snapping (bug-risk).** Ours (`detectEqualSpacing`, snapping.ts:160-215) only handles the case where the candidate sits BETWEEN a left and right (or top and bottom) neighbor and equalizes those two gaps. Excalidraw's gap model (snapping.ts:446-614) additionally supports: (a) snapping the selection's CENTER to the center of a gap larger than the selection (`center_horizontal`/`center_vertical`), and (b) SIDE snaps that match the selection's distance-to-a-neighbor to an existing gap length elsewhere (`side_left/right/top/bottom`) — i.e. "make this gap equal to that other gap" even when the candidate is not nestled between two elements. Ours produces no snap in those configurations. severity: bug-risk (missing common distribution affordance, not a crash).

3. **Spacing equality tolerance differs from threshold semantics (behavioral).** Ours gates equal-spacing on `Math.abs(gapL - gapR) <= tol*2` (snapping.ts:178, 201) using a separate `spacingToleranceWorld`. Excalidraw does not pre-gate by gap-difference; it computes the offset needed and keeps it iff `|offset| <= minOffset` (the snap distance), competing directly against point snaps on the same axis budget. So Excal's gap snap and point snap share one threshold and the smallest offset wins; ours runs alignment first (snapping.ts:80-133) and then ADDITIONALLY applies spacing on top (snapping.ts:136-145), which can move the box twice on the same axis (align then re-distribute) rather than picking the single nearest snap. severity: behavioral.

4. **Single-pass vs. two-pass guide computation (cosmetic).** Excalidraw computes the snap offset, then resets and recomputes snaps at the snapped position so the rendered lines don't shift (snapping.ts:756-793). Ours builds guides in the same pass using the post-snap `resultX/resultY` (snapping.ts:112-133), which is mostly equivalent for align guides but the distribute guides are computed against the already-aligned position (snapping.ts:136-140) — acceptable. severity: cosmetic.

5. **No rotation / shape-aware snap points (behavioral).** `xFeatures`/`yFeatures` (snapping.ts:45-50) assume axis-aligned boxes. Excalidraw's `getElementsCorners` (snapping.ts:198-313) rotates corners by `element.angle` and uses mid-edge points for diamonds/ellipses. Rotated elements snap by their visual extent in Excal; ours snaps by the unrotated AABB. severity: behavioral (only matters once rotation is exercised; rotation IS supported in our editor per repo map).

6. **No determinism rounding / dedupe (cosmetic).** Excal rounds all coords to 6 decimals (snapping.ts:809-812) and dedupes guide lines. Ours emits raw floats and can push duplicate guides. severity: cosmetic.

7. **Resize and new-element snapping absent (behavioral gap).** `resolveSnap` only returns an adjusted top-left for a moving box. Excal has dedicated `snapResizingElements` (1108) and `snapNewElement` (1246). If the editor expects snap feedback during resize/draw, that path is unimplemented in this module. severity: behavioral (verify against editor.svelte.ts before calling it a hard gap).

### Our extensions

- **`SnapGuide.kind: 'align' | 'distribute'` tagging** (snapping.ts:26-27): ours emits a single typed guide object carrying its own draw extent (`from`/`to`) and a semantic kind. Excalidraw splits this across `PointSnapLine` / `GapSnapLine` / `PointerSnapLine` union types. Our shape is purpose-built for the hand-rolled Canvas 2D renderer.
- **Self-contained `from`/`to` extent on every guide** (snapping.ts:113, 125): ours computes the guide segment span (min/max of candidate + aligned others) inline so the renderer needs no element lookup. Excal computes line endpoints inside `create*SnapLines`.
- **Pure `(candidate, others, config) -> {x,y,guides}` signature** with no `AppState`, no `SnapCache`, no React `app` handle — directly unit-testable, matching our "pure pass" doc (snapping.ts:13). This is a deliberate architectural simplification, not a feature.
