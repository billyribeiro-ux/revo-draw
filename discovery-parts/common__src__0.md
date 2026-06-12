## Cluster: common__src__0

This cluster covers the foundational `@excalidraw/common` source modules: a typed event bus, a binary min-heap, bounds typing, color math/palette, the global constants table, the editor-interface (form-factor/breakpoint) layer, and a low-level event Emitter.

---

### packages/common/src/appEventBus.ts

A typed, higher-level event bus built on top of `Emitter`, supporting per-event "cardinality" (once/many) and "replay" (none/last) behavior, with optional promise-based awaiting of once+replay events.

Type-level constructs (L6-L30):
- `AppEventPayloadMap = Record<string, unknown[]>` — maps event names to their argument tuples.
- `AppEventBehavior` (L8-L11) — `{ cardinality: "once" | "many"; replay: "none" | "last" }`.
- `AppEventBehaviorMap<Events>` (L13-L15) — per-event behavior descriptor map.
- `AwaitableAppEventKeys<Events, Behavior>` (L17-L26) — conditional mapped type selecting only event keys whose behavior is `cardinality === "once"` AND `replay === "last"` (the only keys that can be `await`ed without a callback).
- `AppEventPromiseValue<Args>` (L28-L30) — if the args tuple has exactly one element `[Only]`, the promise resolves to `Only`; otherwise resolves to the full `Args` tuple.

`class AppEventBus<Events, Behavior>` (L32-L136):
- Private state: `emitters: Map<keyof Events, Emitter<any>>` (L36), `lastPayload: Map<keyof Events, any[]>` (L37, replay cache), `emittedOnce: Set<keyof Events>` (L38, dev-only once-guard). Constructor takes the `behavior` map (L40).
- `getEmitter<K>(name: K): Emitter<Events[K]>` (L42-L49) — lazily creates and memoizes one `Emitter` per event name. Side effect: inserts into `emitters` map.
- `toPromiseValue<Args>(args): AppEventPromiseValue<Args>` (L51-L55) — returns `args[0]` if length 1, else `args`. Mirrors the `AppEventPromiseValue` type at runtime.
- `on<K>(name, callback?)` (L57-L99) — overloaded: (1) with callback returns `UnsubscribeCallback`; (2) for awaitable keys without callback returns a `Promise`. Behavior: if a callback is given and `replay === "last"` with a cached payload, it schedules `callback(...cachedPayload)` via `queueMicrotask` (L73) — note replay fires asynchronously, not synchronously; for `cardinality === "once"` replay it returns a no-op unsubscribe (L76). Otherwise subscribes via `getEmitter(name).on(callback)` (L80). With no callback: throws if the event is not once+last (L83-L88); if cached, resolves immediately (L90-L92); else returns a Promise resolved by a one-shot `once` subscription (L94-L98). Invariant: only once+last events may be awaited.
- `emit<K>(name, ...args)` (L101-L124) — in non-prod, enforces that "once" events are emitted at most once (throws otherwise) and records into `emittedOnce` (L104-L111). If `replay === "last"`, stores args into `lastPayload` (L113-L115). Triggers the emitter, and in a `finally` clears the emitter if cardinality is "once" (L120-L122) so late subscribers rely only on replay cache. Side effects: mutates `emittedOnce`/`lastPayload`, fires subscribers.
- `clear()` (L126-L135) — clears replay cache, once-guard, every emitter, then drops all emitters. Full reset.
- Performance/parity note: replay delivery is deferred to a microtask, so subscribers must not assume synchronous replay; once-events are awaitable and self-clearing.

---

### packages/common/src/binary-heap.ts

A generic binary min-heap (priority queue) keyed by a `scoreFunction`, used in pathfinding-style algorithms (e.g. elbow arrows).

