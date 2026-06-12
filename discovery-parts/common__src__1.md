## Cluster: common__src__1

This cluster covers font metrics/metadata, the package barrel re-export, keyboard key/code definitions and matching, point geometry helpers, a concurrency-bounded promise pool, a serial job queue, and random/id generation.

### packages/common/src/font-metadata.ts

Purpose: Defines per-font metric metadata (units-per-em, ascender, descender, line-height) plus Google Fonts unicode ranges, and computes vertical baseline offset and line-height from those metrics.

- `interface FontMetadata` (L11-L33): Type describing a font's metrics. Fields: `metrics.unitsPerEm` (literal union `1000 | 1024 | 2048`), `metrics.ascender` (number, from hhea), `metrics.descender` (number, negative), `metrics.lineHeight` (unitless number, hardcoded). Optional boolean flags `deprecated`, `private` (whether shown in font picker), `local` (local-only font), `fallback`. Comments note metrics are read from the woff2 head/hhea tables via fontdrop.info.
- `const FONT_METADATA: Record<number, FontMetadata>` (L35-L134): Map keyed by `FONT_FAMILY.*` / `FONT_FAMILY_FALLBACKS.*` numeric values (imported from `./constants`) to their metric records. Notable concrete values for parity: Excalifont/Virgil/Segoe UI Emoji share `{unitsPerEm:1000, ascender:886, descender:-374, lineHeight:1.25}`; Nunito `{1000, 1011, -353, 1.25}`; Lilita One `{1000, 923, -220, 1.15}`; Comic Shanns `{1000, 750, -250, 1.25}`; Helvetica `{2048, 1577, -471, 1.15, deprecated, local}`; Cascadia `{2048, 1900, -480, 1.2, deprecated}`; Liberation Sans `{2048, 1854, -434, 1.15, private}`; Assistant `{2048, 1021, -287, 1.25, private}`; Xiaolai `{1000, 880, -144, 1.25, fallback}`; Segoe UI Emoji reuses Excalifont metrics (`local`, `fallback`). Virgil is deprecated.
- `const GOOGLE_FONTS_RANGES` (L137-L147): Object of unicode range strings (`LATIN`, `LATIN_EXT`, `CYRILIC_EXT`, `CYRILIC`, `VIETNAMESE`) as defined by Google Fonts, used for subsetting.
- `const LOCAL_FONT_PROTOCOL = "local:"` (L150): Protocol prefix used to mark a local font that should be skipped from registering/inlining.
- `getVerticalOffset = (fontFamily, fontSize: number, lineHeightPx: number) => number` (L155-L170): Computes vertical baseline offset for alphabetic-baseline text. Algorithm (L160-L168): looks up metrics (falling back to Excalifont if family unknown); `fontSizeEm = fontSize / unitsPerEm`; `lineGap = (lineHeightPx - fontSizeEm*ascender + fontSizeEm*descender) / 2`; returns `fontSizeEm*ascender + lineGap`. This is the geometry that positions glyph baselines within a line box — load-bearing for canvas text parity. Note `fontSize` here is actually the per-em-scaled font size (divided by unitsPerEm), so ascender/descender are converted from font units into pixels.
- `getLineHeight = (fontFamily: FontFamilyValues) => ExcalidrawTextElement["lineHeight"]` (L175-L181): Returns the hardcoded unitless `lineHeight` for the family, falling back to Excalifont's `1.25` when unknown. Cast to the branded `lineHeight` type.

Note: This file is the single source of truth for font vertical metrics; any Canvas reimplementation must replicate the exact ascender/descender/unitsPerEm constants and the `getVerticalOffset` formula to match Excalidraw's text vertical placement.

### packages/common/src/index.ts

Purpose: Barrel file — pure re-export module for the `@excalidraw/common` package.

- This file is re-export-only (L1-L17). It re-exports everything (`export *`) from: `./binary-heap`, `./bounds`, `./colors`, `./constants`, `./font-metadata`, `./queue`, `./keys`, `./points`, `./promise-pool`, `./random`, `./url`, `./utils`, `./emitter`, `./appEventBus`, `./editorInterface`, `./versionedSnapshotStore`. Additionally re-exports the named `Debug` symbol from `../debug` (L17). No functions or logic of its own.

### packages/common/src/keys.ts

Purpose: Defines keyboard `code`/`key` constant maps and helpers for cross-layout key matching plus modifier-intent predicates.

