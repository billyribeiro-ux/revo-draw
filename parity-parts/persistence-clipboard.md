## Parity: persistence-clipboard

Axis focus: save / open / restore / validate, clipboard copy/paste envelope, version migration.

OUR files:
- `src/lib/persistence/document-file.ts` — save/open/save-as/import/export + atomic autosave + browser fallbacks
- `src/lib/persistence/clipboard.ts` — OS clipboard envelope (`layoutforge/elements`)
- `src/lib/persistence/migrate.ts` — forward-only `schemaVersion` migration seam

EXCALIDRAW files:
- `packages/excalidraw/data/restore.ts` — element/appState/library restore + repair (data healing)
- `packages/excalidraw/data/json.ts` — serialize/validate envelope (`type: "excalidraw"`)
- `packages/excalidraw/clipboard.ts` — clipboard envelope + multi-MIME read/write

These two products differ at the data-model level. Excalidraw restores a flat, ordered array of
heterogeneous drawing primitives (arrows, freedraw, text-with-bindings, frames, images, files) and
spends most of `restore.ts` *healing* cross-element references (bindings, containers, frame
membership, fractional indices). LayoutForge stores a keyed map + `rootOrder` of semantic UI
elements with parent/child nesting, single-user, no collab, no binary files, no fractional-index
reconciliation. So the bulk of `restore.ts` is intentionally ABSENT, and our migration seam is a
deliberately thinner analog of Excalidraw's per-element `restoreElementWithProperties` defaulting.

### Classification table

