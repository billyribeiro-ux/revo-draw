## Parity: commands-history

Axis focus: user operations, undo/redo snapshots, gesture coalescing / transactions.

### Architectural framing

Excalidraw and LayoutForge (LF) make a **fundamentally different undo/redo choice**, and that
choice cascades through every function below.

- **Excalidraw**: a *delta* engine. `Store` (`store.ts`) observes the scene, computes a
  structural-clone snapshot only of *changed* elements, and emits a `StoreDelta` (added / removed /
  updated diffs). `History` (`history.ts`) keeps stacks of *inverse deltas*; undo/redo *applies* a
  delta forward onto the live scene and pushes the re-inverted delta to the opposite stack. Built
  for **multiplayer/collab and remote reconciliation** (versions, versionNonce, `applyLatestChanges`,
  ephemeral vs durable increments, micro/macro action scheduling).
- **LF**: a *full-snapshot* engine (`history.svelte.ts`). Every committed gesture stores a complete
  `structuredClone` of the document; undo/redo just *replaces* the whole document with a prior
  clone. Single-user, local-first, no collab — so correctness is automatic (no inverse-command
  drift) and the snapshot machinery, delta math, version reconciliation, and ephemeral-increment
  plumbing are deliberately ABSENT.

Because of this, the entire `StoreDelta` / `StoreChange` / `StoreSnapshot` / increment subsystem in
`store.ts` has **no per-function LF counterpart** — LF collapses it into two operations: "clone the
doc" and "compare two canonical strings." I classify those Excalidraw functions as ABSENT
(intentional, per single-user scope) rather than enumerating each as a divergence, and instead map
the *behavioral* contracts (coalescing, no-op suppression, redo-stack reset, stack cap, undo/redo
semantics) that LF must still satisfy.

