## Cluster: common__src__2

This cluster covers the lower-level shared utilities of `@excalidraw/common`: URL sanitization, the package's TypeScript utility-type toolkit, the large general-purpose `utils.ts` grab-bag (timing, geometry coordinate conversion, collection helpers, branded types, feature flags), and a small versioned snapshot store.

---

### packages/common/src/url.ts

Purpose: Normalizes and sanitizes user-supplied link strings so they are safe to use in `href`/`src` attributes and to distinguish local vs external links.

- `normalizeLink = (link: string) => string` — L5-L11. Trims the link; returns it unchanged if empty; otherwise runs it through `escapeDoubleQuotes` (from `./utils`) and then `sanitizeUrl` (from `@braintree/sanitize-url`). Output is an XSS-sanitized, quote-escaped string. Invariant: empty/whitespace input is preserved verbatim (after trim).
- `isLocalLink = (link: string | null) => boolean` — L13-L15. Returns true if the link contains `location.origin` or starts with `/` (relative path). Side effect: reads global `location.origin`. Null-safe via optional chaining and `!!` coercion.
- `toValidURL = (link: string) => string` — L17-L37. First calls `normalizeLink`; if the result starts with `/` it is promoted to a fully-qualified URL by prefixing `location.origin`; otherwise it attempts `new URL(link)` and on parse failure returns the literal string `"about:blank"`. Returns the validated link. Invariant/safety: never returns an unparseable URL — invalid links collapse to `about:blank` (used for iframe `src`/anchor `href` hardening). Side effect: reads `location.origin`.

---

### packages/common/src/utility-types.ts

Purpose: Types-only module — a library of reusable TypeScript utility/mapped/conditional types used across the codebase. No runtime code.

Exported types (all type-level, no functions):
- `Mutable<T>` (L1-L3) — strips `readonly` from every property.
- `ValueOf<T>` (L5) — union of property value types (`T[keyof T]`).
- `Merge<M, N>` (L7) — `Omit<M, keyof N> & N`; N overrides M.
- `SubtypeOf<Supertype, Subtype extends Supertype>` (L9-L11) — asserts/returns Subtype is a subtype of Supertype.
- `ResolutionType<T extends (...args: any) => any>` (L13-L17) — unwraps the resolved value `R` of a function returning `Promise<R>`, else `any`.
- `MarkOptional<T, K extends keyof T>` (L20-L21) — makes keys `K` optional.
- `MarkRequired<T, RK extends keyof T>` (L23-L24) — makes keys `RK` required.
- `MarkNonNullable<T, K extends keyof T>` (L26-L28) — makes keys `K` present and `NonNullable`.
- `NonOptional<T>` (L30) — `Exclude<T, undefined>`.
- `SignatureType<T>` (L36) — extracts a function's parameter tuple, else `never`.
- `CallableType<T extends (...args: any[]) => any>` (L37-L39) — reconstructs a callable type from `SignatureType` + `ReturnType`.
- `ForwardRef<T, P = any>` (L43-L45) — extracts the ref (2nd) parameter type of `React.ForwardRefRenderFunction<T, P>`.
- `ExtractSetType<T extends Set<any>>` (L47-L49) — extracts the element type `U` of a `Set<U>`.
- `SameType<T, U>` (L51) — `true`/`false` literal indicating mutual assignability.
- `Assert<T extends true>` (L52) — compile-time assertion helper constrained to `true`.
- `NestedKeyOf<T, K = keyof T>` (L54-L56) — recursive dotted-path union of nested keys (e.g. `"a" | "a.b"`).
- `SetLike<T>` (L58) — `Set<T> | T[]`.
- `ReadonlySetLike<T>` (L59) — `ReadonlySet<T> | readonly T[]`.
- `MakeBrand<T extends string>` (L61-L64) — produces a phantom `~brand~${T}` property for nominal/branded typing (uses `~` to sort last in IntelliSense).
- `MaybePromise<T>` (L67) — `T | Promise<T>`.
- `AllPossibleKeys<T>` (L70) — distributes over a union to collect all member keys.
- `DTO<T>` (L73-L75) — strips function/method-valued properties (data-transfer-object shape).
- `MapEntry<M extends Map<any, any>>` (L77-L79) — `[K, V]` entry tuple type of a `Map`.

---

### packages/common/src/versionedSnapshotStore.ts

Purpose: A small generic, framework-agnostic store that holds a value with a monotonically increasing version, notifies subscribers on change, and supports long-poll-style `pull` of the next snapshot.