`class BinaryHeap<T>` (L1-L110):
- Private `content: T[] = []` array-backed heap; constructor takes `scoreFunction: (node: T) => number` (L4). Min-heap: lowest score at index 0.
- `sinkDown(idx: number)` (L6-L20) — moves the node at `idx` up toward the root while its score is less than its parent. Parent index computed as `((idx + 1) >> 1) - 1`. Writes node into final position at end. (Despite the name "sinkDown", this is the sift-UP operation toward the root.)
- `bubbleUp(idx: number)` (L22-L61) — sifts the node at `idx` DOWN: repeatedly finds the smaller of the two children (left `((idx+1)<<1)-1`, right `child1N+1`), and if a child is smaller, moves it up and continues; places node in final slot. (This is the sift-DOWN operation.) Note the naming of `sinkDown`/`bubbleUp` is inverted relative to their actual direction.
- `push(node: T)` (L63-L66) — appends then `sinkDown` from the last index. O(log n).
- `pop(): T | null` (L68-L82) — returns root (min) or null if empty; moves last element to root and `bubbleUp` to restore heap. O(log n).
- `remove(node: T)` (L84-L101) — finds node by `indexOf` (O(n) linear scan), replaces it with the last element, then either `sinkDown` or `bubbleUp` depending on score comparison vs the removed node. O(n) due to scan.
- `size(): number` (L103-L105) — `content.length`.
- `rescoreElement(node: T)` (L107-L109) — re-sifts a node up after its external score changed (only `sinkDown`; assumes the score decreased).
- Parity/perf note: `remove` and `rescoreElement` use `indexOf` (linear), so heavy remove loads are O(n) per call. Bit-shift index math must be preserved exactly for a port.

---

### packages/common/src/bounds.ts

Types-only/predicate module defining the canonical axis-aligned bounding-box tuple used throughout the codebase.

- `type Bounds = readonly [minX, minY, maxX, maxY]` (L4-L9) — a 4-number tuple: top-left (minX,minY) and bottom-right (maxX,maxY) corners. Coordinate-space convention: y grows downward, so "top-left" = min, "bottom-right" = max.
- `isBounds(box: unknown): box is Bounds` (L11-L17) — type guard: true iff `box` is an array of length 4 with all four entries `typeof === "number"`. No side effects.

---

### packages/common/src/colors.ts

Color utilities: dark-mode filter emulation (CSS invert + hue-rotate done in JS), the canonical color palette/quick-pick definitions, and hex/contrast/normalization helpers. Depends on `tinycolor2` and `@excalidraw/math` (`clamp`, `degreesToRadians`).