The user-facing *command* algorithms (align, distribute, flip, group, lock, styles, duplicate) DO
have direct counterparts and are compared line-by-line.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `History.record` (push entry, reset redo) | DIVERGENT | `history.svelte.ts:115` (`commit`) | `history.ts:117` | Both push one entry per durable change and clear the redo/future stack. LF clears `#future` unconditionally on any committed change; Excalidraw clears redo **only when the element delta is non-empty** (a pure appState/selection change keeps redo). LF has no appState-only entries, so the asymmetry is mostly moot — see Divergences. |
| `History.undo` / `perform` (pop, apply, push inverse) | DIVERGENT | `history.svelte.ts:143` | `history.ts:139,157` | Same net behavior (move top entry from undo→redo, restore prior state). Excalidraw *loops* popping entries until one produces a **visible** change (skips no-op/appState-only deltas); LF restores exactly one snapshot, no skip-until-visible loop. |
| `History.redo` | MATCH | `history.svelte.ts:154` | `history.ts:148` | Symmetric to undo on both sides. |
| `History.clear` | MATCH | `history.svelte.ts:165` (`reset`) | `history.ts:108` | Both empty undo/redo and re-baseline. LF also re-seeds the baseline clone+key. |
| `History.isUndoStackEmpty` / `isRedoStackEmpty` | MATCH | `history.svelte.ts:78` (`canUndo`/`canRedo`) | `history.ts:98,102` | Boolean derived from stack length on both sides. |
| `HistoryChangedEvent` emitter | ABSENT | — | `history.ts:83,134` | LF uses Svelte `$derived` (`canUndo`/`undoLabel`) instead of an event emitter; UI reactivity replaces the observer. Intentional (Svelte runes vs React event bus). |
| `Store.commit` (flush micro, run one macro) | DIVERGENT | `history.svelte.ts:115` (`commit`) | `store.ts:183` | Both are the commit boundary. Excalidraw runs queued micro-actions then exactly one macro action chosen by precedence (IMMEDIATELY > NEVER > EVENTUALLY). LF's `commit` is a plain transaction-depth decrement + no-op check + single push; no micro/macro queue. |
| `Store.scheduleCapture` / `scheduleAction` (`CaptureUpdateAction`) | ABSENT | — | `store.ts:101,110` | LF has no IMMEDIATELY/NEVER/EVENTUALLY taxonomy; every `transact`/`commit` is "immediately durable." Ephemeral (drag/resize) updates are kept out of history by NOT wrapping them in `transact` (the editor uses `begin`/`commit` and the no-op check), not by an action enum. Intentional. |
| `Store.scheduleMicroAction` / `flushMicroActions` | ABSENT | — | `store.ts:117,305` | Async multi-step capture deferral — only needed for async freedraw/text/image + collab. ABSENT, intentional (no async element creation, no collab). |
| `Store.processAction` (durable vs ephemeral dispatch) | ABSENT | — | `store.ts:317` | Folded into LF's single durable commit path. Intentional. |
| `StoreSnapshot.maybeClone` (clone only if changed) | DIVERGENT | `history.svelte.ts:32` (`cloneDocument`) + `:115` no-op check | `store.ts:761` | Same *intent* (don't record when nothing changed). Excalidraw clones only the changed elements and returns the SAME instance if nothing changed (reference-equality short-circuit). LF always full-clones, then suppresses the *entry* via canonical-string equality. Different mechanism, same observable result (no spurious undo entry); LF is O(doc) per commit vs Excalidraw O(changed). |
| `StoreSnapshot.detectChangedElements` (version/hash diff) | DIVERGENT | `history.svelte.ts:40` (`canonical`/`stableStringify`) | `store.ts:904` | Both detect "did the document change." Excalidraw compares per-element `version` + a `hashElementsVersion`; LF builds a canonical sorted-key JSON string and string-compares. LF's is content-based (no version counters), so it is immune to version drift but cannot tell *which* element changed (it doesn't need to). |
| `StoreSnapshot.createElementsSnapshot` (deep-copy changed only) | DIVERGENT | `history.svelte.ts:32` | `store.ts:970` | Excalidraw deep-copies only changed elements and shares the rest by reference (structural sharing). LF *deliberately* deep-clones everything — the file header (`history.svelte.ts:9-14`) documents that an earlier structural-sharing version aliased a stale element and corrupted an undo; a fuzz test forced full cloning. Intentional anti-sharing, opposite of Excalidraw. |
| `StoreDelta.calculate` / `inverse` / `squash` / `applyTo` | ABSENT | — | `store.ts:507-637` | The whole delta algebra. LF stores states, not deltas, so there is nothing to inverse/squash/apply. Intentional. |
| `StoreSnapshot.getChangedElements` / `getChangedAppState` | ABSENT | — | `store.ts:691,714` | Diff computation for delta emission. ABSENT (no deltas). Intentional. |
| `getObservedAppState` / `ObservedAppState` | ABSENT | — | `store.ts:1006` | Selects the appState subset that participates in undo (selection, group, bg color…). LF keeps selection/camera OUT of history entirely (only the document is snapshotted), so there is no observed-appState concept. See Divergences (selection-in-undo). |
| `alignElements` / `calculateTranslation` | MATCH | `commands.svelte.ts:240` (`align`) | `align.ts:17,52` | Identical algorithm: union bbox of selection, per-group min/center/max delta. LF's `#topLevelSelection` roots ≙ Excalidraw's `getSelectedElementsByGroup` groups. start/end/center formulas match byte-for-byte. |
| `distributeElements` (gap + negative-step center fallback) | DIVERGENT | `commands.svelte.ts:274` (`distribute`) | `distribute.ts:17` | Gap path identical (sort by mid, `step = (extent − span)/(n−1)`, walk running pos). Overlap fallback: Excalidraw finds the boxes whose start==bounds.start / end==bounds.end and steps between *their* mids, holding those two fixed; LF pins `sorted[0]`/`sorted[last]` and steps between *their* mids. After sorting by mid these usually coincide, but if the extreme-start box ≠ smallest-mid box (possible when widths differ), the pinned pair differs. severity: behavioral. |
| `flipElements` (mirror about bbox center) | DIVERGENT | `commands.svelte.ts:328` (`flip`) | `actionFlip.ts:110` | Both mirror the selection about its common-bbox center. Excalidraw mirrors via `resizeMultipleElements` with negative scale (`flipByX/Y`, resize-from-center, maintain aspect) so element *content* (text/arrowheads/chirality) is mirrored, then re-centers to prevent drift. LF has no internal chirality, so it does a position mirror (`x' = 2c − (x+w)`) plus an explicit rotation inversion (`−θ` for X, `π−θ` for Y). Net visual result equivalent for LF's element set; algorithm differs (no resize, no arrowhead swap, no re-center pass). severity: cosmetic (correct for LF's scope). |
| arrow-only flip (swap arrowheads) | ABSENT | — | `actionFlip.ts:116-129` | LF has no arrow elements/arrowheads. Intentional. |
| `actionGroup` (assign `groupIds`) | DIVERGENT | `commands.svelte.ts:386` (`group`) | `actionGroup.tsx:91` | Excalidraw grouping is a *flat tag*: it pushes a new `randomId()` into each element's `groupIds[]` and reorders so grouped elements are contiguous; geometry untouched. LF has no `groupIds` model — it creates a **real `container` element** sized to the selection AABB and reparents the selection into it. Same user intent (one selectable unit), structurally different (real containment node vs tag). severity: behavioral. |
| `actionUngroup` (pop `groupIds`) | DIVERGENT | `commands.svelte.ts:426` (`ungroup`) | `actionGroup.tsx:215` | Excalidraw removes the innermost group id from each member's `groupIds[]`. LF dissolves the container element: reparents its children to the container's parent (preserving world coords) and deletes the container. Mirror of the group divergence. severity: behavioral. |
| `actionToggleElementLock` (`shouldLock = every(!locked)`) | DIVERGENT | `commands.svelte.ts:358` (`toggleLockSelection`) | `actionElementLock.ts:21` | **Different threshold on mixed selections.** Excalidraw locks iff **every** selected element is currently unlocked (`elements.every(el => !el.locked)`) — a mixed lock/unlock selection therefore *unlocks*. LF locks iff **some** element is unlocked (`ids.some(id => !locked)`) — a mixed selection *locks*. Opposite outcome for the mixed case. severity: bug-risk. |
| `actionUnlockAllElements` | MATCH | `commands.svelte.ts:368` (`unlockAll`) | (action registry) | Both clear `locked` on every locked element in the doc as one entry. |
| `actionCopyStyles` (capture primary element style) | DIVERGENT | `commands.svelte.ts:452` (`copyStyles`) | `actionStyles.ts:41` | Both capture one source element's style. Excalidraw picks the **first** element matching `selectedElementIds` and serializes the whole element(s) (incl. bound text) to a module-level JSON string with `EVENTUALLY` (non-undoable) capture. LF picks the **last** selected (`els[els.length-1]`) and returns just the `style` object to the caller (no module global). Source-element pick order differs (first vs last). severity: cosmetic. |
| `actionPasteStyles` (apply style to selection) | DIVERGENT | `commands.svelte.ts:460` (`pasteStyles`) | `actionStyles.ts:72` | Both apply the captured style to every selected element as one undo entry (`IMMEDIATELY`). Excalidraw copies an explicit allow-list of style props (stroke/fill/opacity/roughness/roundness + text font props, with type-guards, frame special-casing, arrowhead copy, text bbox redraw). LF shallow-merges the whole `style` object. Equivalent for LF's flat `ElementStyle`; Excalidraw's is far more property-aware. severity: cosmetic. |
| `actionDuplicateSelection` / `duplicateElements` | DIVERGENT | `commands.svelte.ts:95` (`duplicateSelection`), `:490` (`#cloneSubtree`) | `actionDuplicateSelection.tsx:39` | Both clone the selection as one undo entry, regenerate ids, offset, and select the clones. **Offset differs**: Excalidraw uses `DEFAULT_GRID_SIZE / 2` (`= 10`) on x and y; LF defaults to `24`. Excalidraw also remaps `groupIds`/`frameId`/binding refs; LF remaps `parentId` via an id map across the subtree. severity: cosmetic (offset is a tunable default). |
| `paste` (regenerate ids, offset, reparent) | DIVERGENT | `commands.svelte.ts:126` (`paste`) | (clipboard.ts, not in scope file) | LF's clipboard paste regenerates all ids, remaps `parentId` within the pasted set, offsets by `24`, selects new roots. Excalidraw's paste offset/centering logic lives in `clipboard.ts`/`App` (not in the read files). Behavior is analogous; default offset differs. severity: cosmetic. |

