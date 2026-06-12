## Parity: element-model

Axis focus: the element discriminated union, the create/factory + per-type defaults
path, and id generation. Compared against Excalidraw's `newElement.ts` (element
constructors) and `typeChecks.ts` (the type-guard family).

Frameworks differ fundamentally: Excalidraw models **freeform drawing primitives**
(rectangle / ellipse / diamond / arrow / line / freedraw / text / image / frame /
embeddable / iframe) plus rough.js render seeds, collaboration version vectors, and
text-binding. LayoutForge models **semantic UI components** (button, nav, card, hero,
…) that compile to a Markdown layout spec. So the discriminated unions are NOT meant to
correspond member-for-member; what is comparable is the *factory algorithm*, *defaults
strategy*, *id generation*, and the *type-guard / container-membership* pattern. Judged
on behavior, not member overlap.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `_newElementBase` (base element factory) | DIVERGENT | `defaults.ts:368-416` `createElement` | `newElement.ts:78-156` | Same role: stamp a complete base + merge caller overrides. Differs in default set, id source, and out-of-range guard (below). |
| id assignment `rest.id \|\| randomId()` (nanoid) | DIVERGENT | `uuid.ts:16-56` `uuidv7` (always self-generated) | `newElement.ts:127`, `random.ts:16` | Different algorithm AND policy: ours is monotonic UUID v7 and ids are NEVER caller-overridable; Excalidraw uses nanoid and accepts a caller-supplied id. See divergences. |
| `seed: randomInteger()` (rough.js render seed) | ABSENT | — | `newElement.ts:145`, `random.ts:9` | No rough.js; clean Canvas 2D render. Intentional per scope (rule 8). |
| `version` / `versionNonce` (collab reconciliation) | ABSENT | — | `newElement.ts:146-147` | No collaboration. Intentional per scope (single-user, no collab). |
| `updated: getUpdatedTimestamp()` (per-element mtime) | DIVERGENT | doc-level `updatedAt` `types.ts:541` | `newElement.ts:150`, `utils.ts:650` | Ours tracks freshness at the document level only, not per element. Intentional: no per-element diff/sync. |
| `isDeleted: false` (soft-delete tombstone) | ABSENT | — | `newElement.ts:148` | Ours hard-deletes from the `elements` map; `hidden` (`types.ts:166`) is a render flag, not a tombstone. Intentional (no collab merge → no tombstones). |
| oversize guard (`x/y/w/h` ∉ ±1e6 → `console.error`) | ABSENT | — | `newElement.ts:103-123` | No equivalent sanity clamp/log in `createElement`. Minor real gap (see divergences). |
| default props merge (`DEFAULT_ELEMENT_PROPS`) | DIVERGENT | `defaults.ts:122-131` `BASE_STYLE`+`defaultStyle` | `newElement.ts:83-99`, `constants.ts:422-431` | Same idea (defaults under caller overrides). Different defaults: opacity 1 vs 100; strokeWidth bucket `'bold'` vs numeric 2; no `roughness`. See divergences. |
| `newTextElement` (measure → size → align-offset) | DIVERGENT | `createElement('text', …)` `defaults.ts:265,27` | `newElement.ts:239-291` | Excalidraw measures the glyphs and sets `width/height` from metrics + shifts x/y by text/vertical align. Ours uses a fixed default box (240×32) and never measures. Behavioral, but intentional: text is a semantic region, not laid-out glyphs. |
| `getTextElementPositionOffsets` | ABSENT | — | `newElement.ts:217-237` | Tied to glyph measurement; n/a (no text metrics). Intentional. |
| `getAdjustedDimensions` / `refreshTextDimensions` | ABSENT | — | `newElement.ts:293-440` | Re-measure-on-edit for text. n/a (no measured text). Intentional. |
| `adjustXYWithRotation` | ABSENT | — | `newElement.ts:373-418` | Rotation-aware reflow of text box on resize. Ours stores rotation (`types.ts:159`) but resize math lives in `editor.svelte.ts`, not the factory. Out of axis. |
| `newFrameElement` / `newMagicFrameElement` | DIVERGENT | `createElement('frame', …)` `defaults.ts:62-64,135-137` | `newElement.ts:183-215` | Both special-case frames. Excalidraw adds a `name` field + `magicframe` variant; ours has a single `frame` semantic type with a `LayoutIntent`, no AI-magic variant. Scope difference. |
| `newImageElement` (strokeColor transparent, status/fileId/scale/crop) | DIVERGENT | `createElement('image', …)` `defaults.ts:267,151,240-246` | `newElement.ts:527-546` | Both seed image-specific fields. Ours: `fit:'cover'`, optional `alt`/`aspectRatio`. No async `status`/`fileId` (R2/file pipeline) — images here are layout placeholders. Scope difference. |
| `newLinearElement` / `newArrowElement` / `newFreeDrawElement` | ABSENT | — | `newElement.ts:442-525` | No freeform/linear primitives. Intentional per scope (semantic UI only). `divider` (`types.ts:289`) is the nearest cousin but is a styled box, not a points-array line. |
| `newEmbeddableElement` / `newIframeElement` | ABSENT | — | `newElement.ts:165-181` | No live web embeds. Intentional. `svg` element (`types.ts:300`) is the inert analogue. |
| `isImageElement` / `isTextElement` / `isFrameElement` … (type guards) | DIVERGENT | `isContainerType` `types.ts:77-79` + discriminant `el.type === …` | `typeChecks.ts:40-91` | Ours has one membership guard (`isContainerType`) over a const tuple; per-type narrowing is done inline via the `type` discriminant + `ElementByType` map (`types.ts:495-533`). Excalidraw exports a guard per type. Same narrowing behavior, different surface. |
| `isFrameLikeElement` / `isIframeLikeElement` (category guards) | DIVERGENT | `CONTAINER_TYPES` tuple + `isContainerType` `types.ts:60-79` | `typeChecks.ts:84-91,58-64` | Both define "category membership." Ours: a single broad `container` category (13 types). Excalidraw: many fine-grained categories (frame-like, iframe-like, bindable, rectanguloid…). Coarser by design. |
| `isBindableElement` / `isTextBindableContainer` / `hasBoundTextElement` / `isBoundToContainer` | ABSENT | — | `typeChecks.ts:177-302` | Text-to-container binding model. Ours has no bound-text concept (`label`/`content` are inline string fields). Intentional. |
| `isBindingElement` / `isArrowBoundToElement` | ABSENT | — | `typeChecks.ts:160-175,304-306` | Arrow binding. No arrows. Intentional. |
| `isUsingAdaptiveRadius` / `isUsingProportionalRadius` / `canApplyRoundnessTypeToElement` / `getDefaultRoundnessTypeForElement` | DIVERGENT | per-type `radius` in `perTypeStyle` `defaults.ts:133-212` | `typeChecks.ts:308-356` | Both decide corner rounding by type. Excalidraw computes an adaptive vs proportional roundness *type* at render. Ours bakes a fixed px `radius` per semantic type at create time. Simpler, static. |
| `isValidPolygon` / `canBecomePolygon` / `getLinearElementSubType` | ABSENT | — | `typeChecks.ts:358-371,380-394` | Polygon/line geometry. No linear elements. Intentional. |
| `isFlowchartNodeElement` / `isEligibleFrameChildType` | DIVERGENT | `isContainerType` (parent eligibility) `types.ts:77` | `typeChecks.ts:274-282,396-414` | `isEligibleFrameChildType` whitelists which types may be a frame child; ours allows any element to nest under any container (`parentId`, `types.ts:152`) and gates by container-ness of the *parent*, not the child type. Behavioral difference in nesting rules. |
| `isExcalidrawElement` (runtime schema check w/ `assertNever`) | ABSENT | — | `typeChecks.ts:244-272` | No runtime "is this one of my element types" validator on load. Persistence trusts the `.lfdoc` shape. Minor gap (see divergences). |

