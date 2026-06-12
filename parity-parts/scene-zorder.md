## Parity: scene-zorder

Axis focus: reactive document model, element CRUD, z-order / reordering, parent-child.

OUR implementation: `src/lib/canvas/scene-graph.svelte.ts` — a Svelte-5-runes singleton `SceneGraph`
holding a single `LayoutDocument`. Hierarchy is a real **tree**: every element has a `parentId`,
sibling order is an explicit integer `z` field, root order is the `rootOrder: ElementId[]` array.
Geometry is world-space; reparenting preserves world position.

EXCALIDRAW counterpart: `Scene.ts` (the mutable element store + caches), `zindex.ts` (z-order
actions), `mutateElement.ts` (in-place patch + version bump), `sortElements.ts` (group/bound-text
normalization). Excalidraw has **no tree**: all elements live in one flat ordered array; "z-order"
IS array position, encoded into a per-element `index` (fractional index string) that is kept in
sync with array order via `syncInvalidIndices`/`syncMovedIndices`. Containment is expressed by
`frameId` / `groupIds` / `containerId` references, not a parent tree.

This is the central architectural divergence and it colours every row below: ours is
*tree + integer-z-per-sibling-group*; theirs is *flat-array + fractional-index*.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `Scene` element store / caches (`elements`, `nonDeletedElements`, `elementsMap`, frames) | DIVERGENT | `scene-graph.svelte.ts:31-67` | `Scene.ts:108-176` | Ours stores `doc.elements` keyed map + `rootOrder` + derived `ordered`; theirs caches flat arrays + maps + deleted/non-deleted split. We have no `isDeleted` tombstones (no collab), so no non-deleted cache. Severity: behavioral (intentional). |
| `Scene.replaceAllElements` | DIVERGENT | `replaceDocument` `scene-graph.svelte.ts:154-159` | `Scene.ts:271-301` | Ours swaps the whole `LayoutDocument` and clears selection; no `syncInvalidIndices` (we have no fractional indices) and no frame-likes rebuild. Severity: behavioral. |
| `Scene.mapElements` (map-all, no-op if unchanged) | ABSENT | — | `Scene.ts:254-269` | No bulk-map primitive; callers iterate `updateElement`. Intentional for our scope. |
| `Scene.insertElementsAtIndex` / `insertElement` | DIVERGENT | `addElement` / `addElements` `scene-graph.svelte.ts:161-180` | `Scene.ts:341-375` | Ours inserts into `rootOrder` at an optional index (root only) and assigns into the map; theirs splices into the flat array at any index then `syncMovedIndices`. Ours has no index-based insert for non-root (uses `z`). Severity: behavioral. |
| `Scene.getElement` / `getNonDeletedElement` | MATCH | `get` `scene-graph.svelte.ts:71-73` (`has` :75-77) | `Scene.ts:228-240` | Map lookup by id. Ours returns `undefined`, theirs `null`; no deleted variant (no tombstones). |
| `Scene.getElementIndex` | DIVERGENT | `childOrderOf` index-of `scene-graph.svelte.ts:91-95` | `Scene.ts:377-379` | Theirs = position in flat array (global z). Ours has no single global index; closest is position within a sibling group sorted by `z`. Severity: behavioral. |
| `Scene.getContainerElement` | DIVERGENT | `ancestorsOf` / `get(parentId)` `scene-graph.svelte.ts:111-121` | `Scene.ts:381-395` | Theirs resolves `containerId` (text→container binding). Ours has generic `parentId`; no separate bound-text container concept. Severity: cosmetic (different model, same "find parent"). |
| `Scene.getElementsFromId` (id-or-group expansion) | ABSENT | — | `Scene.ts:397-407` | No groups in our model. Intentional. |
| `Scene.mutateElement` / `mutateElement.ts` `mutateElement` | DIVERGENT | `updateElement` `scene-graph.svelte.ts:183-188` | `Scene.ts:411-445`, `mutateElement.ts:37-144` | Both mutate in place. Theirs: per-key dirty diff, `ShapeCache.delete` on size change, elbow-arrow point recompute, `version`/`versionNonce`/`updated` bump, conditional `triggerUpdate`. Ours: blind `Object.assign` + `touch()` (revision++ / dirty / updatedAt). No version/nonce (no collab), no per-key equality skip, no shape cache. Severity: behavioral (intentional; no collab/CRDT). |
| `mutateElement.ts` `newElementWith` (immutable copy + version bump) | ABSENT | — | `mutateElement.ts:146-178` | We mutate in place; immutability for undo is handled by the history layer's snapshots, not here. Intentional. |
| `mutateElement.ts` `bumpVersion` | ABSENT | — | `mutateElement.ts:185-193` | No element `version`/`versionNonce` fields (no collab reconciliation). Intentional. |
| `zindex.ts` `moveOneRight` (bring forward one) | DIVERGENT | `bringForward`→`reZOrder(+1)` `scene-graph.svelte.ts:252-254, 276-291` | `zindex.ts:316-395, 574-580` | Ours swaps `z` with the next sibling in the same parent group — single element, single step, no frame/group/bound-text awareness, no multi-select contiguous grouping. Theirs shifts the whole selection by one slot in the flat array accounting for frames/groups/bindings. Severity: behavioral. |
| `zindex.ts` `moveOneLeft` (send backward one) | DIVERGENT | `sendBackward`→`reZOrder(-1)` `scene-graph.svelte.ts:255-257, 276-291` | `zindex.ts:316-395, 566-572` | Mirror of above; single-element z-swap vs selection-aware flat-array shift. Severity: behavioral. |
| `zindex.ts` `moveAllRight` (bring to front) | DIVERGENT | `bringToFront` `scene-graph.svelte.ts:258-263` | `zindex.ts:397-481, 594-604` | Ours sets `z = nextZ(parent)` (max sibling z + 1) — within sibling group only. Theirs moves selection to end of array, frame/group-aware. No re-pack. Severity: behavioral; bug-risk noted below (unbounded z growth). |
| `zindex.ts` `moveAllLeft` (send to back) | DIVERGENT | `sendToBack` `scene-graph.svelte.ts:264-274` | `zindex.ts:397-481, 582-592` | Ours sets `z = min-1` then `normalizeZ` re-packs the sibling group to 0..n-1. Theirs moves to front of array, frame/group-aware. Ours re-packs (good); see bug note re: the `min` seed. Severity: behavioral. |
| `zindex.ts` `getIndicesToMove` (selection + contiguous deleted) | ABSENT | — | `zindex.ts:36-70` | No deleted tombstones; selection handled directly in `selectedElements` derived. Intentional. |
| `zindex.ts` `toContiguousGroups` | ABSENT | — | `zindex.ts:72-81` | Only needed for multi-element flat-array shifting. Intentional gap (our z-order is single-element). |
| `zindex.ts` `getTargetIndex` / `getTargetIndexAccountingForBinding` / `getContiguousFrameRangeElements` | ABSENT | — | `zindex.ts:83-147, 197-303` | Frame/group/bound-text aware target resolution. No frames/groups/bindings in our model. Intentional. |
| `zindex.ts` `shiftElementsAccountingForFrames` | ABSENT | — | `zindex.ts:483-561` | Frame-children-aware shifting. Intentional (no frames). |
| `zindex.ts` `moveArrowAboveBindable` | ABSENT | — | `zindex.ts:153-191` | Arrow-binding z-fixup. No arrows/bindings. Intentional. |
| `sortElements.ts` `normalizeElementOrder` / `defragmentGroups` / `normalizeBoundElementsOrder` | DIVERGENT | `collectOrdered` `scene-graph.svelte.ts:127-143`, `childOrderOf` :91-95 | `sortElements.ts:5-119` | Theirs re-clusters a flat array so group members and bound texts sit contiguously, recursing nested groups. Ours achieves contiguity structurally: depth-first tree walk emits each subtree contiguously, children ordered by `z`. Same *goal* (stable, group-contiguous ordering) via different mechanism. Severity: behavioral. |
| `fractionalIndex.ts` `syncInvalidIndices` / `syncMovedIndices` | DIVERGENT | `normalizeZ` `scene-graph.svelte.ts:294-300` | `fractionalIndex.ts` (+ called from `Scene.ts:285,367`, `zindex.ts:392,478`) | Both reconcile "logical order" with stored order keys after a move. Theirs generates fractional-index strings between neighbours; ours re-packs integer `z` to 0..n-1 within a sibling group. Ours only runs `normalizeZ` on `sendToBack`; theirs syncs on every reorder/insert. Severity: behavioral. |
| `getNonDeletedElements` split | ABSENT | — | `Scene.ts:50-65` | No tombstones. Intentional. |
| `Scene.onUpdate` / `triggerUpdate` / `sceneNonce` callbacks | DIVERGENT | `touch` (revision++) `scene-graph.svelte.ts:147-151` | `Scene.ts:303-324, 141-145` | Theirs is an explicit pub/sub + random nonce for the React renderer. Ours uses a `$state` `revision` counter that Svelte reactivity propagates to the canvas renderer. Same role, different reactivity model. Severity: cosmetic. |
| `Scene.destroy` | ABSENT | — | `Scene.ts:326-339` | Singleton lives for the session; `replaceDocument` resets state. Intentional. |