- `DARK_MODE_COLORS_CACHE` (L13-L14) — module-level `Map<string,string>` memo, but only instantiated when `window` exists (null on server to avoid leaks). Invariant: cache is browser-only.
- `cssHueRotate(red, green, blue, degrees: Degrees): {r,g,b}` (L16-L57) — replicates CSS `hue-rotate()`. Normalizes RGB to [0,1], builds the standard 3x3 luminance-preserving hue-rotation matrix using `cos`/`sin` of the radian angle (the exact coefficients 0.213/0.715/0.072 etc., L34-L44), applies it, clamps each channel to [0,1], and returns integer 0-255 values. Pure. Non-obvious: the matrix coefficients must be copied verbatim for visual parity.
- `cssInvert(r, g, b, percent): {r,g,b}` (L59-L81) — replicates CSS `invert(percent%)`. Clamps percent to [0,100], divides by 100, and blends each channel via `color*(1-p) + (255-color)*p`, rounding and clamping to [0,255]. Pure.
- `applyDarkModeFilter(color: string): string` (L83-L110) — main dark-mode transform; checks/populates the cache. Reads alpha, converts to RGB, applies `cssInvert(...,93)` then `cssHueRotate(..., 180)` (order matters; corresponds to CSS `invert(93%) hue-rotate(180deg)`), converts back to hex preserving alpha. Side effect: writes to `DARK_MODE_COLORS_CACHE`. Parity-critical: 93% invert + 180° hue-rotate, in that order.
- `pick(source, keys)` (L117-L127) — local helper (duplicated from utils to avoid a circular dep, per the FIXME) building a `Pick<R, K[number]>` by reducing over keys present in source.
- Types: `ColorTuple = readonly [string,string,string,string,string]` (L129), `ColorPaletteCustom = { [key: string]: ColorTuple | string }` (L132), `ColorShadesIndexes = [number,number,number,number,number]` (L133), `ColorPalette = typeof COLOR_PALETTE` (L164), `ColorPickerColor = keyof typeof COLOR_PALETTE` (L165).
- Constants of significance: `MAX_CUSTOM_COLORS_USED_IN_CANVAS = 5`, `COLORS_PER_ROW = 5` (L135-L136); `DEFAULT_CHART_COLOR_INDEX = 4`, `DEFAULT_ELEMENT_STROKE_COLOR_INDEX = 4`, `DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX = 1` (L138-L141); `COLOR_PALETTE` (L143-L162, open-color-derived 5-shade tuples at weights 50/200/400/600/800 plus transparent/black `#1e1e1e`/white `#ffffff`); `COMMON_ELEMENT_SHADES` (L167-L178, palette minus gray/black/transparent); quick-pick arrays `DEFAULT_ELEMENT_STROKE_PICKS` (L184-L190), `DEFAULT_ELEMENT_BACKGROUND_PICKS` (L193-L199), `DEFAULT_CANVAS_BACKGROUND_PICKS` (L202-L212) — ORDER is load-bearing for quick-picker positioning; `DEFAULT_ELEMENT_STROKE_COLOR_PALETTE` (L217-L226), `DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE` (L229-L237).
- `getAllColorsSpecificShade(index: 0|1|2|3|4)` (L243-L257) — returns the 10 chromatic colors (cyan/blue/violet/grape/pink, then green/teal/yellow/orange/red) at a given shade index. Must NOT include gray/transparent/black (comment L242). Pure.
- `rgbToHex(r, g, b, a?): string` (L263-L279) — builds `#RRGGBB` via the `(1<<24)+(r<<16)+(g<<8)+b` trick (guarantees 6 hex digits after `slice(1)`); if `a !== undefined && a < 1`, appends 2-digit alpha hex (`round(a*255)`), producing `#RRGGBBAA`. Pure. Parity-critical bit math.
- `colorToHex(color): string | null` (L285-L292) — validates via tinycolor; returns `#RRGGBB`/`#RRGGBBAA` or null if invalid.
- `isTransparent(color): boolean` (L294-L296) — true iff tinycolor alpha === 0.
- `COLOR_OUTLINE_CONTRAST_THRESHOLD = 240` (L302).
- `calculateContrast(r,g,b): number` (L304-L307) — YIQ luma `(r*299 + g*587 + b*114)/1000`. Pure.
- `isColorDark(color, threshold = 160): boolean` (L310-L328) — empty/invalid color → treated as black (dark, true); transparent → false; else compares YIQ to threshold. Default threshold 160.
- `normalizeInputColor(color): string | null` (L338-L355) — trims; passes transparent through; if tinycolor-valid and the format is hex/hex8 but missing leading `#`, prepends `#` (works around an Electron/Obsidian quirk where `#`-less hex validates); else returns the color as-is, or null if invalid.

---

### packages/common/src/constants.ts

The central constants table for the editor: thresholds, enums, MIME types, fonts, palettes-of-defaults, zoom limits, roundness/roughness/stroke enums, and default element/UI props. Depends on `COLOR_PALETTE` from colors.ts and element/app types.