### Divergences & gaps

1. **id generation — UUID v7 (monotonic) vs nanoid; non-overridable vs overridable.**
   Ours: `uuid.ts:16-56` always self-mints a time-sortable UUID v7 with a 12-bit
   intra-millisecond monotonic counter (`seq`, `uuid.ts:14,21-31`) and a backwards-clock
   clamp (`uuid.ts:28`). `createElement` explicitly strips any caller-supplied `id`
   (`defaults.ts:387,392`) so it can NEVER be overridden. Excalidraw uses
   `rest.id || randomId()` (`newElement.ts:127`) where `randomId()` is `nanoid()`
   (`random.ts:16`) — opaque, non-time-ordered, and **caller-overridable** (needed for
   collab reconciliation and remote element insertion). Severity: behavioral. The
   non-overridable policy is a deliberate, stronger invariant for a single-user file
   (no id collision-resolution needed); the v7 time-ordering is a feature (sortable
   files/library rows). Not a bug, but a genuine algorithmic divergence to record.

2. **No oversize position/size guard.** Excalidraw logs (`newElement.ts:103-123`) when
   any of x/y/w/h falls outside ±1e6. `createElement` (`defaults.ts:368-416`) has no
   such guard; a runaway drag or a malformed paste can mint an element with absurd
   geometry silently. Severity: bug-risk (low). Real, if minor, gap — worth a clamp or
   dev-mode warning given the infinite canvas.