| Excalidraw fn | Status | Ours ref | Excal ref | Note |
|---|---|---|---|---|
| `serializeAsJSON` (typed envelope: type/version/source/elements/appState/files, `JSON.stringify(_,null,2)`) | DIVERGENT | `document-file.ts:58` `serializeDocument` | `json.ts:52` | Both pretty-print with 2-space indent. Ours serializes the whole `LayoutDocument` verbatim (id/name/schemaVersion/elements/rootOrder/canvas); Excalidraw wraps in an export envelope with `type`/`version`/`source` and strips files/appState by mode. Our envelope identity lives *inside* the doc (`schemaVersion`), not a wrapper. severity: cosmetic. |
| `isValidExcalidrawData` (validate parsed import: `type==="excalidraw"`, elements array, appState object) | MATCH | `document-file.ts:42` `isLayoutDocument` | `json.ts:115` | Both are runtime type-guards gating an import. Ours checks `schemaVersion===SCHEMA_VERSION` + required shape (id/name/elements obj/rootOrder array/canvas obj); Excal checks `type` tag + loose element/appState shape. Same role: reject foreign/malformed payloads before load. |
| `loadFromJSON` / `loadFromBlob` (pick file -> parse -> restore) | MATCH | `document-file.ts:123` `openDocument` / `:145` `openDocumentAtPath` | `json.ts:102` | Both: pick file, read text, JSON.parse, run restore/migrate, validate, return restored doc. Ours adds Tauri-vs-browser host split + library index update. |
| `saveAsJSON` (serialize -> Blob -> fileSave with handle reuse) | MATCH | `document-file.ts:70` `saveDocument` / `:96` `saveDocumentAs` | `json.ts:77` | Both serialize then write via native picker, remembering the path/handle. Ours splits save (reuse path) vs save-as (always prompt); Excal reuses `fileHandle` unless it's an image handle. |
| `restoreElements` (iterate, drop `selection`, dedupe ids, restore each, sync indices, repair) | DIVERGENT | `migrate.ts:22` `migrateDocument` (+ `:56` `normalizeLegacyIcons`) | `restore.ts:764` | Ours has NO per-element id-dedupe, no `syncInvalidIndices`, no binding/container/frame repair pass — intentional: our model is a keyed map with explicit `rootOrder`, no fractional indices, no cross-element bindings. We DO have an analogous normalization walk (`normalizeLegacyIcons`). severity: behavioral (scoped: most repair has no counterpart in our model). |
| `restoreElement` (per-type defaulting of every field, font/lineHeight detection, legacy field migration) | DIVERGENT | `migrate.ts:56` `normalizeLegacyIcons` | `restore.ts:413` | Excal fills missing defaults for every element field on load (opacity, strokeWidth, version, roundness, etc.) so old/partial elements never crash the renderer. Ours does NOT default-fill element fields on load — it relies on `createElement()` defaults at creation time and only migrates the legacy `iconName`/`iconSvgPath` pair to unified `icon`. A hand-edited `.lfdoc` missing fields would not be healed. severity: bug-risk. |
| `restoreElementWithProperties` (`element.x ?? 0`, `version || 1`, opacity null-coalesce, strip legacy props) | DIVERGENT | (none — relies on `createElement` defaults) | `restore.ts:327` | Same intent as above: tolerant field defaulting. We have no load-time field-coercion layer. severity: bug-risk (only matters for externally-mutated files). |
| `repairBinding` / `repairContainerElement` / `repairBoundElement` / `repairFrameMembership` | ABSENT | — | `restore.ts:200/664/712/751` | Intentional. No arrow bindings, bound-text containers, or frames-as-binding-targets in our model. Our nesting is parent/child via `rootOrder`/children, not boundElements arrays. Not a gap. |
| `restoreLinearElementPoints` / `restoreFreedrawPoints` | ABSENT | — | `restore.ts:101/126` | Intentional. No freedraw/linear point arrays or pressure data in semantic-UI elements. Not a gap. |
| `restoreAppState` (coalesce supplied/local/default per key, legacy key migration, zoom number->object, grid normalize) | DIVERGENT | `document-file.ts` (`doc.canvas` loaded verbatim) | `restore.ts:1013` | Excal merges three sources (file appState / local appState / defaults) key-by-key, migrates legacy keys, normalizes zoom/grid. Ours loads `doc.canvas` as-is with no per-key defaulting or legacy-key migration. Acceptable given single-user + simpler canvas state, but no resilience to a partial/foreign `canvas`. severity: behavioral. |
| `restoreLibraryItems` / `restoreLibraryItem` (migrate array-form items, default id/status/created) | ABSENT | — | `restore.ts:1100/1108` | No library-of-reusable-element-groups concept. Our `library-db.ts` is a *document index* (metadata), a different thing. Not a gap. |
| `bumpElementVersions` (version+1 for reconciliation) | ABSENT | — | `restore.ts:957` | Intentional. No version/versionNonce reconciliation; undo/redo uses immutable snapshots (`history.svelte.ts`), no collab merge. Not a gap. |
| `serializeAsClipboardJSON` (typed `excalidrawClipboard` envelope, gather files, strip frameId for orphaned frame children) | DIVERGENT | `clipboard.ts:13` `writeClipboard` | `clipboard.ts:142` | Both build a typed JSON envelope of elements. Excal also collects referenced binary files and rewrites `frameId:null` for elements copied without their frame. Ours just `JSON.stringify(payload)` — caller pre-builds the `{kind, elements}` payload; no file gathering, no frame-orphan fixup (no files/frames in model). severity: behavioral (scoped). |
| `copyToClipboard` (serialize -> write both `excalidrawClipboard` + `text/plain` MIME) | DIVERGENT | `clipboard.ts:13` `writeClipboard` | `clipboard.ts:194` | Excal writes the JSON under BOTH a custom MIME and `text/plain` so paste works across surfaces. Ours writes only `text/plain` via `navigator.clipboard.writeText` and tags the envelope with an in-payload `kind: "layoutforge/elements"` field instead of a real custom MIME type. severity: behavioral. |
| `copyTextToSystemClipboard` (3-tier: clipboardEvent -> writeText -> execCommand) | DIVERGENT | `clipboard.ts:13` `writeClipboard` | `clipboard.ts:586` | Excal has a 3-stage fallback chain (paste-event dataTransfer, `navigator.clipboard.writeText`, legacy `document.execCommand`). Ours uses only `navigator.clipboard.writeText` guarded by optional-chaining; on failure it silently relies on the editor's in-process copy. No execCommand fallback. severity: behavioral. |
| `parseClipboard` / `parseClipboardEventTextData` (detect our envelope via `clipboardContainsElements`, else text/mixedContent) | DIVERGENT | `clipboard.ts:24` `readClipboard` | `clipboard.ts:522` | Both recognize the app's own JSON envelope and ignore foreign clipboard text. Ours checks `parsed.kind === MIME_TAG && Array.isArray(parsed.elements)` (analogous to `clipboardContainsElements`, `clipboard.ts:73`). Ours has no HTML/mixedContent/image-URL parsing path (intentional: no image paste). severity: cosmetic (the element-recognition core matches; extras are out of scope). |
| `readSystemClipboard` (multi-MIME `navigator.clipboard.read()` with readText fallback) | DIVERGENT | `clipboard.ts:24` `readClipboard` | `clipboard.ts:256` | Ours only `readText()`; Excal reads multiple MIME types/images via `clipboard.read()`. Scoped out (text envelope only). severity: cosmetic. |
| `clipboardContainsElements` (envelope type-guard) | MATCH | `clipboard.ts:30-37` (inline in `readClipboard`) | `clipboard.ts:73` | Same algorithm: check envelope type tag + `Array.isArray(elements)`. Ours inlines it; Excal accepts 3 type tags, ours one (`layoutforge/elements`). |
| `filterOutDeletedFiles` (drop files referenced only by deleted elements on export) | ABSENT | — | `json.ts:34` | Intentional — no binary files. Not a gap. |
| `serializeLibraryAsJSON` / `saveLibraryAsJSON` / `isValidLibrary` | ABSENT | — | `json.ts:128/137/147` | Intentional — no `.excalidrawlib` library export. Not a gap. |
| `copyBlobToClipboardAsPng` (write PNG blob to clipboard) | ABSENT | — | `clipboard.ts:556` | We export PNG to *file* (`document-file.ts:166` `exportDocument` png branch) but never copy a PNG to clipboard. Minor gap vs Excal, not in our documented scope. |
| `createPasteEvent` / `parseDataTransferEvent` / `parseHTMLTree` (synthetic events, drag-drop, HTML tree walk) | ABSENT | — | `clipboard.ts:89/466/212` | Intentional — no drag-drop import, no HTML paste, no React synthetic events. Not a gap. |
| (atomic crash-safe write: tmp + rename, backup-swap fallback) | EXTENSION | `document-file.ts:240` `atomicWrite` / `:278` `writeAutosave` | — | Excalidraw has no equivalent in these files (it relies on the File System Access API / browser download). Our autosave is a genuine extension. |
| (debounced autosave scheduler) | EXTENSION | `document-file.ts:304` `Autosave` | — | No counterpart; Excal app-level autosave lives outside these files (localStorage-based). |
| (forward-only `schemaVersion` step machine) | EXTENSION | `migrate.ts:22` `migrateDocument` | — | Excal does data-healing on load but has no explicit numbered forward-step migration framework in these files; ours is structured (`STEPS` table, guard loop, reject-if-newer). |
| (semantic Markdown / SVG / PNG export dispatch) | EXTENSION | `document-file.ts:166` `exportDocument` | — | The Markdown export compiler is LayoutForge's core product; Excal's analog (PNG/SVG) lives in other files, and Markdown has no counterpart at all. |

