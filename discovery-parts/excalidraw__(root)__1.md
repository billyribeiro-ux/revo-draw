## Cluster: excalidraw__(root)__1

This cluster covers seven root-level support modules of the `@excalidraw/excalidraw` package: string deburring, the scoped Jotai store, the error-class hierarchy, multi-touch gesture math, ambient global type declarations, the undo/redo history engine, and the i18n/translation runtime.

---

### packages/excalidraw/deburr.ts

Diacritics-stripping helper (lodash-derived) that maps accented Latin characters to single ASCII letters and removes combining marks, used to make text search/indexing accent-insensitive.

- **Constant `rsComboMarksRange`** (L4) — string `"\\u0300-\\u036f"`, the Unicode range for combining diacritical marks.
- **Constant `reComboHalfMarksRange`** (L5) — string `"\\ufe20-\\ufe2f"`, combining half-marks range.
- **Constant `rsComboSymbolsRange`** (L6) — string `"\\u20d0-\\u20ff"`, combining diacritical marks for symbols.
- **Constant `rsComboRange`** (L7-L8) — concatenation of the three ranges above.
- **Constant `rsCombo`** (L9) — character-class string `[${rsComboRange}]`.
- **Constant `reComboMark`** (L11) — `RegExp(rsCombo, "g")`; global regex matching any combining mark (stripped to empty).
- **Constant `reLatin`** (L13) — `/[\xc0-\xd6\xd8-\xf6\xf8-\xffĀ-ſ]/g`; matches Latin-1 Supplement + Latin Extended-A accented letters.
- **Constant `deburredLetters`** (L25-L85) — a large object literal mapping each accented codepoint (e.g. `'\xc0'` → `'A'`, `'\xdf'` → `'s'`, ligatures `\xc6`→`'E'`, `Œ`→`'E'`) to a single ASCII letter. NOTE (per the in-file comment L15-L22): replacements are deliberately modified from lodash to always collapse to a single-letter phonetic form so that match indices stay aligned for search highlighting; this is intentionally lossy vs. lodash's multi-char expansions.
- **`deburr = (str: string) => string`** (L87-L93) — replaces every `reLatin` match via lookup in `deburredLetters` (falling back to the original char if absent), then strips all `reComboMark` matches. Pure function, no side effects. Exported.

---

### packages/excalidraw/editor-jotai.ts

Creates an isolated (scoped) Jotai instance so the editor's atoms do not collide with any host application's global Jotai store, and re-exports the scoped hooks plus a singleton store.

- **`createIsolation()` call → `jotai`** (L10) — produces an isolated React context + hook set via `jotai-scope`, preventing cross-talk with a consumer app's atoms.
- **Re-exports `atom`, `PrimitiveAtom`, `WritableAtom`** (L12) — pass-through from `jotai` (the `eslint-disable no-restricted-imports` on L1 is the only sanctioned direct `jotai` import).
- **Exported `useAtom`, `useSetAtom`, `useAtomValue`, `useStore`** (L13) — the scoped hook quartet destructured from `jotai`.
- **`EditorJotaiProvider`** (L14-L16) — typed as the isolation's `Provider`; React provider that must wrap editor components for the scoped atoms to resolve.
- **`editorJotaiStore`** (L18) — a module-level singleton `createStore()` instance used for imperative `.get()`/`.set()` outside React (e.g. `i18n.ts` writes the lang-code atom into it). Side effect: a single shared store created at import time.

---

### packages/excalidraw/errors.ts

Defines the package's typed `Error` subclass hierarchy used for canvas export failures, aborts, image-scene decoding, worker setup, generic handled errors, and HTTP request errors.