### Divergences & gaps

1. **Lock threshold on mixed selections (bug-risk).** `commands.svelte.ts:361`
   `const anyUnlocked = ids.some(id => !this.#scene.get(id)?.locked)` → locks when *any* is
   unlocked. Excalidraw `actionElementLock.ts:21` uses `every(!locked)` → locks only when *all* are
   unlocked, so a mixed selection unlocks. The user-visible consequence: select one locked + one
   unlocked element and hit lock — LF locks both; Excalidraw unlocks both. The toggle label is
   correct relative to LF's own predicate, but the convention differs from Excalidraw. Pick one and
   document it; this is the single most likely "why did the toggle do the opposite?" complaint.

2. **Distribute overlap fallback pins a different pair (behavioral).** `commands.svelte.ts:299`
   pins `sorted[0]`/`sorted[last]` (smallest/largest *mid*). Excalidraw `distribute.ts:50-51` pins
   the boxes whose *start* equals `bounds.start` and whose *end* equals `bounds.end`. For unequal
   widths the box with the smallest mid is not necessarily the box with the smallest start, so the
   re-spacing baseline can differ. Only triggers when elements overlap on the axis (`step < 0`).

3. **No "skip-until-visible" undo loop (behavioral, but inert at LF scope).** Excalidraw
   `history.ts:179-219` keeps popping entries until one yields a visible change, so a chain of
   selection-only deltas is consumed in a single undo press. LF stores no selection-only entries
   (selection isn't in history), so every LF undo entry is by construction visible — the loop is
   unnecessary. Flagged for completeness, not a real gap.

4. **Redo-stack reset is unconditional (behavioral, inert).** `history.svelte.ts:128`
   `this.#future = []` on every committed change. Excalidraw `history.ts:127-132` preserves redo
   across pure appState/selection-only changes. Again, LF doesn't record appState-only entries, so
   the conditional is moot — but if LF ever adds selection-to-history, this would discard redo on a
   bare click.

5. **Full-clone vs structural-sharing snapshots (intentional inversion).** `history.svelte.ts:9-14`
   documents that LF *deliberately* abandoned structural sharing (which Excalidraw uses at
   `store.ts:970-986`) after a fuzz test proved aliasing corrupted undo. This is a conscious
   trade: O(doc) clone per commit for guaranteed isolation. Correct for LF's element-count scale.

6. **Selection / camera / appState not in history (intentional gap).** Excalidraw records an
   `ObservedAppState` slice (selection, group, bg color) in deltas (`store.ts:1006`). LF snapshots
   only the `LayoutDocument`; selection is restored implicitly by the document replace but is not a
   first-class undoable axis. Consistent with single-user scope; means "undo my selection" is not
   supported (matches most desktop tools).

7. **No version / versionNonce / collab reconciliation (intentional gap).** `HistoryDelta.applyTo`
   excludes `version`/`versionNonce` and `applyLatestChanges` reconciles against remote edits
   (`history.ts:29-34,68-80`). LF has no versions and no remote peer, so these are absent by design.

8. **No ephemeral increments (intentional gap).** Excalidraw emits `EphemeralIncrement` during
   drag/resize for live collab cursors (`store.ts:253,488`). LF keeps interactive gestures out of
   history via `begin`/`commit` + the canonical no-op check (`history.svelte.ts:105-131`); there is
   nothing to broadcast.

### Our extensions (no Excalidraw counterpart)

- **`History.cancel`** (`history.svelte.ts:134`): aborts an in-flight gesture and *restores the
  pre-gesture baseline* (Escape / window-blur mid-drag). Excalidraw has no symmetric mid-gesture
  abort that rolls back the live scene from the history layer — it relies on the action returning
  the prior elements. This is an LF affordance for the canvas drag model.
- **`History.begin` / `commit` / `depth` nesting** (`history.svelte.ts:105,115,83`): explicit
  re-entrant transaction depth with a re-snapshot at the *outermost* begin. The header documents
  this fixed a "click deletes my element" bug from a stale baseline. Excalidraw's coalescing is
  driven by the `CaptureUpdateAction` scheduler instead; LF's depth counter is a distinct mechanism.
- **`canonical` / `stableStringify`** (`history.svelte.ts:40,53`): content-addressed, sorted-key
  serialization used purely for no-op suppression. Excalidraw uses version counters + hashes; LF's
  string canonicalization is its own design (also drives the `#baselineKey` cache).
- **`Commands.createAt` + `#findContainerAt`** (`commands.svelte.ts:43,61`): drop-and-auto-parent
  into the deepest container under the cursor, in one transaction. Excalidraw's frame membership is
  computed post-hoc (`updateFrameMembershipOfSelectedElements`); LF folds auto-parenting into create.
- **`Commands.changeType`** (`commands.svelte.ts:210`): re-type an element in place, migrating to the
  new type's defaults while preserving geometry/style/id. No Excalidraw equivalent (Excalidraw has
  fixed element types). Semantic-layout-specific.
- **`Commands.patchLayout`** (`commands.svelte.ts:202`): edit a container's `LayoutIntent`
  (flex/grid direction, gap, alignment). Pure LayoutForge semantic-layout concept feeding the
  Markdown export; no Excalidraw analog.
- **`Commands.reparent`** (`commands.svelte.ts:174`): first-class parent/child link change preserving
  world geometry — LF's containment model. Excalidraw has frames + groups but no general reparent
  command at this layer.
- **`#cloneSubtree` / `#rootBounds` / `#topLevelSelection` / `#nextZUnder`**
  (`commands.svelte.ts:490,475,485,444`): containment-tree helpers (subtree clone with id remap,
  per-root union bbox, gesture-root filtering, next-z computation). Excalidraw's equivalents operate
  over flat `groupIds`, not a parent/child tree.
