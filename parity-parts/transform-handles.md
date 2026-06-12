## Parity: transform-handles

Axis focus: placement/sizing of the 8 resize handles + the rotate handle, and the outside-the-box margin that keeps the element body draggable.

Sources read in full:
- Ours: `src/lib/canvas/hit-test.ts` (handle geometry: `selectionHandles`, `orientedHandles`, `hitHandle`) plus the call sites in `src/lib/canvas/editor.svelte.ts` (margin / radius / rotate-offset derivation).
- Excalidraw: `excalidraw-master/packages/element/src/transformHandles.ts`.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `generateTransformHandle` (rotate a handle center about box center) | MATCH | `hit-test.ts:75,87-96` (`place` = `rotate(pt, rotation, c)`) | `transformHandles.ts:95-110` | Both rotate the handle anchor about the box center by the element angle. Ours stores a center point; Excal returns a `[x,y,w,h]` rect (handle drawn as a box), but the anchor math is identical. |
| `getTransformHandlesFromCoords` (compute 8 + rotation handle positions, outside-box margin) | DIVERGENT (cosmetic→behavioral) | `selectionHandles` `hit-test.ts:38-61`; `orientedHandles` `hit-test.ts:68-97` | `transformHandles.ts:133-270` | Same conceptual algorithm: corners/midpoints inflated outward by a margin, rotation handle above the top-center. Differences: (1) ours always emits all 8 side+corner handles; Excal omits N/S/W/E unless the box exceeds `minimumSizeForEightHandles` (`transformHandles.ts:218-220`). (2) Excal also omits cardinal sides by default via `DEFAULT_OMIT_SIDES` (sides shown only when `canResizeFromSides`). Ours has no omit mechanism. (3) Margin: ours uses a single constant-screen `HANDLE_SCREEN_PX=9` margin; Excal composes `dashedLineMargin + handleMargin - centeringOffset` (`:158`). All zoom-divided so screen-constant in both. |
| Zoom-independent handle sizing (`size / zoom.value`) | MATCH (different layer) | `editor.svelte.ts:193-198,225,289` via `camera.screenDistanceToWorld(...)` | `transformHandles.ts:142-152` | Both keep handle size + hit radius constant on screen by dividing by zoom (ours converts a fixed screen-px distance to world). Equivalent behavior. |
| Rotation-handle gap above top edge (`ROTATION_RESIZE_HANDLE_GAP = 16`) | MATCH | `editor.svelte.ts:117` `ROTATE_OFFSET_SCREEN=26`; applied `hit-test.ts:59,95` (`y - rotateOffsetWorld`) | `transformHandles.ts:55,199-213` | Both place the rotate handle at top-center, offset upward by a screen-constant gap. Magnitude differs (ours 26px from box top; Excal 16px gap *plus* the handle/dashed margins). Cosmetic, not behavioral. |
| `getTransformHandles` (per-element omit rules: locked, elbow arrow, linear, frame, image margins) | DIVERGENT (behavioral) | `editor.svelte.ts:221-230` (`currentHandles`) | `transformHandles.ts:272-326` | Ours has no per-type omit/margin logic: every selected element gets the full 8+rotate set with one margin. Excal returns `{}` for locked/elbow-arrow, special-cases linear/freedraw via `OMIT_SIDES_FOR_LINE_*`, removes rotation for frames, and uses `margin = 0` for images / `SPACING+8` for linear. Most of this is out-of-scope for our element model (no arrows/freedraw/frames-with-no-rotation), but the locked case differs — see Divergences. |
| `canResizeFromSides` / `getOmitSidesForEditorInterface` (mobile/phone side-resize gating) | ABSENT | — | `transformHandles.ts:112-131` | Intentional. Single-user desktop (Tauri/macOS) app; no phone/touch form-factor gating in scope. |
| `hasBoundingBox` (whether to show the selection bbox at all) | ABSENT | — | `transformHandles.ts:328-354` | Intentional. Logic is about linear-element editing / mobile, neither of which exists in our element set. Ours always shows handles for a selection. |
| `OMIT_SIDES_FOR_*` / `DEFAULT_OMIT_SIDES` constants | ABSENT | — | `transformHandles.ts:57-93` | Intentional given no arrows/lines/frames; but their absence is also why our 8-handle set is unconditional (see DIVERGENT row 2). |
| `transformHandleSizes` per-pointer (mouse 8 / pen 16 / touch 28) | DIVERGENT (cosmetic) | `editor.svelte.ts:116` `HANDLE_SCREEN_PX=9` (single size) | `transformHandles.ts:49-53` | Ours uses one handle size for all input. Excal scales hit/visual size by pointer type (bigger for pen/touch). Desktop-mouse-only scope, so cosmetic. |
| `hitHandle` (find handle under pointer) | EXTENSION-ish / no direct Excal counterpart in this file | `hit-test.ts:100-111` | (Excal hit-tests handles elsewhere, e.g. `resizeTest`) | Ours does nearest-center-within-radius; Excal’s file produces handle *rects* and hit-tests them in a separate module. Behaviorally compatible (point-in-handle vs nearest-within-radius). |