### Divergences & gaps

1. **bringToFront grows `z` unboundedly without re-pack (bug-risk).**
   `bringToFront` (`scene-graph.svelte.ts:258-263`) sets `el.z = nextZ(parent)` = max sibling z + 1
   and never normalizes, whereas `sendToBack` (:264-274) re-packs via `normalizeZ`. Repeated
   bring-to-front leaves ever-larger sparse `z` values. Functionally fine (order is by `z`
   comparison, `childOrderOf` sorts), and these are not money values, but it is asymmetric with
   `sendToBack` and diverges from Excalidraw, which keeps indices dense/normalized via
   `syncMovedIndices` after every reorder. Severity: bug-risk (latent, not user-visible today).

2. **`sendToBack` min-seed when the element is the only/sole child.**
   `scene-graph.svelte.ts:270`: `siblings.reduce((m, e) => Math.min(m, e.z), 1)`. The reduce seed is
   `1`, so with no other siblings `min = 1` and the element gets `z = 0`, then `normalizeZ` repacks
   to `0` — correct by luck. With siblings whose min z is already `> 1` the seed `1` would win and
   yield `z = 0`; still correct because `normalizeZ` repacks afterwards. The seed is effectively
   inert because of the trailing `normalizeZ`, but it is a confusing magic number (a min-reduce
   seeded with a non-extreme value). Severity: cosmetic. Evidence: lines 264-274.

