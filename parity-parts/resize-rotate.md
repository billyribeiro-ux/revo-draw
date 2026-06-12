## Parity: resize-rotate

Scope: resize math (single element, rotated-local-frame, multi-AABB scale), aspect lock,
resize-from-center, and rotation. OUR implementation is the editor controller
`src/lib/canvas/editor.svelte.ts`; the Excalidraw counterpart is
`excalidraw-master/packages/element/src/resizeElements.ts`.

Framework note: Excalidraw is React + a rich element model (linear/freedraw/elbow-arrow/text
containers/image-scale/bindings). Ours is a hand-rolled Canvas-2D semantic-layout tool whose
elements are all rectangles with `x,y,width,height,rotation`. We have no linear elements, no
bound-text auto-sizing, no bindings, no image-scale, no freedraw. So a large portion of
Excalidraw's resize machinery is type-specific bookkeeping that is genuinely out of scope for us.
The judgment below is on the *geometric resize/rotate behavior*, not the per-type plumbing.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `transformElements` (dispatch: 1 vs N, rotation vs resize) | MATCH | `editor.svelte.ts:740-745` (`#updateResize` splits sole-rotated vs AABB) + `:895-919` (`#updateRotate`) | `resizeElements.ts:87-201` | Same dispatch shape: single-rotated path, multi/AABB path, single-rotation path, multi-rotation path. Ours is split across pointer-phase methods instead of one fn. |
| `rotateSingleElement` | MATCH | `editor.svelte.ts:895-919` (`#updateRotate`, used for N=1 too) | `resizeElements.ts:203-266` | Angle from `atan2(pointer-center)`; shift → discrete-angle snap. See divergence on angle convention + snap step. |
| `rotateMultipleElements` (rotate each element's center about selection center, add delta) | MATCH | `editor.svelte.ts:895-919` (`#updateRotate`) | `resizeElements.ts:404-488` | Both rotate each element center about the group center and offset angle by `centerAngle + origAngle`. See divergence on incremental vs absolute formulation. |
| `getNextSingleWidthAndHeightFromPointer` (rotate pointer into local frame, scale from anchor) | MATCH | `editor.svelte.ts:822-882` (`#updateResizeRotated`) | `resizeElements.ts:928-1020` | Same core idea: un-rotate pointer about center, move dragged edges in local space, keep opposite edge fixed. See divergences on resize-from-center and aspect-lock-via-max-ratio. |
| `resizeSingleElement` (apply width/height + recompute origin so anchor is fixed) | MATCH | `editor.svelte.ts:822-882` (`#updateResizeRotated`) + `:740-813` (`#updateResize` for unrotated) | `resizeElements.ts:722-926` | Anchor-preserving origin recompute. Ours derives origin via local anchor → world; Excalidraw via `getResizedOrigin` trig. Equivalent geometry. |
| `getResizedOrigin` / `getResizeAnchor` (anchor lookup per handle+modifier) | MATCH (behavioral equiv) | `editor.svelte.ts:859-874` (anchor = opposite local corner) and `:773-786` (center anchor) | `resizeElements.ts:573-720` | Excalidraw enumerates anchors as a closed-form trig table; ours computes the opposite corner/edge directly in the local frame and rotates. Same resulting anchor for the unrotated and rotated cases. |
| `getNextMultipleWidthAndHeightFromPointer` (common-bbox scale from anchor, flip flags) | DIVERGENT | `editor.svelte.ts:740-813` (`#updateResize` AABB branch) | `resizeElements.ts:1022-1147` | Both scale a common AABB from the opposite-side anchor. Ours derives scale from edge deltas (`width = right - x`), Excalidraw from `|pointer - anchor| / dim`. Ours has NO flip support (negative-size mirror). See divergences. |
| `resizeMultipleElements` (scale each element x/y about anchor; per-type updates) | DIVERGENT | `editor.svelte.ts:803-812` (scale loop in `#updateResize`) | `resizeElements.ts:1149-1500` | Same affine: `nx = anchor + offset*scale`. Ours scales x and y independently per handle; Excalidraw forces uniform scale (`keepAspectRatio`) when any element is rotated/grouped/text. See divergences. |
| `measureFontSizeFromWidth` / `resizeSingleTextElement` (font scales with box) | ABSENT | — | `resizeElements.ts:285-402` | Out of scope: our text elements don't auto-scale font on resize. Intentional. |
| `rescalePointsInElement` (rescale linear/freedraw point arrays) | ABSENT | — | `resizeElements.ts:268-283` | Out of scope: no linear/freedraw elements. Intentional. |
| `getResizeOffsetXY` (pointer→handle offset in element-local space) | ABSENT | — | `resizeElements.ts:490-547` | Not needed: ours uses raw pointer deltas / local-frame pointer directly; no separate offset capture. Acceptable. |
| `getResizeArrowDirection` (which end of a linear arrow is being resized) | ABSENT | — | `resizeElements.ts:549-560` | Out of scope: no arrows. Intentional. |
| Bound-text / binding / elbow-arrow / image-scale handling | ABSENT | — | `resizeElements.ts` (scattered) | Out of scope: no bindings/containers/images-with-scale. Intentional. |

### Divergences & gaps

1. **No flip (negative-dimension mirror) on resize — `severity: behavioral`.**
   Excalidraw permits dragging a handle past the opposite side: width/height go negative,
   `flipByX/flipByY` are computed (`resizeElements.ts:1117-1138`), points/positions mirror, and
   in single-element resize the origin is shifted by the negative dimension
   (`resizeElements.ts:845-850`). Ours clamps in every path: unrotated AABB clamps `width/height`
   to `MIN_SIZE` (`editor.svelte.ts:797-798`); rotated single clamps the dragged edge against the
   opposite edge minus `MIN_SIZE` (`editor.svelte.ts:840-843`); multi scales by `width/origin.width`
   which can never go negative. Result: in ours you can never flip a shape by overshooting a handle;
   the box just collapses to the minimum and stays oriented. This is a deliberate simplification for
   a layout tool (flipping a semantic block is rarely wanted) but it IS a behavioral divergence from
   Excalidraw.

2. **Resize-from-center not applied in the rotated-single path — `severity: bug-risk`.**
   Excalidraw applies `shouldResizeFromCenter` uniformly: in
   `getNextSingleWidthAndHeightFromPointer` it doubles the delta
   (`nextWidth = 2*nextWidth - origElement.width`, `resizeElements.ts:996-999`) and the anchor
   becomes `"center"` in `getResizeAnchor` (`resizeElements.ts:578-580`). Ours honors alt-resize-
   from-center ONLY in the unrotated AABB branch (`editor.svelte.ts:773-786`). In
   `#updateResizeRotated` (`editor.svelte.ts:822-882`) `this.#altHeld` is never read — alt is
   ignored, so resizing a *rotated* element with alt held does not expand from center. For a single
   rotated element this is a missing edge case (silent no-op of the modifier), hence bug-risk.

3. **Aspect-lock algorithm differs (corner ratio vs max-ratio) — `severity: behavioral`.**
   Excalidraw single-element aspect lock for a corner handle (`handleDirection.length === 2`) uses
   `ratio = Math.max(widthRatio, heightRatio)` and rescales BOTH dims by that ratio
   (`resizeElements.ts:1009-1013`), so the box follows whichever axis the pointer pushed further.
   Ours (`editor.svelte.ts:789-795` AABB, `:849-857` rotated) picks the *driving* axis by comparing
   `|width|/ar` vs `|height|`: if width is "ahead" it derives height from width, else width from
   height. These agree in the common diagonal-drag case but diverge near the aspect diagonal: the
   max-ratio rule always grows to the larger of the two, ours can shrink one axis to match the other.
   Also Excalidraw handles 1-D (side) handles under aspect lock by cross-scaling
   (`nextHeight *= widthRatio; nextWidth *= heightRatio`, `resizeElements.ts:1005-1008`); ours runs
   the same corner-style branch for side handles, which for a pure side drag yields a slightly
   different coupled dimension. Both are "reasonable aspect lock," but not byte-identical.

4. **Multi-element resize does not force uniform scale for rotated/grouped members —
   `severity: bug-risk`.**
   Excalidraw sets `keepAspectRatio = shouldMaintainAspectRatio || any element is rotated || text ||
   in a group` and, when true, forces `scaleX = scaleY = scale` (`resizeElements.ts:1306-1318`).
   Reason: scaling a rotated child by independent x/y factors *skews* it (a rotated rectangle is no
   longer a rectangle under non-uniform scale). Ours always applies independent `sx`/`sy` in the
   multi branch (`editor.svelte.ts:800-812`) and never special-cases rotated members — and critically
   our multi-AABB scale leaves each element's `rotation` untouched while changing only `x,y,w,h`. So
   a multi-selection that contains a rotated element resized non-uniformly will distort that element's
   apparent box (the stored w/h scale per-axis while the rotation is fixed). This is a real
   correctness gap for the (admittedly uncommon) multi-select-with-rotated-member resize.

5. **Rotation angle convention & normalization differ — `severity: cosmetic`.**
   Excalidraw computes an *absolute* target angle `(5π/2 + atan2(dy,dx))` and normalizes to
   `[0, 2π)` via `normalizeRadians` (`resizeElements.ts:220-226`, `415-420`, `448`). Ours computes a
   *delta* from the gesture-start pointer angle and adds it to the stored base
   (`editor.svelte.ts:898-906`), never normalizing (angles can accumulate outside `[0,2π)`). Visually
   identical rotation; the difference is only the stored numeric range. For a single-user canvas with
   no angle-equality checks this is cosmetic, but downstream code comparing raw `rotation` values
   should be aware ours is unnormalized.

6. **Discrete-angle (shift) snap: same 15° step, different rounding — `severity: cosmetic`.**
   Both snap to 15° (π/12) when shift is held. Excalidraw uses `SHIFT_LOCKING_ANGLE` and
   `angle += step/2; angle -= angle % step` (floor-after-bias, `resizeElements.ts:222-225`). Ours uses
   `Math.round(delta / step) * step` (`editor.svelte.ts:903-906`). Round-to-nearest and bias-then-floor
   produce the same bucket for all inputs (both are "nearest multiple"), so behavior matches; the only
   subtlety is ours snaps the *delta* while Excalidraw snaps the *absolute* angle, so ours only lands on
   true 15° gridlines when the element started at a 15°-aligned angle. Minor.

7. **`MIN_SIZE` floor vs Excalidraw's per-type minimums — `severity: cosmetic`.**
   Ours floors every resize to `MIN_SIZE = 4` world units (`editor.svelte.ts:119`, applied at
   `:797-798`, `:840-843`, `:877-881`). Excalidraw has no single global min in this file — it rejects
   `nextWidth/Height === 0` (`resizeElements.ts:875-880`, `1185`) and applies type-specific minimums
   (font size, bound-text approx line width/height, `resizeElements.ts:784-794`). For our
   rectangle-only model a flat 4px floor is a reasonable stand-in; acceptable.

### Our extensions (no Excalidraw counterpart in this file)

- **Sole-vs-AABB resize dispatch via `soleSelected` + `sole` drag field**
  (`editor.svelte.ts:211-215`, `:729-737`, `:742-745`): we explicitly branch a *single rotated*
  element into a local-frame resize and everything else into AABB scaling. Excalidraw reaches the
  same outcome through `getResizedElementAbsoluteCoords` + `getResizedOrigin` rather than a top-level
  branch. Our split is a structural extension, not a behavioral one.
- **Drop-target reparenting during resize? No** — but `#dropTargetUnder` / reparent on move
  (`editor.svelte.ts:683-709`, `:416-430`) is a layout-tool extension with no resize-time analog in
  Excalidraw's file.
- **`cursorForHandle` rotation-aware resize cursor** (`editor.svelte.ts:1047-1063`): maps handle +
  element rotation to one of four bidirectional CSS cursors. Excalidraw computes resize cursors
  elsewhere (not in `resizeElements.ts`); within this axis it's effectively ours.
- **`gestureActive` reactive flag** (`editor.svelte.ts:154`, `:245`) so the style panel hides during
  any transform — a UI concern with no element-layer counterpart.
- **Single history transaction per gesture** (`editor.svelte.ts:714`, `:456-459`): begin on
  resize/rotate start, commit on pointerup, so a whole drag is one undo. Excalidraw's history is
  driven by the app-level store, not this file.
- **Everything in world-space, camera as the single conversion point** (`editor.svelte.ts:255`,
  `:337`): a deliberate architectural choice; Excalidraw mixes scene + viewport coords.