- `const CODES` (L5-L28): `as const` map of semantic names to `KeyboardEvent.code` values (e.g. `EQUAL:"Equal"`, `NUM_ADD:"NumpadAdd"`, `ONE:"Digit1"`, letter codes `C:"KeyC"`, `Z:"KeyZ"`, etc.). Used as the layout-independent fallback.
- `const KEYS` (L30-L85): `as const` map of semantic names to `KeyboardEvent.key` values. Includes arrows, `PAGE_UP/DOWN`, `BACKSPACE`, `ALT`, navigation/edit keys, and notably `CTRL_OR_CMD: isDarwin ? "metaKey" : "ctrlKey"` (L39) — chooses the modifier-property name by platform. Also includes punctuation (`CHEVRON_LEFT:"<"`, `PERIOD:"."`, `SLASH:"/"`), lowercase letters `A`-`Z`, and digit string keys `0`-`9`.
- `type Key = keyof typeof KEYS` (L87): Type alias for the key-name union.
- `const KeyCodeMap = new Map<ValueOf<typeof KEYS>, ValueOf<typeof CODES>>(...)` (L90-L93): Maps `KEYS.Z -> CODES.Z` and `KEYS.Y -> CODES.Y` only — the fallback table for matching undo/redo on non-latin layouts.
- `isLatinChar = (key: string) => boolean` (L95): Returns `/^[a-z]$/.test(key.toLowerCase())` — whether a single key is a latin letter.
- `matchKey = (event: KeyboardEvent | React.KeyboardEvent<Element>, key: ValueOf<typeof KEYS>) => boolean` (L123-L135): Cross-layout key matcher. Returns true if `key === event.key.toLowerCase()` (latin layouts, L128); otherwise looks up `KeyCodeMap.get(key)` and returns true only when a code mapping exists, the pressed `event.key` is NOT a latin char, and `event.code === code` (L132-L134). The large comment table (L97-L122) documents how "z" maps across U.S./Czech/Turkish/French/Cyrillic/Greek/Hebrew/CJK layouts — see PR #5944.
- `isArrowKey = (key: string) => boolean` (L137-L141): True when key is any of the four arrow `KEYS`.
- `shouldResizeFromCenter = (event: MouseEvent | KeyboardEvent) => boolean` (L143-L144): Returns `event.altKey`.
- `shouldMaintainAspectRatio = (event: MouseEvent | KeyboardEvent) => boolean` (L146-L147): Returns `event.shiftKey`.
- `shouldRotateWithDiscreteAngle = (event: MouseEvent | KeyboardEvent | React.PointerEvent<HTMLCanvasElement>) => boolean` (L149-L151): Returns `event.shiftKey` — shift-rotate snaps to discrete angles.

Note: The Alt=resize-from-center, Shift=maintain-aspect-ratio/discrete-rotate, and `CTRL_OR_CMD` platform split are interaction invariants any reimplementation must mirror.

### packages/common/src/points.ts

Purpose: Point-array geometry helpers — bounding size, axis rescaling with optional re-normalization, and grid snapping.

- `getSizeFromPoints = (points: readonly (GlobalPoint | LocalPoint)[]) => { width: number; height: number }` (L9-L18): Computes bounding-box width/height of a point set via `Math.max(...xs) - Math.min(...xs)` and same for ys. Note spread of `Math.max`/`Math.min` over coordinate arrays (potential stack-arg limit on very large point sets).
- `rescalePoints = <Point extends GlobalPoint | LocalPoint>(dimension: 0 | 1, newSize: number, points: readonly Point[], normalize: boolean) => Point[]` (L21-L65): Scales all points along one axis (`dimension` 0=x, 1=y) so that axis spans `newSize`. Computes min/max/size over the chosen coordinate; `scale = size===0 ? 1 : newSize/size` (L31, guards divide-by-zero). Maps each point multiplying that coordinate by `scale`, tracking the new minimum (L33-L43). If `normalize` is false (L45-47) or there are exactly 2 points (L49-52, two-point lines are left untranslated), returns the scaled points directly. Otherwise translates the scaled axis by `translation = minCoordinate - nextMinCoordinate` (L54) so the scaled set's min coordinate matches the original min, rebuilding each point via `pointFromPair` and adding `translation` only on the scaled `dimension` (L56-L64). Invariant: only the targeted dimension is modified; the other dimension passes through unchanged. This preserves the leading edge position while rescaling — important for resize parity.
- `getGridPoint = (x: number, y: number, gridSize: NullableGridSize) => [number, number]` (L68-L80): Snaps `(x,y)` to the nearest grid intersection via `Math.round(coord/gridSize)*gridSize` when `gridSize` is truthy; otherwise returns `[x,y]` unchanged. A `// TODO` (L67) notes rounding causes shake when free-drawing.