### Divergences & gaps

1. **No load-time element field defaulting (bug-risk).** Excalidraw's `restoreElement` /
   `restoreElementWithProperties` (`restore.ts:413/327`) defensively fill every element field with
   a default on load (`element.x ?? 0`, `version || 1`, `opacity == null ? default : opacity`,
   roundness inference, legacy-prop stripping). LayoutForge's load path (`openDocument` ->
   `migrateDocument` -> `isLayoutDocument`) does NOT heal element interiors — `normalizeLegacyIcons`
   only migrates the `iconName`/`iconSvgPath` pair (`migrate.ts:56`). A `.lfdoc` that round-trips
   through our own `createElement()` is always complete, so in practice this is safe; but a
   hand-edited or externally-produced file with a missing field passes `isLayoutDocument`
   (which only checks top-level shape, `document-file.ts:42`) and reaches the renderer un-healed.
   Excalidraw is strictly more robust here.

2. **`restoreElements` repair passes absent (behavioral, mostly scoped).** The entire
   binding/container/frame/index-repair machinery (`restore.ts:764-945`, plus `repairBinding`
   `:200`, `repairContainerElement` `:664`, `repairBoundElement` `:712`, `repairFrameMembership`
   `:751`, `syncInvalidIndices`) has no analog. Justified: our model has no arrow bindings, no
   bound-text containers, no fractional indices. The one piece that *could* matter — **duplicate-id
   detection** (`restore.ts:818`, regenerates id on collision) — has no analog in
   `migrateDocument`. If a `.lfdoc` `elements` map somehow contained a child referenced twice in
   `rootOrder`/children, we would not detect or repair it. Low likelihood given the keyed-map shape.