- `supportsResizeObserver` (L9-L10) — boolean feature-detect (`window` + `"ResizeObserver"`).
- Interaction thresholds (px): `TEXT_AUTOWRAP_THRESHOLD = 36`, `DRAGGING_THRESHOLD = 10`, `MINIMUM_ARROW_SIZE = 20`, `LINE_CONFIRM_THRESHOLD = 8`, `ELEMENT_SHIFT_TRANSLATE_AMOUNT = 5`, `ELEMENT_TRANSLATE_AMOUNT = 1`, `TEXT_TO_CENTER_SNAP_THRESHOLD = 30` (L18-L24); `SHIFT_LOCKING_ANGLE = Math.PI/12` (15°, L25); `DEFAULT_LASER_COLOR = "red"` (L26).
- `CURSOR_TYPE` (L27-L35) — map of cursor CSS values (`AUTO: ""`). `POINTER_BUTTON` (L36-L42) — main 0/wheel 1/secondary 2/touch -1/eraser 5. `POINTER_EVENTS` (L44-L50) — enabled/disabled/inheritFromUI (CSS var, cast `any`).
- `enum EVENT` (L52-L84) — DOM + custom event-name string enum (copy/paste/keydown/pointer/gesture/etc. plus custom `EXCALIDRAW_LINK`, `MENU_ITEM_SELECT`, etc.).
- `YOUTUBE_STATES` (L86-L93); `ENV` (L95-L99, test/development/production); `CLASSES` (L101-L110, DOM class-name constants).
- Font system: `FONT_SIZES` (L112-L117, sm16/md20/lg28/xl36); `CJK_HAND_DRAWN_FALLBACK_FONT = "Xiaolai"`, `WINDOWS_EMOJI_FALLBACK_FONT = "Segoe UI Emoji"` (L119-L120); `FONT_FAMILY` (L130-L141, numeric ids; 4 reserved/unused); generic fallbacks `SANS_SERIF_GENERIC_FONT`/`MONOSPACE_GENERIC_FONT` (L145-L146); `FONT_FAMILY_GENERIC_FALLBACKS` (L148-L151, 998/999); `FONT_FAMILY_FALLBACKS` (L153-L157).
- `getGenericFontFamilyFallback(fontFamily: number): keyof typeof FONT_FAMILY_GENERIC_FALLBACKS` (L159-L170) — returns monospace for Cascadia and Comic Shanns, else sans-serif.
- `getFontFamilyFallbacks(fontFamily: number): Array<keyof typeof FONT_FAMILY_FALLBACKS>` (L172-L187) — for Excalifont returns `[CJK, generic, emoji]`; otherwise `[generic, emoji]`. Ordering matters for glyph fallback.
- `THEME` (L189-L192, light/dark); `DARK_THEME_FILTER = "invert(93%) hue-rotate(180deg)"` (L194) — the CSS counterpart of `applyDarkModeFilter`.
- `FRAME_STYLE` (L196-L210) — frame stroke/fill/roundness defaults plus name label styling (radius 8, nameOffsetY 3, light `#999999`/dark `#7a7a7a`, fontSize 14, lineHeight 1.25).
- Font/sizing defaults: `MIN_FONT_SIZE = 1`, `DEFAULT_FONT_SIZE = 20`, `DEFAULT_FONT_FAMILY = FONT_FAMILY.Excalifont`, `DEFAULT_TEXT_ALIGN = "left"`, `DEFAULT_VERTICAL_ALIGN = "top"`, `DEFAULT_VERSION = "{version}"`, `DEFAULT_TRANSFORM_HANDLE_SPACING = 2` (L212-L218).
- Resize/collision math: `SIDE_RESIZING_THRESHOLD = 2*DEFAULT_TRANSFORM_HANDLE_SPACING` (=4), `EPSILON = 0.00001`, `DEFAULT_COLLISION_THRESHOLD = 2*SIDE_RESIZING_THRESHOLD - EPSILON` (L220-L225). Parity-critical epsilon ensures side-resize precedence.
- `COLOR_WHITE`/`COLOR_CHARCOAL_BLACK`/`COLOR_VOICE_CALL` (L227-L230); `CANVAS_ONLY_ACTIONS` (L232).
- Grid: `DEFAULT_GRID_SIZE = 20`, `DEFAULT_GRID_STEP = 5` (L234-L235).
- MIME maps: `IMAGE_MIME_TYPES` (L237-L247), `STRING_MIME_TYPES` (L249-L260, includes excalidraw vendor JSON types), `MIME_TYPES` (L262-L271, merges plus binary + image-encoded), `ALLOWED_PASTE_MIME_TYPES` (L273-L277).
- Export: `EXPORT_IMAGE_TYPES` (L279-L283), `EXPORT_DATA_TYPES` (L285-L290), `getExportSource()` (L292-L293, returns `window.EXCALIDRAW_EXPORT_SOURCE || window.location.origin`), `MAX_DECIMALS_FOR_SVG_EXPORT = 2` (L335), `EXPORT_SCALES = [1,2,3]`, `DEFAULT_EXPORT_PADDING = 10` (L337-L338), `DEFAULT_IMAGE_OPTIONS` (L340-L343, maxWidthOrHeight 1440, 4MB cap).
- Timing (ms): `IMAGE_RENDER_TIMEOUT 500`, `TAP_TWICE_TIMEOUT 300`, `TOUCH_CTX_MENU_TIMEOUT 500`, `TITLE_TIMEOUT 10000`, `VERSION_TIMEOUT 30000`, `SCROLL_TIMEOUT 100` (L296-L301); `HYPERLINK_TOOLTIP_DELAY 300` (L305); `IDLE_THRESHOLD 60_000`, `ACTIVE_THRESHOLD 3_000` (L308-L310); `BIND_MODE_TIMEOUT 700` (L511).
- Zoom: `ZOOM_STEP 0.1`, `MIN_ZOOM 0.1`, `MAX_ZOOM 30` (L302-L304). Parity-critical zoom clamp bounds.
- `URL_QUERY_KEYS`/`URL_HASH_KEYS` (L312-L318, addLibrary); `DEFAULT_UI_OPTIONS` (L320-L333); `SVG_NS`, `SVG_DOCUMENT_PREAMBLE` (L345-L348); `ENCRYPTION_KEY_BITS = 128` (L350); `VERSIONS` (L352-L355).
- Text/arrow layout: `BOUND_TEXT_PADDING = 5`, `ARROW_LABEL_WIDTH_FRACTION = 0.7`, `ARROW_LABEL_FONT_SIZE_TO_MIN_WIDTH_RATIO = 11` (L357-L359); `VERTICAL_ALIGN` (L361-L365), `TEXT_ALIGN` (L367-L371).
- `ELEMENT_READY_TO_ERASE_OPACITY = 20` (L373).
- Roundness math: `DEFAULT_PROPORTIONAL_RADIUS = 0.25` (25% of largest side), `DEFAULT_ADAPTIVE_RADIUS = 32` px (L378-L380); `ROUNDNESS` enum LEGACY 1 / PROPORTIONAL_RADIUS 2 / ADAPTIVE_RADIUS 3 (L382-L399). Parity-critical for corner-radius rendering.
- `ROUGHNESS` (architect0/artist1/cartoonist2, L401-L405); `STROKE_WIDTH` (thin1/bold2/extraBold4, L407-L411).
- `DEFAULT_ELEMENT_PROPS` (L413-L431) — default stroke/background/fill/strokeWidth(2)/strokeStyle/roughness(artist)/opacity(100)/locked(false).
- Sidebar: `LIBRARY_SIDEBAR_TAB`, `CANVAS_SEARCH_TAB`, `DEFAULT_SIDEBAR`, `LIBRARY_DISABLED_TYPES` (set of iframe/embeddable/image) (L433-L445).
- `TOOL_TYPE` (L448-L465); `EDITOR_LS_KEYS` (L467-L472); `DEFAULT_FILENAME = "Untitled"` (L478); `STATS_PANELS` (L480); `MIN_WIDTH_OR_HEIGHT = 1` (L482); `ARROW_TYPE` (sharp/round/elbow, L484-L488); `DEFAULT_REDUCED_GLOBAL_ALPHA = 0.3`, `ELEMENT_LINK_KEY = "element"` (L490-L491); `ORIG_ID = Symbol.for("__test__originalId__")` (L494); `enum UserIdleState` ACTIVE/AWAY/IDLE (L496-L500); `LINE_POLYGON_POINT_MERGE_DISTANCE = 20` (L507); `DOUBLE_TAP_POSITION_THRESHOLD = 35` (L509); `MOBILE_ACTION_BUTTON_BG` (L514-L516).
- This file is overwhelmingly constants; the only functions are `getGenericFontFamilyFallback`, `getFontFamilyFallbacks`, and `getExportSource`.