- **Type `CANVAS_ERROR_NAMES`** (L1) — union `"CANVAS_ERROR" | "CANVAS_POSSIBLY_TOO_BIG"`.
- **class `CanvasError extends Error`** (L3-L12) — `constructor(message = "Couldn't export canvas.", name: CANVAS_ERROR_NAMES = "CANVAS_ERROR")`. Calls `super()` with no arg, then sets `this.name` and `this.message` manually. Used to flag oversized/failed canvas exports.
- **class `AbortError extends DOMException`** (L14-L18) — `constructor(message = "Request Aborted")` calling `super(message, "AbortError")`; a DOM-spec-compatible abort error (so `.name === "AbortError"`).
- **Type `ImageSceneDataErrorCode`** (L20-L22) — union `"IMAGE_NOT_CONTAINS_SCENE_DATA" | "IMAGE_SCENE_DATA_ERROR"`.
- **class `ImageSceneDataError extends Error`** (L24-L34) — has public `code` field; `constructor(message = "Image Scene Data Error", code = "IMAGE_SCENE_DATA_ERROR")`. NOTE: sets `this.name = "EncodingError"` (not the class name) — a deliberate quirk for matching DOMException-style encoding errors.
- **Type `WorkerErrorCodes`** (L36) — union `"WORKER_URL_NOT_DEFINED" | "WORKER_IN_THE_MAIN_CHUNK"`.
- **class `WorkerUrlNotDefinedError extends Error`** (L38-L48) — public `code`; `constructor(message = "Worker URL is not defined!", code = "WORKER_URL_NOT_DEFINED")`; `name = "WorkerUrlNotDefinedError"`.
- **class `WorkerInTheMainChunkError extends Error`** (L50-L60) — public `code`; `constructor(message = "Worker has to be in a separate chunk!", code = "WORKER_IN_THE_MAIN_CHUNK")`; `name = "WorkerInTheMainChunkError"`. Guards the requirement that workers live in their own chunk.
- **class `ExcalidrawError extends Error`** (L66-L71) — `constructor(message: string)`; `name = "ExcalidrawError"`. Documented (L62-L65) as the generic handled-error type to `instanceof`-check and rethrow.
- **class `RequestError extends Error`** (L73-L90) — public `status: number` and `data: any`. `toObject()` (L76-L78) returns `{ name, status, message }` (omits `data`). `constructor({ message = "Something went wrong", status = 500, data } = {})` (L79-L89) calls bare `super()` then assigns `name`, `message`, `status`, `data`. Used for wrapping failed HTTP/API calls with structured status/payload.

---

### packages/excalidraw/gesture.ts

Pure multi-touch gesture math helpers: compute the centroid of active pointers and the distance between two pointers (for pinch-zoom and two-finger pan).

- **`getCenter = (pointers: Map<number, PointerCoords>) => { x: number; y: number }`** (L3-L9) — converts the pointer map's values to an array and returns the arithmetic mean of all `x` and all `y` (centroid). Coordinate space is whatever the caller stores in `PointerCoords` (screen/client coords). Used as the focal point for pinch-zoom. Invariant: divides by `allCoords.length`, so an empty map yields `NaN` (caller must guarantee ≥1 pointer).
- **`getDistance = ([a, b]: readonly PointerCoords[]) => number`** (L11-L12) — Euclidean distance via `Math.hypot(a.x - b.x, a.y - b.y)` between exactly the first two pointers (destructured). Used for pinch-zoom scale ratio. Notable: only the first two elements are read even if more pointers exist.
- **`sum = <T>(array: readonly T[], mapper: (item: T) => number): number`** (L14-L15, internal/not exported) — generic reducer summing `mapper(item)` over the array; helper for `getCenter`.

Geometry note for parity: `getCenter` is a plain average (not bounding-box center); `getDistance` is straight-line hypot. Both operate in raw pointer/client space — any world-space conversion happens at the call site.

---

### packages/excalidraw/global.d.ts

Ambient global TypeScript declarations: augments `Window`, `CanvasRenderingContext2D`, `Clipboard`, `Blob`, `ArrayBuffer`/`Uint8Array`, declares PNG-chunk and image-blob-reduce modules, and registers custom Jest matchers. Types-only file — no runtime code.