3. **`restoreAppState` per-key coalescing absent (behavioral).** Excal merges file/local/default
   appState key-by-key and migrates legacy keys + normalizes zoom/grid (`restore.ts:1013`). We load
   `doc.canvas` verbatim. A partial/foreign `canvas` object (missing zoom/pan) is not normalized,
   so a malformed canvas could produce a bad camera. `isLayoutDocument` only checks `canvas` is a
   non-null object, not its fields.

4. **Clipboard envelope uses an in-payload tag, not a custom MIME (behavioral).** Excal writes the
   JSON under a real `application/vnd.excalidraw+json`-style MIME *and* `text/plain`
   (`clipboard.ts:194/202`), and on read inspects multiple MIME types. Ours writes only `text/plain`
   and self-identifies via a `kind: "layoutforge/elements"` field inside the JSON
   (`clipboard.ts:11/13/30`). Functionally equivalent for round-tripping within the app, but ours
   cannot coexist with other clipboard producers/consumers the way a custom MIME would, and a plain
   copy-as-text of our JSON by an external tool would be re-recognized as elements on paste.

5. **No clipboard write fallback chain (behavioral).** Excal's `copyTextToSystemClipboard`
   (`clipboard.ts:586`) tries clipboardEvent -> `writeText` -> `execCommand`. Ours
   (`clipboard.ts:13`) tries only `writeText` and swallows failures, leaning on the editor's
   in-process copy buffer. Acceptable for a single desktop webview where the in-process buffer
   always works, but cross-focus OS paste fails silently if `writeText` is unavailable.

6. **No PNG-to-clipboard.** Excal `copyBlobToClipboardAsPng` (`clipboard.ts:556`) is absent; we only
   export PNG to a file (`exportDocument`, `document-file.ts:166`). Minor, outside documented scope.

7. **Migration framework shape differs (not a defect).** `migrateDocument` (`migrate.ts:22`) is a
   numbered forward-step machine with a misbehaving-step guard, a `version > SCHEMA_VERSION` reject
   (file newer than app), and a 64-iteration loop guard. Excalidraw has no numbered-step framework
   in these files — it does inline data-healing on every load regardless of version. Ours is more
   explicit/auditable; Excal's is more tolerant. Today `STEPS` is empty (v1 only), so
   `migrateDocument` is effectively a validator + icon normalizer.

### Our extensions (no Excalidraw counterpart in these files)

- **`atomicWrite` (`document-file.ts:240`)** — crash-safe tmp-write + atomic rename, with a
  backup-swap fallback when the platform rejects rename-over-existing. Injectable `AtomicFs` so the
  crash-simulation can be unit-tested. No analog in Excalidraw's persistence files.
- **`writeAutosave` / `readAutosave` (`document-file.ts:278/289`)** — app-data autosave slot,
  migrated + validated on read, returns `null` (not throw) on malformed payload so launch never
  crashes.
- **`Autosave` debounced scheduler (`document-file.ts:304`)** — `schedule()`/`flush()` with
  in-flight guard and best-effort error swallowing.
- **Tauri-vs-browser host split** — every save/open/export branches on `isTauri()` with browser
  download / `<input type=file>` fallbacks (`document-file.ts:359-401`), including `oncancel`
  handling. Excalidraw is browser-only.
- **Library index integration (`indexDocument`, `document-file.ts:403`)** — every save/open upserts
  a metadata row in the SQLite document index; failures never block the file write.
- **`migrateDocument` forward-step framework (`migrate.ts:22`)** — structured numbered migration vs
  Excalidraw's inline per-element healing.
- **Multi-format `exportDocument` dispatch (`document-file.ts:166`)** including the semantic
  **Markdown** export — LayoutForge's core product output, with no Excalidraw counterpart.