---

### packages/common/src/editorInterface.ts

Form-factor / responsive-layout detection: user-agent sniffing, breakpoint helpers, and a persisted desktop UI-mode preference. Most exports read `navigator`/`window` and are thus impure (environment-dependent).

- Types: `StylesPanelMode = "compact" | "full" | "mobile"` (L1); `EditorInterface` (L3-L13) — readonly `{ formFactor: phone|tablet|desktop; desktopUIMode: compact|full; userAgent: { isMobileDevice; platform: ios|android|other|unknown }; isTouchScreen; canFitSidebar; isLandscape }`.
- `DESKTOP_UI_MODE_STORAGE_KEY = "excalidraw.desktopUIMode"` (L16, private localStorage key).
- Breakpoint constants (L19-L32): `MQ_MAX_MOBILE = 599`, `MQ_MAX_WIDTH_LANDSCAPE = 1000`, `MQ_MAX_HEIGHT_LANDSCAPE = 500`, `MQ_MIN_TABLET = 600`, `MQ_MAX_TABLET = 1180`, `MQ_MIN_WIDTH_DESKTOP = 1440`, `MQ_RIGHT_SIDEBAR_MIN_WIDTH = 1229`.
- UA flags evaluated at module load: `isDarwin`, `isWindows`, `isAndroid`, `isFirefox`, `isChrome`, `isSafari` (`!isChrome && UA has Safari`), `isIOS` (platform regex OR Mac-with-touch heuristic) (L37-L51); `isBrave()` (L53-L54) kept as a function so tests can mock it. Invariant: these are computed once at import; SSR-fragile (most reference `navigator` directly without guards).
- `isMobileBreakpoint(width, height): boolean` (L64-L69) — true if `width <= 599` OR (`height < 500 && width < 1000`). Pure (args only).
- `isTabletBreakpoint(editorWidth, editorHeight): boolean` (L71-L79) — uses min/max side; true if `minSide >= 600 && maxSide <= 1180`. Pure.
- `isMobileOrTablet(): boolean` (L81-L135) — private multi-stage heuristic: (1) prefer Chromium `navigator.userAgentData` (mobile flag + platform; desktop OSes return false, android-non-mobile checks coarse-pointer/no-hover media queries); (2) iOS → true; (3) legacy android UA fallback gated on touch media queries; (4) desktop-platform exclusion → false; default false. Reads `navigator` and `matchMedia`. Impure.
- `getFormFactor(editorWidth, editorHeight): "phone"|"tablet"|"desktop"` (L137-L150) — phone if mobile breakpoint, else tablet if tablet breakpoint, else desktop. Pure given dimensions.
- `deriveStylesPanelMode(editorInterface): StylesPanelMode` (L152-L164) — phone→"mobile", tablet→"compact", else the `desktopUIMode`. Pure.
- `createUserAgentDescriptor(userAgentString): EditorInterface["userAgent"]` (L166-L184) — derives platform (ios/android/other/unknown) from the module UA flags and calls `isMobileOrTablet()` for `isMobileDevice`. Impure (uses global flags).
- `loadDesktopUIModePreference(): "compact"|"full"|null` (L186-L201) — reads localStorage, returns valid value or null; swallows storage errors (Safari private mode). Side effect: read.
- `persistDesktopUIMode(mode)` (L203-L212, private) — writes localStorage, swallows errors.
- `setDesktopUIMode(mode)` (L214-L222) — validates mode is compact/full, persists, returns the mode (or undefined if invalid). Side effect: localStorage write.