- **`interface Window` augmentation** (L1-L11) — adds `ClipboardItem: any`, `__EXCALIDRAW_SHA__`, `EXCALIDRAW_ASSET_PATH` (string|string[]|undefined), `EXCALIDRAW_THROTTLE_RENDER: boolean | undefined`, `DEBUG_FRACTIONAL_INDICES: boolean | undefined`, `EXCALIDRAW_EXPORT_SOURCE: string`, and analytics hooks `gtag`, `sa_event`, `fathom.trackEvent`.
- **`interface CanvasRenderingContext2D` augmentation** (L13-L27) — declares the optional `roundRect?(x, y, width, height, radii)` method with the full overloaded `radii` tuple union (1–4 corner radii). Relevant for canvas rounded-rect rendering parity / feature-detection.
- **`interface Clipboard` augmentation** (L29-L31) — adds `write(data: any[]): Promise<void>`.
- **Type `TEXtChunk`** (L35) — `{ name: "tEXt"; data: Uint8Array }`.
- **`declare module "png-chunk-text"`** (L37-L43) — `encode(name, value)` and `decode(data)` for PNG tEXt chunks (scene data embedded in exported PNGs).
- **`declare module "png-chunks-encode"`** (L44-L47) — default-exported `encode(chunks: TEXtChunk[]): Uint8Array<ArrayBuffer>`.
- **`declare module "png-chunks-extract"`** (L48-L51) — default-exported `extract(buffer): TEXtChunk[]`.
- **`interface Blob` augmentation** (L54-L57) — optional `handle?: FileSystemFileHandle` and `name?: string` (for File System Access API round-tripping).
- **`declare module "*.scss"`** (L59) — allows importing SCSS modules.
- **`interface ArrayBuffer` / `interface Uint8Array` brands** (L65-L70) — optional `_brand` phantom fields to defeat TS structural typing so `Uint8Array` isn't assignable to `ArrayBuffer` (per the cited TS issue).
- **`declare module "image-blob-reduce"`** (L74-L100) — full type surface for the image-resize lib: `ImageBlobReduce.toBlob(file, options)`, internal `_create_blob`, the static/callable `ImageBlobReduceStatic`, and `ImageBlobReduceOptions extends PicaResizeOptions { max: number }`.
- **`interface CustomMatchers`** (L102-L108) — `toBeNonNaNNumber()` and `toCloselyEqualPoints(points, precision?)` custom test matchers.
- **`declare namespace jest`** (L110-L113) — extends `Expect` and `Matchers` with `CustomMatchers`.

---

### packages/excalidraw/history.ts

The editor's undo/redo engine: defines a history-specific store delta, the change event, and the `History` class managing undo/redo stacks via immutable snapshot deltas with structural sharing.

- **class `HistoryDelta extends StoreDelta`** (L15-L81):
  - **`applyTo(elements, appState, snapshot): [SceneElementsMap, AppState, boolean]`** (L19-L46) — applies the element delta against `elements` (falling back to `snapshot.elements` for force-deleted elements) while **excluding `version` and `versionNonce`** from being applied (L30-L34) so undo/redo always produces a fresh version for collaboration; then applies the appState delta; returns next elements, next appState, and a combined `appliedVisibleChanges` boolean. Does not mutate the snapshot (per doc comment L16-L18).
  - **`static override calculate(prevSnapshot, nextSnapshot)`** (L51-L56) — delegates to `super.calculate` and casts the result to `HistoryDelta`.
  - **`static override inverse(delta: StoreDelta): HistoryDelta`** (L61-L63) — `super.inverse` cast to `HistoryDelta`.
  - **`static override applyLatestChanges(delta, prevElements, nextElements, modifierOptions?)`** (L68-L80) — `super.applyLatestChanges(...)` cast to `HistoryDelta`; `modifierOptions` is `"deleted" | "inserted"`.
- **class `HistoryChangedEvent`** (L83-L88) — value object with readonly `isUndoStackEmpty = true` and `isRedoStackEmpty = true`; emitted to update UI button enable/disable state.
- **class `History`** (L90-L249):
  - **Field `onHistoryChangedEmitter`** (L91-L93) — `Emitter<[HistoryChangedEvent]>` notifying subscribers of stack-emptiness changes.
  - **Fields `undoStack` / `redoStack`** (L95-L96) — readonly arrays of `HistoryDelta`.
  - **Getters `isUndoStackEmpty` / `isRedoStackEmpty`** (L98-L104) — length-zero checks.
  - **`constructor(private readonly store: Store)`** (L106) — holds the `Store` reference used to read snapshots and schedule micro-actions.
  - **`clear()`** (L108-L111) — truncates both stacks to length 0.
  - **`record(delta: StoreDelta)`** (L117-L137) — entry point for recording a durable local increment. Skips empty deltas and re-records (guard `delta instanceof HistoryDelta`, L118, prevents re-recording history-originated deltas). Inverts the delta (L123) so the undo entry restores prior state, pushes to `undoStack`, and **only resets `redoStack` when the delta has non-empty element changes** (L127-L132) — deliberate so a bare appState change (e.g. a click/deselect) doesn't wipe redo history. Triggers the changed event.
  - **`undo(elements, appState)`** (L139-L146) — calls `perform` popping `undoStack` and pushing onto `redoStack`.
  - **`redo(elements, appState)`** (L148-L155) — mirror of undo, popping `redoStack`, pushing onto `undoStack`.
  - **`private perform(elements, appState, pop, push): [SceneElementsMap, AppState] | void`** (L157-L229) — the core loop. Pops one entry; if null, returns. Uses `CaptureUpdateAction.IMMEDIATELY`. Iterates entries in a `while (historyDelta)` loop so that entries producing **no visible change are skipped through** (L178-L219): applies the delta, clones the snapshot via `prevSnapshot.maybeClone(action, nextElements, nextAppState)`, builds a `StoreChange.create(prev, next)`, recomputes the latest-changes delta, and if non-empty schedules a micro-action (`store.scheduleMicroAction`) for sync and reassigns `historyDelta` to that recomputed delta. The opposite stack is pushed in a `finally` (L210-L212) so the inverse is always re-stacked even on throw. Breaks once `containsVisibleChange` is true; otherwise pops the next entry. The outer `finally` (L222-L228) emits the change event exactly once regardless of path.
  - **`private static pop(stack): HistoryDelta | null`** (L231-L243) — returns `null` for empty stack, else pops and returns (guards `undefined` → `null`).
  - **`private static push(stack, entry): number`** (L245-L248) — **inverts the entry before pushing** (`HistoryDelta.inverse(entry)`), so moving a delta from one stack to the other re-inverts it to remain directionally correct for the next undo/redo.

