## Parity: drag-move

Axis: pointer move gesture, drag threshold, group/subtree move, drag-from-center (alt).

Scope note: Excalidraw's drag-move logic for selected elements lives in
`packages/element/src/dragElements.ts` (the per-element mutation engine) and is
orchestrated by `App.tsx` (`handleCanvasPointerMoveForSelectedElements`, the
threshold/offset plumbing). Ours lives entirely in
`src/lib/canvas/editor.svelte.ts` (the `'move'` arm of `pointerMove`,
`#moveRoots`, `#applySnap`, `#dropTargetUnder`, and the `'move'` arm of
`pointerUp`). We render to Canvas 2D, are single-user, have no arrows/bindings,
no frames-as-element-containers (frames are just container elements), and no
collaboration — several Excalidraw branches are therefore intentionally absent.

### Classification table

| Excalidraw fn / algorithm | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `dragSelectedElements` (move the selection) | DIVERGENT | editor.svelte.ts:360-389 (`pointerMove` `'move'`), :383 `translateSubtree` | dragElements.ts:35-171 | Same goal; different model. Excal applies an **absolute offset** to each element's pointer-down snapshot (drift-free); ours applies an **incremental delta** from `lastWorld`. See divergences. |
| `calculateOffset` (snap + grid-merge of offset) | DIVERGENT | editor.svelte.ts:660-681 (`#applySnap`) | dragElements.ts:173-202 | Both fold object-snap into the drag delta; Excal also applies grid-point snap per-axis when no object snap on that axis. Ours has no grid snap during move. |
| `updateElementCoords` (per-element write from original) | DIVERGENT | editor.svelte.ts:369-384, scene `translateSubtree` | dragElements.ts:204-220 | Excal writes `original.x + offset` (anchored to snapshot). Ours adds incremental `dx,dy` to live position. Functionally equivalent for the common case; differs on float-drift and snap-back. |
| `getDragOffsetXY` (pointer offset from selection origin) | DIVERGENT | implicit: editor.svelte.ts:319 (`startWorld`) | dragElements.ts:222-229 | Excal computes pointer-minus-common-bounds-top-left once and stores it; ours stores the world pointer-down point and works in deltas. Different bookkeeping, equivalent intent. |
| Drag threshold gate (`DRAGGING_THRESHOLD = 10`) | DIVERGENT | editor.svelte.ts:120-122, :363-367 | constants.ts:19; App.tsx (drag uses absolute model, no screen gate on the move itself) | Ours gates the move with a 10px **screen** travel check before any nudge. Excal does NOT pre-gate the selection move on a screen threshold; it drags from the first move (drift-free so jitter is harmless). 10px is used by Excal for *arrow unbind* and *link activation*, not the move start. |
| Group / frame-children expansion (move frame moves its children) | DIVERGENT | editor.svelte.ts:653-658 (`#moveRoots`) + scene `translateSubtree` | dragElements.ts:75-85 | Excal expands selected **frames** to also move all elements whose `frameId` is in the set (via `scene.getNonDeletedElements`). Ours moves whole subtrees of selected roots via `translateSubtree`, and de-dupes nested selection in `#moveRoots`. Same net effect (container + descendants move together) by a different mechanism. |
| De-dup of frame-and-its-elements (`Set` + `elementsToUpdateIds`) | MATCH | editor.svelte.ts:653-658 (`#moveRoots` filter) | dragElements.ts:72-74, 106-108 | Both avoid moving an element twice when both it and its container are selected. Excal uses a `Set`; ours drops any selected element whose parent is also selected so only roots translate (subtree translate handles the rest). |
| Drag-from-center / symmetric expand (alt) — *for move* | ABSENT (correctly) | n/a | n/a (alt-during-move = duplicate in Excal, App.tsx:10173) | "Drag-from-center" (`shouldResizeFromCenter`) is a **create/resize** behavior, not a move behavior, in both codebases. In Excal, alt during a *move* triggers element **duplication**, not center-expand. Ours maps alt-during-move to **snap bypass** (editor.svelte.ts:334, :375). Neither implements alt-duplicate-on-drag. |
| Shift = axis-lock during move | ABSENT | n/a (ours: shift during move toggles selection only at pointerdown) | App.tsx:10021-10038 | Excal zeroes the smaller-magnitude axis of `dragOffset` when shift is held, locking the drag to one axis. Ours has no axis-lock during move. Real gap. |
| Arrow initial-drag / unbind logic | ABSENT (intentional) | n/a | dragElements.ts:142-169 | No arrows/bindings in our model. Out of scope. |
| Elbow-arrow early bail / start+end binding filter | ABSENT (intentional) | n/a | dragElements.ts:46-67 | No arrows. Out of scope. |
| `updateBoundElements` (bound text + arrows follow) | DIVERGENT (partial) | editor.svelte.ts:383 (`translateSubtree`) | dragElements.ts:139-141, 127-138 | Excal separately re-positions bound text and bound arrows. Ours has no bindings, but our subtree translate moves child text naturally (children are real subtree members, not bound siblings). |
| Bail on missing original snapshot (duplicate-during-drag) | ABSENT | n/a | dragElements.ts:89-97 | Excal returns early if any `originalElements` entry is missing (duplicate-during-drag race). Ours has no per-gesture snapshot map and no alt-duplicate, so the hazard doesn't exist. Intentional. |
| `dragNewElement` (size the new element while dragging) | MATCH (relocated) | editor.svelte.ts:569-616 (`#updateCreate`) | dragElements.ts:231-353 | Different axis (create, not move) but the **alt = expand-from-center** and **abs-distance-from-origin sizing with corner anchoring** algorithm matches. Included because it is the canonical drag-from-center implementation. |