3. **Single-element z-order only; no multi-selection reorder.**
   Excalidraw's `moveOne*`/`moveAll*` operate on the *whole selection* as contiguous groups
   (`getIndicesToMove` + `toContiguousGroups`, `zindex.ts:36-81`). Ours' `bringForward` etc. take a
   single `id`. If the editor needs "bring all selected forward," it must call per-element, which
   does not preserve relative order or contiguity the way Excalidraw guarantees. Severity:
   behavioral (a real gap if multi-select reorder is a product requirement; see KNOWN_GAPS).

4. **No fractional indices / no global z.** Ours has no single global stacking order across the
   whole document — order is per-sibling-group `z` plus tree position. Cross-parent z comparisons
   are undefined by design. Excalidraw's flat array gives a total order. This is intentional given
   the tree model but means "is element A above element B" globally is only answerable via the
   depth-first `ordered` walk, not a numeric compare. Severity: behavioral (intentional).

5. **`updateElement` does no dirty-diff, version bump, or shape-cache invalidation.**
   `mutateElement.ts:77-144` skips unchanged keys, bumps `version`/`versionNonce`/`updated`, and
   deletes the shape cache on width/height/points change. Ours `Object.assign`s blindly and bumps a
   global `revision` (`scene-graph.svelte.ts:183-188`). No per-element versioning (no collab) and no
   shape cache (Canvas 2D re-renders from `revision`). Intentional, but note ours always marks dirty
   even on a no-op patch. Severity: behavioral (intentional).

6. **`reparent` cycle-guard + world-position preservation is an EXTENSION-shaped divergence.**
   `scene-graph.svelte.ts:222-243` rejects self-parenting and descendant cycles, moves between
   `rootOrder` and child groups, and places the moved element at top of the new sibling group via
   `nextZ`. Excalidraw has no parent tree to reparent within; the nearest analog is `frameId`
   reassignment scattered across frame actions. Treated as ours-side behavior with no direct
   Excalidraw counterpart in these files. Severity: behavioral (intentional model difference).

### Our extensions (no Excalidraw counterpart in these files)

- **Tree hierarchy traversal:** `childrenOf` (`:80-88`), `childOrderOf` (`:91-95`),
  `descendantsOf` (`:98-108`), `ancestorsOf` (`:111-121`), `isAncestor` (`:123-125`),
  `collectOrdered` (`:127-143`). Excalidraw has no parent tree; containment is `frameId`/`groupIds`
  references resolved by helper functions, not a recursive parent/child walk.
- **`reparent`** (`:222-243`) and **`nextZ`** (`:245-248`) — tree reparenting with cycle rejection
  and world-position preservation. No Excalidraw equivalent.
- **`translateSubtree`** (`:191-201`) — moving a parent walks the subtree and shifts all descendants
  by a world delta (because children store world geometry, not parent-relative). Excalidraw moves
  frame children via separate frame logic, not a subtree walk.
- **`removeElement` returns the removed subtree** (`:204-215`) for undo payloads, and prunes
  `rootOrder`. Excalidraw deletes via `isDeleted` tombstones (kept for collab), never physically
  removing; ours physically deletes (no collab).
- **Selection helpers as scene state:** `select`/`selectOne`/`addToSelection`/`toggleSelection`/
  `clearSelection`/`selectAll`/`isSelected` (`:304-333`) live on the scene using a reactive
  `SvelteSet`. `selectAll` (:320-330) deliberately mirrors Excalidraw `actionSelectAll` semantics
  (skip hidden/locked) — cited in code. Excalidraw keeps selection in `AppState`, separate from the
  Scene store.
- **Derived geometry selectors:** `ordered` (:46), `contentBounds` (:49-55), `selectedElements`
  (:58-60), `selectionBounds` (:63-67), and `centroidOf` (:338-350) — reactive `$derived` bounds/
  centroid helpers for zoom-to-fit and paste-offset. Excalidraw computes these via standalone
  utils, not Scene members.
- **`addElements`** (`:172-180`) — bulk add of a pasted subtree preserving parent links and root
  membership.

### Sanity of correspondence

The two systems agree on the *behavioral contract* of element CRUD and "make ordering stable and
group-contiguous," but reach it through opposite data models (integer-z tree vs fractional-index
flat array). The bulk of ABSENT rows (frames, groups, bound text, arrows, fractional indices,
tombstones, versioning, collab nonces) are intentional per our single-user / no-collab / Canvas-2D
scope. The two findings worth tracking are (1) the asymmetric un-normalized `bringToFront` and
(3) the single-element-only z-order vs Excalidraw's selection-aware reorder.