### Divergences & gaps

1. **Unconditional 8 handles vs size-gated side handles** — *severity: behavioral.*
   Excal only adds N/S (`transformHandles.ts:220-243`) and W/E (`:244-267`) when `Math.abs(width|height) > minimumSizeForEightHandles` (= `5 * 8 / zoom`). Below that, only the 4 corners + rotation appear, so a tiny element doesn’t get crowded with overlapping side handles. Ours (`hit-test.ts:50-60`, `86-96`) always returns all 8 + rotate regardless of size. On a very small element our four side-midpoint handles can sit nearly on top of corner handles, and `hitHandle` (nearest-center) will arbitrate between them — a subtly different resize affordance than Excalidraw. Mitigated in ours by the outside-the-box margin (which is the actual fix for "small element body undraggable"), but the size-gating itself is not replicated.

2. **No omit-sides / per-type rules; locked elements still show handles** — *severity: behavioral.*
   Excal `getTransformHandles` returns `{}` for `element.locked` (`transformHandles.ts:282-288`), so a locked element shows no resize/rotate affordance. Our `currentHandles` (`editor.svelte.ts:221-230`) builds handles for whatever is selected. Note `hitTestPoint`/`hitTestMarquee` (`hit-test.ts:120,134`) already skip `el.locked`, so a locked element generally can’t become the sole selection — but if it is selected by other paths, handles would still render. Worth a guard. Arrows/freedraw/frame omit rules are out-of-scope (those element types don’t exist in our `SemanticType` model).

3. **Margin composition differs** — *severity: cosmetic.*
   Ours uses a single screen-constant margin `HANDLE_SCREEN_PX (=9px)` inflating the box symmetrically (`hit-test.ts:43-49`, `79-85`). Excal composes `dashedLineMargin (margin/zoom) + handleMargin (size/zoom) - centeringOffset ((size - spacing*2)/(2*zoom))` and additionally centers each handle by `±handleWidth/2`. Net outward offset and exact handle pixel positions therefore differ by a few px. Both are zoom-invariant; visual placement is close but not pixel-identical.

4. **Rotate-handle offset magnitude differs** — *severity: cosmetic.*
   Ours: `ROTATE_OFFSET_SCREEN = 26px` measured from the (inflated) box top (`editor.svelte.ts:117`, `hit-test.ts:59,95`). Excal: `ROTATION_RESIZE_HANDLE_GAP = 16px` *added on top of* the dashed-line + handle margins (`transformHandles.ts:199-213`). Direction and screen-constancy match; the absolute gap differs.

5. **Pointer-type handle sizing** — *severity: cosmetic.* Ours has one size; Excal scales for pen/touch (`transformHandles.ts:49-53`). Out of scope for a desktop mouse app.

### Our extensions (no Excalidraw counterpart in this file)

- `hitTestPoint` (`hit-test.ts:117-124`) — topmost-element pick in oriented box, back-to-front; Excalidraw’s equivalent lives in other modules, not `transformHandles.ts`.
- `hitTestMarquee` (`hit-test.ts:131-139`) — full-containment marquee selection (documented to match Excal `selection.ts:219` "contain" mode); an extension relative to *this* file.
- `marqueeRect` (`hit-test.ts:142-149`) — normalize a drag into a positive-area rect. No counterpart here.
- `pointInElement` (`hit-test.ts:152-154`) and `elementCorners` (`hit-test.ts:157-159`) — oriented hit / corner polygon helpers for our hand-rolled Canvas 2D renderer.
- `hitHandle` (`hit-test.ts:100-111`) — nearest-center-within-radius handle pick; Excal hit-tests handle rects in a separate resize module, so ours is a self-contained equivalent rather than a port of code in this file.

### Summary

Core geometry (rotate-about-center handle placement, outside-box margin, top-center rotate handle, zoom-invariant sizing) is a faithful behavioral match. The meaningful gaps are the **size-gated side handles** and **per-element omit rules (locked / type-specific)**, both behavioral; the rest are cosmetic offset/sizing constants or intentionally-out-of-scope features (mobile gating, linear/frame/arrow handling, `hasBoundingBox`).