3. **Default style values differ from Excalidraw's `DEFAULT_ELEMENT_PROPS`.**
   `BASE_STYLE` (`defaults.ts:122-127`) uses `opacity: 1` (0..1 scale, per
   `types.ts:146`) whereas Excalidraw uses `opacity: 100` (0..100, `constants.ts:429`).
   `strokeWidth` is a bucket `'bold'` (`defaults.ts:123`, → 2px via `STROKE_WIDTH_PX`,
   `types.ts:107`) vs Excalidraw's raw `2` (`constants.ts:426`). Ours has no
   `roughness` (no rough.js). Severity: cosmetic — the scales are internally consistent
   within each app; only matters if a document were ever cross-imported (not a goal).

4. **Text is a fixed semantic box, not measured glyphs.** `newTextElement`
   (`newElement.ts:239-291`) derives width/height from `measureText` and offsets x/y by
   align. Ours mints text at a static 240×32 (`defaults.ts:27`) with `textRole`/
   `textAlign` metadata only (`defaults.ts:266`). Severity: behavioral, intentional —
   text exports as a semantic heading/body region, not pixel-fitted type. Recorded
   because it is the single largest factory-algorithm difference.

5. **Frame-child eligibility is inverted.** Excalidraw gates nesting on the *child's*
   type (`isEligibleFrameChildType`, `typeChecks.ts:396-414`). Ours gates on the
   *parent's* container-ness (`isContainerType`, `types.ts:77`) and lets any element
   nest under any container via `parentId`. Severity: behavioral. Looser model; fine for
   a layout tool but means e.g. a frame could be parented under a card, which Excalidraw
   forbids. Worth noting if nesting rules ever tighten.

6. **No runtime element-schema validator on load.** Excalidraw's `isExcalidrawElement`
   (`typeChecks.ts:244-272`) uses `assertNever` to reject unknown element types at
   runtime. Ours trusts the deserialized `.lfdoc` shape (no equivalent guard in this
   axis). Severity: bug-risk (low) — a hand-edited or future-version file with an
   unknown `type` would flow into the renderer/exporter unchecked. Acceptable for a
   local single-user file but a real gap vs the reference.

### Our extensions (no Excalidraw counterpart)

- **`SemanticType` union of 37 UI-component types** (`types.ts:14-57`) and the
  `ElementByType` precise-typing map (`types.ts:495-533`) — the core domain model.
  Excalidraw has ~13 drawing primitives; the entire semantic vocabulary is an extension.
- **`LayoutIntent`** (`types.ts:90-102`) + `defaultLayout` (`defaults.ts:60-118`):
  per-container flex/grid/gap/justify/align/responsive intent baked at create time. No
  Excalidraw analogue (Excalidraw is freeform geometry, not layout intent).
- **`defaultLabel`** (`defaults.ts:215-256`): human label per type, surfaced in the
  Markdown export. No counterpart.
- **`typeSpecificDefaults`** (`defaults.ts:259-348`): rich per-type seed content
  (button text, table columns, breadcrumb items, hero copy, etc.) so a dropped element
  looks intentional. Excalidraw's per-type extras (points/arrowheads/fileId) are
  geometric, not content.
- **`IconRef` + per-element embedded icon** (`types.ts:124-128,177`) and the standalone
  `IconElement` / `SvgElement` (`types.ts:282-306`): offline Phosphor icon identity +
  sanitized SVG body for round-trippable, code-generatable icons. No counterpart.
- **`isContainerType` over a const tuple** (`types.ts:60-79`): single coarse
  container-membership guard replacing Excalidraw's guard-per-category family.
- **`ClipboardPayload`** (`types.ts:549-552`) — a typed subtree whose ids are explicitly
  regenerated on paste (consistent with the non-overridable-id invariant in divergence 1).
- **`createBlankDocument`** (`defaults.ts:419-432`) — whole-document factory (canvas
  size, OKLCH background, v7 doc id). Excalidraw's app-level scene init is not in this
  element-model axis.