### Divergences & gaps

1. **Absolute-offset vs incremental-delta move model** (bug-risk).
   - Excal (`dragElements.ts:204-220`, `App.tsx:10012-10015`): every move computes
     `dragOffset = pointerNow - drag.origin` and writes `originalElement.x + offset`
     for each element, reading the **pointer-down snapshot**. This is drift-free:
     N moves never accumulate float error, and clearing the snap snaps cleanly back.
   - Ours (`editor.svelte.ts:369-384`): computes `dx = world.x - lastWorld.x`,
     applies it via `translateSubtree`, then advances `lastWorld`. This is an
     **accumulating** model. Per-move it is correct, but: (a) floating-point error
     can accumulate over a long drag; (b) snap correction is folded into the delta
     and `lastWorld` is advanced by the *snapped* delta (:384), so the element can
     "stick" to a guide and the cursor-to-element offset drifts when snap toggles
     mid-drag. Excal avoids both by always recomputing from origin + snapshot.
     Severity: bug-risk (visible as cursor drift on snap engage/release; low risk
     of cumulative drift on normal-length drags).

2. **10px screen drag-threshold gating the move start** (behavioral).
   - Ours (`editor.svelte.ts:363-367`): the element does not move at all until the
     pointer has traveled `DRAG_THRESHOLD_PX = 10` **screen px** from pointer-down.
   - Excal: the selection move (`dragSelectedElements`) is **not** pre-gated by a
     screen threshold; once `drag.hasOccurred` is set it drags from the first
     `pointermove`. Excal's drift-free absolute model means a 1px jitter produces a
     1px move (invisible), so a guard isn't needed. `DRAGGING_THRESHOLD` in Excal
     gates *arrow unbinding* (`dragElements.ts:148-149`), *link activation*
     (`App.tsx:1357`), and *linear midpoint creation* — never the move start.
   - Net: ours adds a click-vs-drag dead-zone Excal lacks. The CLAUDE-comment claim
     "Matches Excalidraw (DRAGGING_THRESHOLD = 10)" (editor.svelte.ts:120-122) is
     only half-true: the constant value matches, but Excal applies it to a different
     decision. Severity: behavioral (different feel; ours is arguably better UX but
     it is a divergence, and the cited-rule comment overstates parity).

3. **No shift axis-lock during move** (behavioral gap).
   - Excal (`App.tsx:10021-10038`): shift held during a move zeroes the
     smaller-magnitude axis of `dragOffset`, constraining the drag to pure
     horizontal/vertical. Ours consumes shift at pointer-down for selection toggling
     (editor.svelte.ts:311) and tracks `#shiftHeld` for rotate snap, but the `'move'`
     arm never reads it. Dragging with shift held in ours moves freely in 2D.
     Severity: behavioral.

4. **No grid snap during move** (behavioral, scope-dependent).
   - Excal's `calculateOffset` (`dragElements.ts:183-197`) applies `getGridPoint`
     per-axis on any axis without an active object snap. Ours `#applySnap`
     (editor.svelte.ts:660-681) only does object/alignment snapping; there is no
     grid quantization of the drag. We have a dot-grid (`gridVisible`) but it is
     visual-only during move. Severity: behavioral (only matters when grid mode is
     on; our grid is decorative).

5. **alt semantics during move differ** (cosmetic/by-design).
   - Excal: alt-during-move = duplicate-the-selection (`App.tsx:10173`). Ours:
     alt-during-move = bypass snapping (editor.svelte.ts:334, :375). These are
     deliberate, different product choices; neither is wrong, but a user with
     Excalidraw muscle memory will be surprised. Severity: cosmetic.

6. **Reparent-on-drop is ours-only behavior layered onto the move** (extension, noted here for completeness). Excal handles frame membership via separate
   `frameToHighlight`/`getElementsInResizingFrame` plumbing and does not reparent a
   shape into an arbitrary container by drop. See "Our extensions".

### Our extensions (no Excalidraw drag-move counterpart)

- **`#dropTargetUnder` + drop-to-reparent** (editor.svelte.ts:683-709, and the
  `pointerUp` `'move'` arm :415-435). On drop, the dragged roots are reparented into
  the topmost container under the cursor (cycle-safe via `isAncestor`, skips the
  current parent and the moving subtree). Excalidraw's frame-highlight is the nearest
  analogue but it assigns *frame membership*, not a general parent/child reparent into
  any container element. This is core to our semantic-hierarchy product and feeds the
  Markdown export's nesting.
- **`dropTargetId` live preview** (editor.svelte.ts:179, :387) — reactive overlay of
  the prospective drop container during the drag. No Excalidraw equivalent.
- **Single-history-transaction gesture wrap** (editor.svelte.ts:318 `history.begin`,
  :434 `history.commit`) — a whole drag = one undo, with `commit()` detecting a no-op
  move and discarding without restoring (so a click that didn't move keeps its
  selection). Excalidraw uses `captureUpdate`/store deltas instead; behaviorally
  similar but architecturally ours.
- **`translateSubtree`-based group move** (editor.svelte.ts:383) — moving by true
  parent/child subtree rather than Excal's frame-membership-set expansion.