### packages/common/src/promise-pool.ts

Purpose: Order-preserving, concurrency-bounded promise runner wrapping the `es6-promise-pool` library.

- `type TPromisePool<T, Index = number>` (L5-L14): Internal type extending `Pool<[Index, T][]>` with typed `addEventListener`/`removeEventListener` for the `"fulfilled"` event whose payload is `{ data: { result: [Index, T] } }`. Exists only to add the missing typings; the `[Index, T]` tuple is relied upon to preserve call order.
- `class PromisePool<T>` (L16-L50):
  - Fields: `private readonly pool: TPromisePool<T>` and `private readonly entries: Record<number, T> = {}` (L17-L18) — `entries` accumulates results keyed by their original index.
  - `constructor(source: IterableIterator<Promise<void | readonly [number, T]>>, concurrency: number)` (L20-L28): Wraps `source` in a `new Pool(...)` with the given concurrency, casting through `unknown` to satisfy the lib's loose signature.
  - `all()` (L30-L49): Registers a `"fulfilled"` listener that, for each non-void result, destructures `[index, value]` and stores `entries[index] = value` (L31-L38, manual gathering because the lib does not return results). Starts the pool (L42); on completion schedules listener removal via `setTimeout` (L43-L45) and resolves with `Object.values(this.entries)`. Returns results ordered by insertion of numeric keys (index order). Side effect: mutates `entries`; relies on each source promise resolving to `[index, value]` to maintain order.

### packages/common/src/queue.ts

Purpose: A serial (concurrency-1) FIFO job queue that runs deferred job factories one at a time, each returning a resolvable promise.

- `type Job<T, TArgs extends unknown[]> = (...args: TArgs) => MaybePromise<T>` (L7): A job is a factory function producing a value or promise.
- `type QueueJob<T, TArgs extends unknown[]>` (L9-L13): Stored entry: `{ jobFactory, promise: ResolvablePromise<T>, args }`.
- `class Queue` (L15-L48):
  - Fields: `private jobs: QueueJob<any, any[]>[] = []` and `private running = false` (L16-L17).
  - `private tick()` (L19-L35): If already `running`, returns (guards re-entrancy). Shifts the next job; if present sets `running=true` and resolves the job's `promise` with `promiseTry(job.jobFactory, ...job.args).finally(...)` where the `finally` clears `running=false` and recursively calls `tick()` to drain the next job (L26-L31). If no job, sets `running=false`. Invariant: at most one job runs at a time; ordering is strictly FIFO. `promiseTry` ensures synchronous throws become rejected promises.
  - `push<TValue, TArgs extends unknown[]>(jobFactory, ...args): Promise<TValue>` (L37-L47): Creates a `resolvablePromise`, pushes `{jobFactory, promise, args}` onto the queue, calls `tick()`, and returns the promise. The returned promise resolves/rejects with the job's eventual outcome.

### packages/common/src/random.ts

Purpose: Random integer generation (seedable for tests) and id generation (deterministic in test env, nanoid otherwise).

- Module state (L6-L7): `let random = new Random(Date.now())` (roughjs seeded PRNG) and `let testIdBase = 0` (monotonic counter for deterministic test ids).
- `randomInteger = () => number` (L9): Returns `Math.floor(random.next() * 2**31)` — a non-negative 31-bit integer from the seeded PRNG.
- `reseed = (seed: number) => void` (L11-L14): Replaces `random` with `new Random(seed)` and resets `testIdBase = 0`. Side effect: mutates module-level state so subsequent ids/integers are deterministic — used by tests for reproducibility.
- `randomId = () => string` (L16): Returns `` `id${testIdBase++}` `` when `isTestEnv()` (deterministic, incrementing), otherwise `nanoid()`. Side effect: increments `testIdBase` in test env.

Note: The seedable PRNG (`reseed`) and test-deterministic `randomId` are the mechanism by which Excalidraw produces byte-stable snapshots in tests — relevant to any deterministic-export parity goals.