---

### packages/common/src/emitter.ts

A minimal synchronous pub/sub primitive that `AppEventBus` builds upon.

`class Emitter<T extends any[] = []>` (L5-L51):
- Public `subscribers: Subscriber<T>[] = []` (L6). `Subscriber<T> = (...payload: T) => void` (L3).
- `on(...handlers): UnsubscribeCallback` (L13-L21) — flattens nested handler arrays, filters to functions only, pushes them, and returns an unsubscribe closure that calls `off(_handlers)`. Side effect: mutates `subscribers`.
- `once(...handlers): UnsubscribeCallback` (L23-L32) — appends a self-detaching handler (`() => detach()`) so that after the first `trigger`, all registered handlers are removed; returns the detach function. Note: all handlers in the same `once` call share one detach and fire once.
- `off(...handlers)` (L34-L39) — flattens and filters `subscribers` to remove the given handlers (identity comparison via `includes`).
- `trigger(...payload: T)` (L41-L46) — synchronously invokes every subscriber in registration order with the payload; returns `this` for chaining. Invariant: synchronous, ordered, no error isolation (a throwing subscriber aborts the loop).
- `clear()` (L48-L50) — empties `subscribers`.
- Parity note: `trigger` is synchronous (unlike `AppEventBus` replay which is microtask-deferred); `once` works by snapshotting then detaching, so reentrant subscription changes during a trigger behave per the running array snapshot of the `for...of`.