Performance/correctness notes for parity: history is built on immutable snapshot deltas with structural sharing (deltas, not full copies); the version/versionNonce exclusion and the "don't clear redo on appState-only change" rule are both subtle invariants. The skip-no-visible-change loop ensures multiple coalesced deltas collapse into one user-perceived undo step.

---

### packages/excalidraw/i18n.ts

The internationalization runtime: defines the language list (filtered by translation-completion percentage), lazy-loads locale JSON, and provides the `t()` translation function plus the `useI18n` React hook backed by a Jotai atom.

- **Constant `COMPLETION_THRESHOLD`** (L9) — `85`; languages below 85% translated are filtered out.
- **`interface Language`** (L11-L15) — `{ code: string; label: string; rtl?: boolean }`.
- **Type `TranslationKeys`** (L17) — `NestedKeyOf<typeof fallbackLangData>`; dotted-path key type derived from `en.json`.
- **Constant `defaultLang`** (L19) — `{ code: "en", label: "English" }`.
- **Constant `languages`** (L21-L75) — array beginning with `defaultLang`, then a hard-coded list of ~50 locales each annotated with `rtl` where applicable (Arabic, Farsi, Hebrew). The list is **filtered** by `percentages[lang.code] >= COMPLETION_THRESHOLD` (L69-L73) and **sorted alphabetically by label** (L74). Side effect: import-time computation.
- **Constant `TEST_LANG_CODE`** (L77) — `"__test__"`. In dev (`isDevEnv()`, L78-L87) two synthetic test languages are `unshift`-ed: a plain test lang and an RTL one wrapped in Unicode bidi override chars `‪…‬`.
- **Module-level mutable state `currentLang` / `currentLangData`** (L89-L90) — the active `Language` and its loaded translation object.
- **`setLanguage = async (lang: Language) => void`** (L92-L109) — sets `currentLang`, updates `document.documentElement.dir` (rtl/ltr) and `.lang` (DOM side effects, L94-L95). For test languages, clears data; otherwise dynamically `import()`s `./locales/${code}.json`, falling back to `fallbackLangData` on error (logged to console). Finally writes the code into `editorLangCodeAtom` via `editorJotaiStore.set` (L108) to trigger re-renders.
- **`getLanguage = () => Language`** (L111) — returns `currentLang`.
- **`findPartsForData = (data: any, parts: string[]) => string | undefined`** (L113-L125, internal) — walks a dotted-path part array into a nested object; returns `undefined` if any segment is missing or the leaf isn't a string.
- **`t = (path, replacement?, fallback?) => string`** (L127-L160) — the translation lookup. For test languages, returns a bracketed marker `‪[[path(replacement)]]‬` (L132-L137). Otherwise resolves `path` against `currentLangData`, then `fallbackLangData`, then the `fallback` arg (L139-L143). On total miss: in PROD it `console.warn`s and returns `""` (won't crash the app); in dev it throws (L144-L152). Performs `{{key}}` placeholder substitution from `replacement` (L154-L158). Notable invariant: missing-key behavior diverges by environment.
- **Atom `editorLangCodeAtom`** (L163, `@private`) — Jotai atom holding the current lang code; exists solely to re-render `useI18n` consumers.
- **`useI18n = () => { t, langCode }`** (L169-L172) — React hook returning the `t` function and the reactive `langCode` (via `useAtomValue`). Documented (L165-L168) for components rendered as `<Excalidraw>` children or memoized internals not otherwise updated on langCode/AppState changes.