- `type VersionedSnapshot<T>` (L1-L4) — readonly `{ version: number; value: T }`.
- `class VersionedSnapshotStore<T>` (L6-L70). Private fields: `version` (number, starts 0, L7), `value` (T, L8), `waiters` (Set of one-shot resolve callbacks, L9-L11), `subscribers` (Set of persistent callbacks, L12-L14).
  - `constructor(initialValue: T, isEqual: (prev, next) => boolean = Object.is)` (L16-L21) — stores initial value; `isEqual` defaults to `Object.is` and gates whether `set` registers a change.
  - `getSnapshot(): VersionedSnapshot<T>` (L23-L25) — returns a fresh `{version, value}` object (new object each call, not memoized).
  - `set(nextValue: T): boolean` (L27-L46) — early-returns `false` if `isEqual(current, next)` (no change). Otherwise assigns value, increments `version`, builds a snapshot, then notifies all `subscribers` and all `waiters`, then clears `waiters` (one-shot semantics). Returns `true` on change. Invariant: version only advances when value actually differs per `isEqual`; subscribers persist, waiters fire once.
  - `update(updater: (prev: T) => T): boolean` (L48-L50) — convenience wrapper computing next value from current and delegating to `set`.
  - `subscribe(subscriber): () => void` (L52-L59) — adds a persistent subscriber; returns an unsubscribe closure that deletes it.
  - `pull(sinceVersion = -1): Promise<VersionedSnapshot<T>>` (L61-L69) — if the store's current `version` differs from `sinceVersion`, resolves immediately with the current snapshot; otherwise returns a Promise registered in `waiters` that resolves on the next `set`. This is a long-poll / suspense-style "give me the next change" primitive. Note: default `-1` means a brand-new store at version 0 resolves immediately.

---

### packages/common/src/utils.ts

Purpose: The package's large general-purpose utility module — DOM/env detection, timing primitives (debounce/throttle/RAF easing), collection transforms, shallow-equality, branded-type helpers, feature flags, and the world↔viewport coordinate conversion math.

Module-level state:
- `mockDateTime: string | null` (L27) — test override for `getDateTime`.

Functions, classes, and significant constants:

- `setDateTimeForTests = (dateTime: string) => void` (L29-L31) — sets the `mockDateTime` override. Side effect: mutates module state.
- `getDateTime = () => string` (L33-L46) — returns `mockDateTime` if set, else a zero-padded `YYYY-MM-DD-HHMM` local-time string. Note: month is `getMonth()+1`, all components `padStart(2,"0")`.
- `capitalizeString = (str: string) => string` (L48-L49) — uppercases first char, concatenates the rest.
- `isToolIcon = (target): target is HTMLElement` (L51-L54) — type guard: target is an `HTMLElement` whose className includes `"ToolIcon"`.
- `isInputLike = (target): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLBRElement | HTMLDivElement` (L56-L68) — type guard for editable/selectable targets: a `wysiwyg`-dataset element, a `<br>` (wysiwyg newline), input, textarea, or select.
- `isInteractive = (target) => boolean` (L70-L75) — true if `isInputLike` or the target is an Element inside a `label`/`button` (via `closest`).
- `isWritableElement = (target): target is HTMLInputElement | HTMLTextAreaElement | HTMLBRElement | HTMLDivElement` (L77-L92) — stricter than `isInputLike`: wysiwyg element, `<br>`, textarea, text/number/password/search inputs, or any element inside a CodeMirror `.cm-editor`. Used to decide whether keyboard events should be left to the field.
- `getFontFamilyString = ({ fontFamily }: { fontFamily: FontFamilyValues }) => string` (L94-L107) — looks up the font-family name whose id matches in `FONT_FAMILY`, appends comma-joined fallbacks from `getFontFamilyFallbacks`; falls back to `WINDOWS_EMOJI_FALLBACK_FONT` if no match.
- `getFontString = ({ fontSize, fontFamily }) => FontString` (L109-L118) — returns CSS shorthand `"${fontSize}px ${familyString}"` cast to the branded `FontString`. Used for canvas/DOM font assignment.
- `nextAnimationFrame = async (cb: () => any) => void` (L120-L123) — schedules `cb` two RAFs out (frame after the next), i.e. ensures it runs after the current frame's render.
- `debounce = <T extends any[]>(fn, timeout) => ret` (L125-L152) — trailing-edge debounce. Tracks `handle` (timer id) and `lastArgs`; each call clears the timer and reschedules. `ret.flush()` runs immediately with last args if pending; `ret.cancel()` drops pending args and clears timer. Side effect: uses `window.setTimeout`.
- `throttleRAF = <T extends any[]>(fn) => ret` (L154-L195) — RAF throttle invoking `fn` at most once per animation frame with the latest args. Tracks `timerId` and `lastArgs`; `scheduleFunc` registers a RAF that fires then nulls state. `ret.flush()` cancels the RAF and runs synchronously with last args; `ret.cancel()` drops everything. Performance: coalesces high-frequency calls (e.g. pointer move) into per-frame work.
- `easeOut = (k: number) => number` (L203-L205) — quartic ease-out: `1 - (1-k)^4`. Non-obvious: 4th-power easing curve.
- `easeOutInterpolate = (from, to, progress) => number` (L207-L209) — internal; linear-from value with `easeOut(progress)` applied: `(to-from)*easeOut(progress)+from`.
- `easeToValuesRAF = <T extends Record<keyof T, number>, K extends keyof T>({ fromValues, toValues, onStep, duration = 250, interpolateValue?, onStart?, onEnd?, onCancel? }) => (() => void)` (L237-L334) — RAF animation engine interpolating a record of numeric values from `fromValues` to `toValues` over `duration` ms. Inner `step(timestamp)` (L273-L325) initializes `startTime` and fires `onStart` on first frame, computes `elapsed = min(timestamp-startTime, duration)` and `factor = easeOut(elapsed/duration)`. Note: it computes `newValues` twice — first a plain `factor`-eased pass that immediately calls `onStep` (L285-L294), then while `elapsed < duration` a second pass using either the custom `interpolateValue` callback (falling back to `easeOutInterpolate` when it returns null) and calls `onStep` again before requesting the next frame; at completion it calls `onStep(toValues)` and `onEnd`. Returns a cancel function that fires `onCancel`, sets `canceled`, and cancels the RAF. Performance/parity note: the double `onStep` per frame and the dual easing path are subtle behaviors to replicate.
- `chunk = <T>(array: readonly T[], size: number) => T[][]` (L337-L351) — splits array into sub-arrays of length `size` (lodash-derived). Returns `[]` for empty array or `size < 1`. Pre-allocates result of `ceil(length/size)`.
- `selectNode = (node: Element) => void` (L353-L361) — selects the node's contents in the window selection via a `Range`. Side effect: mutates DOM selection.
- `removeSelection = () => void` (L363-L368) — clears all ranges from the window selection.
- `distance = (x: number, y: number) => number` (L370) — `Math.abs(x - y)` (1-D distance).
- `isSelectionLikeTool = (type: ToolType | "custom") => boolean` (L372-L374) — true for `"selection"` or `"lasso"`.
- `updateActiveTool = (appState: Pick<AppState,"activeTool">, data) => AppState["activeTool"]` (L376-L407) — produces a new `activeTool` object. For `data.type === "custom"` it sets `type:"custom"`, `customType`, and merges `locked`. Otherwise sets `lastActiveTool` (preserving prior unless `lastActiveToolBeforeEraser` explicitly provided), `type`, nulls `customType`, merges `locked`, and sets `fromSelection` (default false). Pure (returns new object).
- `isFullScreen = () => boolean` (L409-L410) — true if `document.fullscreenElement` is the `HTML` node.
- `allowFullScreen = () => Promise<void>` (L412-L413) — requests fullscreen on `documentElement`.
- `exitFullScreen = () => Promise<void>` (L415) — exits fullscreen.
- `viewportCoordsToSceneCoords = ({ clientX, clientY }, { zoom, offsetLeft, offsetTop, scrollX, scrollY }) => GlobalCoord` (L417-L437) — **coordinate space math**: scene `x = (clientX - offsetLeft)/zoom.value - scrollX`, `y = (clientY - offsetTop)/zoom.value - scrollY`. Returns `{x,y}` cast to `GlobalCoord`. Critical for canvas parity: divide by zoom then subtract scroll.
- `sceneCoordsToViewportCoords = ({ sceneX, sceneY }, { zoom, offsetLeft, offsetTop, scrollX, scrollY }) => {x,y}` (L439-L458) — inverse: `x = (sceneX + scrollX)*zoom.value + offsetLeft`, `y = (sceneY + scrollY)*zoom.value + offsetTop`. Note: add scroll first, then multiply by zoom, then add offset (offsets are NOT scaled by zoom).
- `getGlobalCSSVariable = (name: string) => string` (L460-L461) — reads `--${name}` from `:root` computed style.
- Constants `RS_LTR_CHARS`, `RS_RTL_CHARS`, `RE_RTL_CHECK` (L463-L467) — Unicode-range character classes plus a regex matching strings that begin with optional non-LTR chars followed by an RTL char.
- `isRTL = (text: string) => boolean` (L468-L474) — tests `RE_RTL_CHECK`: true when the first directional character is RTL (numbers/indeterminate leading chars allowed before it).
- `tupleToCoors = (xyTuple: readonly [number, number]) => {x,y}` (L476-L481) — destructures a 2-tuple into `{x,y}`.
- `muteFSAbortError = (error?: Error) => void` (L483-L490) — swallows (warns) `AbortError`, rethrows everything else; used as a rejection handler for filesystem ops.
- `findIndex = <T>(array, cb, fromIndex = 0) => number` (L492-L508) — forward `findIndex` supporting negative `fromIndex` (relative to end) and clamping into `[0, length]`. Returns -1 if not found.
- `findLastIndex = <T>(array, cb, fromIndex = array.length-1) => number` (L510-L526) — reverse search from `fromIndex` (negative relative to end, clamped to `[0, length-1]`), decrementing; returns -1 if none.
- `mapFind = <T, K>(collection, iteratee) => K | undefined` (L528-L540) — returns the first non-null mapped result (`!= null` check).
- `type ResolvablePromise<T>` (L542-L547) — a `Promise<T>` augmented with `resolve`/`reject` methods; the resolve signature is optional-arg when `T` is `undefined`.
- `resolvablePromise = <T>() => ResolvablePromise<T>` (L548-L558) — creates a promise and hoists its `resolve`/`reject` onto the promise object itself (deferred-promise pattern). Uses `any` casts internally.
- `nFormatter = (num: number, digits: number) => string` (L560-L578) — human-readable number formatting with SI-ish suffixes `b/k/M/G` (note: smallest is `value:1, symbol:"b"`). Walks the table from largest, formats to `digits` decimals, strips trailing zeros via regex.
- `getVersion = () => string` (L580-L585) — reads `<meta name="version">` content or falls back to `DEFAULT_VERSION`.
- `supportsEmoji = () => boolean` (L587-L602) — feature detection (Modernizr-adapted): draws "😀" on a canvas at red fill and checks whether the pixel at offset (12,12) is non-zero. Side effect: creates a canvas. Returns false if 2D context unavailable.
- `getNearestScrollableContainer = (element: HTMLElement) => HTMLElement | Document` (L604-L625) — walks ancestors; returns `document` if it reaches `body`, otherwise the first ancestor with scrollable content (`scrollHeight > clientHeight`) and `overflowY` of auto/scroll/overlay.
- `focusNearestParent = (element: HTMLInputElement) => void` (L627-L636) — walks ancestors and focuses the first with `tabIndex > -1`. Side effect: DOM focus.
- `preventUnload = (event: BeforeUnloadEvent) => void` (L638-L642) — calls `preventDefault` and sets `returnValue = ""` to trigger the browser unload prompt.
- `bytesToHexString = (bytes: Uint8Array) => string` (L644-L648) — maps each byte to a 2-char zero-padded lowercase hex string and joins (uses `"0"+hex` then `slice(-2)`).
- `getUpdatedTimestamp = () => number` (L650) — `1` in test env (deterministic), else `Date.now()`.
- `arrayToMap = <T extends {id:string} | string>(items) => Map<string, T>` (L656-L666) — returns the map unchanged if already a Map; otherwise reduces into a `Map` keyed by the string itself or `element.id`.
- `arrayToMapWithIndex = <T extends {id:string}>(elements) => Map<string, [T, number]>` (L668-L674) — maps id → `[element, index]` tuple preserving original order index.
- `arrayToObject = <T>(array, groupBy?) => { [key]: T }` (L679-L686) — builds an object keyed by `groupBy(value)` or array index; "use only when order is irrelevant" (later duplicate keys overwrite).
- `type Node<T>` (L689-L692) — `T & { prev: Node<T>|null; next: Node<T>|null }` doubly-linked node.
- `arrayToList = <T>(array) => Node<T>[]` (L694-L718) — builds a **circular** doubly-linked list over copies of the array items (spreads each item, adds prev/next). First item is a no-op (no self-link); last item links back to head and head's `prev` to tail. Invariant: single-item arrays are NOT made circular.
- `toIterable = <T>(values: readonly T[] | ReadonlyMap<string,T>) => Iterable<T>` (L724-L728) — returns the array directly or `map.values()`; avoids entry allocation when iterating.
- `toArray = <T>(values) => T[]` (L733-L737) — array passthrough or `Array.from(map.values())`.
- `isTestEnv = () => boolean` (L739) — `import.meta.env.MODE === ENV.TEST`.
- `isDevEnv = () => boolean` (L741) — MODE === DEVELOPMENT.
- `isProdEnv = () => boolean` (L743) — MODE === PRODUCTION.
- `isServerEnv = () => boolean` (L745-L746) — true if `process.env.NODE_ENV` exists (Node/SSR detection).
- `wrapEvent = <T extends Event>(name: EVENT, nativeEvent: T) => CustomEvent` (L748-L755) — wraps a native event in a cancelable `CustomEvent` with `detail.nativeEvent`.
- `updateObject = <T extends Record<string, any>>(obj, updates) => T` (L757-L784) — returns a merged copy only if something changed; an update is a no-op for primitive values that strictly equal the existing value, but objects always count as changed (their attrs may have mutated). Returns original `obj` reference when no change (referential-stability optimization).
- `isPrimitive = (val: any) => boolean` (L786-L789) — true for null/undefined or non-object/non-function typeof.
- `getFrame = () => "top" | "iframe"` (L791-L797) — `"top"` if `window.self === window.top`, else `"iframe"`; cross-origin access throwing also yields `"iframe"`.
- `isRunningInIframe = () => boolean` (L799) — `getFrame() === "iframe"`.
- `isPromiseLike = (value): value is Promise<...>` (L801-L811) — duck-types a thenable by checking presence of `then`/`catch`/`finally` on an object.
- `queryFocusableElements = (container: HTMLElement | null) => HTMLElement[]` (L813-L824) — queries common focusable selectors and filters to `tabIndex > -1` and non-disabled. Returns `[]` if container null.
- `_defaultIsShallowComparatorFallback = (a, b) => boolean` (L827-L838) — internal fallback for `isShallowEqual`: treats two empty arrays as equal, else strict `===`.
- `isShallowEqual = <T, K>(objA, objB, comparators?, debug = false) => boolean` (L844-L916) — shallow object equality. Fast-fails if key counts differ. If `comparators` is an **array** of keys, only those keys are compared (strict or empty-array fallback). Otherwise every key is compared using a per-key comparator if provided, else strict-or-empty-array fallback. `debug` logs the first mismatch with styled console output. Note the elaborate generic constraint (L850-L860) enforcing that an array `comparators` covers exactly the object's keys at compile time.
- `composeEventHandlers = <E>(originalEventHandler?, ourEventHandler?, { checkForDefaultPrevented = true } = {}) => (event: E) => void` (L920-L935) — Radix-derived: runs the original handler, then runs ours only if default wasn't prevented (when `checkForDefaultPrevented`).
- `assertNever = (value: never, message: string | null, softAssert?: boolean): never` (L941-L955) — exhaustiveness helper: returns `value` if `message` null; if `softAssert` logs error and returns; otherwise throws.
- `invariant(condition: any, message: string): asserts condition` (L957-L961) — throws if falsy; TS assertion function narrowing `condition`.
- `memoize = <T extends Record<string,any>, R>(func) => (typeof func) & { clear }` (L966-L1002) — memoizes a single-object-arg function by strict-equality comparison of each entry against the last call's args (stored in a `Map`). Returns cached result if all entries match; `clear()` resets. Caches exactly one result (size-1 cache).
- `isMemberOf = <T extends string>(collection, value): value is T` (L1005-L1016) — membership test across Set/Map (`.has`), array (`.includes`), or plain object (`hasOwnProperty`); acts as a type guard.
- `cloneJSON = <T>(obj: T) => T` (L1018) — deep clone via `JSON.parse(JSON.stringify(obj))` (drops functions/undefined; not structural-cycle safe).
- `updateStable = <T extends any[] | Record<string,any>>(prevValue, nextValue) => T` (L1020-L1028) — returns `prevValue` (preserving reference) if shallow-equal to `nextValue`, else `nextValue`. Referential-stability helper.
- `addEventListener(...)` — overloaded function (L1031-L1101). Multiple typed overloads for Window/Document/FontFaceSet/HTMLElement plus falsy targets. Implementation (L1077-L1101): returns a no-op unsubscribe if target is falsy; otherwise adds the listener and returns an unsubscribe closure that removes it. Returns `UnsubscribeCallback`. Convenience: accepts falsy targets so callers needn't null-check.
- `getSvgPathFromStroke(points: number[][], closed = true): string` (L1103-L1134) — **geometry/path math**: converts a polyline of points into a smoothed SVG path using quadratic-Bézier midpoint interpolation (the perfect-freehand technique). Returns `""` for fewer than 4 points. Builds an initial `M…Q…T` segment from the first three points (using `average(b,c)` midpoints), then iterates emitting midpoint coordinates for the `T` (smooth-quadratic) command, all coords `toFixed(2)`; appends `"Z"` when `closed`. Important parity detail: midpoints are computed via `average()` from `@excalidraw/math` and rounded to 2 decimals.
- `normalizeEOL = (str: string) => string` (L1136-L1138) — normalizes `\r\n` / `\r` line endings to `\n`.
- `type HasBrand<T>` (L1141-L1144) — resolves to `true` if any key matches `~brand…` or `_brand`.
- `type RemoveAllBrands<T>` (L1146-L1153) — strips branded phantom keys (`~brand~…`/`_brand`) when present.
- `type UnbrandForValue<T>` (L1157-L1165) — recursively unbrands Maps/Sets; for arrays distinguishes mutable (`unknown[]`) vs readonly (`readonly unknown[]`) inputs; else `RemoveAllBrands`. Used for accepting branded values loosely.
- `type Unbrand<T>` (L1168-L1174) — recursive unbranding for return types; arrays become `Array<Unbrand<E>>`.
- `type CombineBrands<BrandedType, CurrentType>` (L1176-L1181) — intersects brand with current type, array-aware.
- `type CombineBrandsIfNeeded<T, Required>` (L1183-L1187) — chooses `T[]` / `CombineBrands<...>[]` / `Required[]` depending on assignability and brand presence.
- `toBrandedType(...)` — overloaded function (L1195-L1203). Two type-only overloads (single-generic value-assignable form, and two-generic combine form); the runtime implementation simply returns `value` unchanged (purely a compile-time cast). Side effect: none.
- `promiseTry = async <TValue, TArgs extends unknown[]>(fn, ...args) => Promise<TValue>` (L1208-L1215) — `Promise.try` polyfill (sindresorhus p-try): wraps `fn(...args)` in a Promise so sync throws become rejections.
- `isAnyTrue = (...args: boolean[]) => boolean` (L1217-L1218) — true if any arg is truthy, computed as `Math.max(...0/1) > 0`.
- `safelyParseJSON = (json: string) => Record<string, any> | null` (L1220-L1226) — `JSON.parse` returning null on error.
- `escapeDoubleQuotes = (str: string) => string` (L1232-L1234) — replaces `"` with `&quot;` for safe use in double-quoted HTML attributes (consumed by `url.ts`).
- `castArray = <T>(value: T | T[]) => T[]` (L1236-L1237) — wraps non-arrays in an array.
- `isReadonlyArray = (value?) => value is readonly any[]` (L1240-L1242) — `Array.isArray` re-typed as a readonly-array guard.
- `sizeOf = (value: array | Map | object | Set) => number` (L1244-L1256) — uniform "length" across arrays (`.length`), Map/Set (`.size`), and plain objects (`Object.keys().length`).
- `reduceToCommonValue = <T, R = T>(collection, getValue?) => R | null` (L1258-L1280) — returns the single common (extracted) value shared by all items, else null (also null for empty collection or any null extracted value). Used to detect uniform property values across a selection.
- `type FEATURE_FLAGS` (L1282-L1284) — `{ COMPLEX_BINDINGS: boolean }`. Constants `FEATURE_FLAGS_STORAGE_KEY` (L1286), `DEFAULT_FEATURE_FLAGS` (L1287-L1289), and module-level cache `featureFlags` (L1290).
- `getFeatureFlag = <F extends keyof FEATURE_FLAGS>(flag) => FEATURE_FLAGS[F]` (L1292-L1306) — lazily reads/parses `localStorage["excalidraw-feature-flags"]` into the cached `featureFlags` (defaults on parse failure, swallowed), returns the requested flag. Side effect: reads localStorage, caches in module state.
- `setFeatureFlag = <F extends keyof FEATURE_FLAGS>(flag, value) => void` (L1308-L1324) — merges the flag into cache and persists to localStorage; logs on failure.
- `oneOf = <N, H extends N>(needle, haystack): needle is H` (L1326-L1331) — type-guarded `haystack.includes(needle)`.
