## Cluster: excalidraw__(root)__0

This cluster covers seven files at the root of `packages/excalidraw/`: analytics tracking, the animated laser/eraser trail renderer, the editor's default `AppState` plus storage-stripping logic, remote-collaborator cursor rendering, the system clipboard read/write/parse layer, a CSS-typing declaration, and cursor-styling helpers.

---

### packages/excalidraw/analytics.ts

Purpose: Thin, opt-in analytics shim that forwards a whitelisted subset of events to the global `window.sa_event` (Simple Analytics) function.

- `ALLOWED_CATEGORIES_TO_TRACK` (const, L6) — `Set(["command_palette", "export"])`. The hard whitelist of trackable categories; any other category is silently dropped. Note the file's opening comment lines (L1, L5) are split awkwardly around this import.
- `trackEvent(category: string, action: string, label?: string, value?: number) => void` (L8-L46) — Guarded analytics dispatch. Returns early (no-op) when: `window` is undefined (SSR/worker), `VITE_WORKER_ID` is set, `VITE_APP_ENABLE_TRACKING !== "true"`, the category is not in the whitelist, or `isDevEnv()` is true (L27-L30, explicitly commented as the toggle to flip for local debugging). In non-PROD it `console.info`s the event (L32-L34). When `window.sa_event` exists it calls `sa_event(action, { category, label, value })` (L36-L42). Entire body wrapped in try/catch that logs to `console.error` — analytics never throws into the caller. Side effects: console + external global call only.

---

### packages/excalidraw/animatedTrail.ts

Purpose: Implements the animated freehand "trail" effect (used by the laser pointer and similar tools), rendering a smoothed stroke into a single SVG `<path>` driven by the requestAnimationFrame loop in `AnimationController`.

- `interface Trail` (L15-L22) — Contract: `start(container: SVGSVGElement): void`, `stop(): void`, `startPath(x,y)`, `addPointToPath(x,y)`, `endPath()`.
- `interface AnimatedTrailOptions` (L24-L28) — `fill: (trail: AnimatedTrail) => string`, optional `stroke: (trail) => string`, optional `animateTrail?: boolean`. Fill/stroke are computed lazily per frame (so they can depend on live state/theme).
- `class AnimatedTrail implements Trail` (L30-L222):
  - Private fields: `currentTrail?: LaserPointer`, `pastTrails: LaserPointer[]`, `container?: SVGSVGElement`, `trailElement: SVGPathElement`, `trailAnimation?: SVGAnimateElement`, `key: string`. Static `counter = 0` used to mint unique animation keys.
  - `constructor(protected app: App, private options: Partial<LaserPointerOptions> & Partial<AnimatedTrailOptions>)` (L41-L59) — Mints `key = "animated-trail-${counter++}"` (L46), creates a `<path>` via `document.createElementNS(SVG_NS, "path")`. If `animateTrail`, builds an `<animate>` element animating `stroke-dashoffset` from `0` to `-14` over `0.3s`, with `stroke-dasharray "7 7"` and `stroke-dashoffset "10"` on the path — the marching-ants dashed laser look (L48-L58).
  - `get hasCurrentTrail()` (L61-L63) — boolean: is a trail currently being drawn.
  - `hasLastPoint(x: number, y: number): boolean` (L65-L75) — true iff the last original point of the current trail equals `(x,y)`. Used to dedupe identical consecutive points.
  - `private cleanup()` (L77-L84) — clears `pastTrails`, nulls `currentTrail`, removes the path element from its container if attached.
  - `start(container?: SVGSVGElement)` (L86-L107) — attaches the path to the (optionally newly-set) container and, if not already running, registers a per-frame callback with `AnimationController.start(key, ...)`. The callback calls `onFrame()`: while it returns truthy it returns `{ keep: true }`, otherwise it `cleanup()`s and returns `null` (ends the animation). Side effect: DOM insertion + RAF loop registration.
  - `stop()` (L109-L112) — cancels the animation and cleans up.
  - `startPath(x, y)` (L114-L120) — creates a fresh `LaserPointer`, pushes `[x, y, performance.now()]` (timestamped point), then `update()`.
  - `addPointToPath(x, y)` (L122-L127) — appends a timestamped point to the current trail and `update()`s.
  - `endPath()` (L129-L137) — closes the current trail, sets `keepHead = false`, moves it into `pastTrails`, nulls `currentTrail`, `update()`s. Past trails continue to fade out on subsequent frames.
  - `getCurrentTrail()` (L139-L141) / `clearTrails()` (L143-L147) — accessor / reset.
  - `private update()` (L149-L155) — re-arms the animation: calls `start()` (idempotent) and, if animating, sets `<animate>` `begin="indefinite"` and `repeatCount="indefinite"`.
  - `private onFrame(): boolean` (L157-L202) — The per-frame render. Builds SVG path-data strings for every past trail plus the current trail (L160-L167); prunes past trails whose stroke outline has fully decayed to zero length, querying `getStrokeOutline(options.size / app.state.zoom.value)` — note the **zoom-normalized stroke size** (L169-L173). If no paths remain, clears `d=""` and returns false (ends loop). Otherwise joins paths with a space, sets `d`, and sets `fill` (and `stroke` when animating) from the lazy option functions defaulting to `"black"` (L182-L199). Returns true to keep the loop alive.
  - `private drawTrail(trail: LaserPointer, state: AppState): string` (L204-L221) — Computes the stroke outline at zoom-normalized size, maps each `[x,y]` from **scene coords to viewport coords** via `sceneCoordsToViewportCoords` (L208-L213). When animating, it slices the outline to its first half (`_stroke.slice(0, len/2)`) so the dashed animation renders a single-thickness line rather than a closed outline (L216-L218). Returns `getSvgPathFromStroke(stroke, true)`. Key coordinate-space detail for parity: points are stored in scene space and converted to viewport space at render time, and stroke width is divided by `zoom.value`.

---

### packages/excalidraw/appState.ts

Purpose: Defines the editor's default `AppState`, the per-key storage configuration matrix (browser/export/server), and the helpers that strip state down for each storage target.

- `defaultExportScale` (const, L18-L20) — `EXPORT_SCALES.includes(devicePixelRatio) ? devicePixelRatio : 1`. The initial export scale, snapped to the device pixel ratio when it's a supported scale.
- `getDefaultAppState(): Omit<AppState, "offsetTop" | "offsetLeft" | "width" | "height">` (L22-L132) — Returns a fresh default AppState. Notable defaults: `theme: THEME.LIGHT`, `collaborators: new Map()`, `activeTool: { type: "selection", customType: null, locked, fromSelection: false, lastActiveTool: null }`, `gridSize/gridStep` from constants, `zoom: { value: 1 }`, `viewBackgroundColor: COLOR_PALETTE.white`, `currentItemRoundness: isTestEnv() ? "sharp" : "round"` (test-determinism hook, L39), `currentItemArrowType: ARROW_TYPE.round`, `stats.panels` = bitwise OR of `STATS_PANELS.generalStats | STATS_PANELS.elementProperties` (L100), `bindMode: "orbit"`, `boxSelectionMode: "contain"`. The four omitted keys are layout/viewport dimensions supplied by the host at mount. Invariant: this is the single source of truth for "what a blank editor looks like."
- `APP_STATE_STORAGE_CONF` (const, L138-L257) — A typed config object mapping **every** `AppState` key to `{ browser: boolean; export: boolean; server: boolean }`. The surrounding IIFE generic (`Values`, `T extends Record<keyof AppState, Values>`) enforces at compile time that every AppState key is present and only AppState keys appear. Persisted to browser/IDB when `browser:true`, to file/db export when `export:true`, to collab server when `server:true`. The small set kept for export+server is `gridSize`, `gridStep`, `gridModeEnabled`, `viewBackgroundColor`, `lockedMultiSelections` (L191-L193, L239, L254). This matrix is the authoritative answer for parity work on "what state survives a save/share."
- `_clearAppStateForStorage<ExportType extends "export"|"browser"|"server">(appState: Partial<AppState>, exportType: ExportType)` (L259-L281) — Generic filter: iterates `appState` keys, keeps only those whose config flag for the given `exportType` is true, returns a narrowed object. Uses an `ExportableKeys` mapped type to type the result; the actual assignment casts through `any` to dodge a known TS limitation (comment references microsoft/TypeScript#31445, L276).
- `clearAppStateForLocalStorage(appState)` (L283-L285) — `_clearAppStateForStorage(appState, "browser")`.
- `cleanAppStateForExport(appState)` (L287-L289) — `_clearAppStateForStorage(appState, "export")`.
- `clearAppStateForDatabase(appState)` (L291-L293) — `_clearAppStateForStorage(appState, "server")`.
- `isEraserActive({ activeTool })` (L295-L299) — `activeTool.type === "eraser"`.
- `isHandToolActive({ activeTool })` (L301-L307) — `activeTool.type === "hand"`.

---

### packages/excalidraw/clients.ts

Purpose: Renders remote collaborators' cursors (arrow, name label, speaking indicator, click ripple) directly onto the interactive canvas, and derives a stable per-user color.

- `hashToInteger(id: string): number` (internal, L18-L28) — Classic `hash = hash*31 + char` (implemented as `(hash << 5) - hash + char`) string hash. Returns 0 for empty string. Used so that color assignment is deterministic per user id.
- `getClientColor(socketId: SocketId, collaborator: Collaborator | undefined): string` (L30-L44) — Hashes `collaborator?.id || socketId`, takes `Math.abs(hash) % 37 * 10` to get a hue on a 10-degree step (37 buckets, 0..360), and returns `hsl(hue, 100%, 83%)` — fixed high saturation, high lightness for pastel cursors. The hashing is explicitly to even out non-uniform ids (comment L31-L33).
- `getNameInitial(name?: string | null): string` (L49-L55) — Returns the first code point (uses `codePointAt(0)` to handle surrogate pairs/emoji), uppercased; `"?"` when empty.
- `renderRemoteCursors({ context, renderConfig, appState, normalizedWidth, normalizedHeight }): void` (L57-L261) — The collaborator-cursor painter. For each `[socketId, pointer]` in `renderConfig.remotePointerViewportCoords`:
  - Translates pointer by `-offsetLeft/-offsetTop` into canvas space, then **clamps** x/y into `[0, normalizedWidth-width]` / `[0, normalizedHeight-height]` with `width=11, height=14`; `isOutOfBounds` is recorded before clamping (L79-L91). Out-of-bounds cursors are still drawn but at the clamped edge and dimmed.
  - Sets fill/stroke to the user's color; if out of bounds, idle, or away (`UserIdleState.IDLE/AWAY`), sets `globalAlpha = 0.3` (L99-L107).
  - If the remote button is "down", draws two concentric `arc(x,y,15,...)` rings (white then color) as a click ripple (L109-L123).
  - Draws the cursor arrow as a 4-point polygon (`moveTo(x,y) → (x,y+14) → (x+4,y+9) → (x+11,y+8)`): first a thick white outline (lineWidth 6, lineJoin round), then the colored fill; inactive cursors use a slightly offset polygon and fill-only (L147-L182). Speaking users get an extra green outline pass first (`IS_SPEAKING_COLOR` = `#2f6330` dark / `COLOR_VOICE_CALL` light, L126-L145).
  - Name label (L184-L256): only when in-bounds and a username exists. Sets `font = "600 12px sans-serif"` *before* `measureText` (comment notes ordering matters, L187). Computes box geometry from `measure.width`, `actualBoundingBoxAscent/Descent`, fixed paddings (5 horizontal, 3 vertical), `finalHeight = max(measureHeight, 12)`. Uses native `context.roundRect` (radius 8) when available, else falls back to the local `roundRect` helper (L202-L218). Draws the name in `COLOR_CHARCOAL_BLACK`, vertically centered with a floor-half adjustment (L221-L229). Speaking users additionally get three vertical bars (heights 8/16/8, gap 5, margin 8) drawn to the right of the label (L232-L255).
  - Wraps each cursor in `context.save()`/`context.restore()`. Coordinate-space note: input is already viewport coords from `renderConfig`; this function only offsets, clamps, and paints — all math is in device/viewport pixels.

---

### packages/excalidraw/clipboard.ts

Purpose: The full system-clipboard layer — serializing Excalidraw elements to clipboard JSON, synthesizing/parsing paste & drag events, reading the OS clipboard, and writing text/PNG with multi-strategy fallbacks.

Types/constants:
- `ElementsClipboard` (type, L38-L42), `PastedMixedContent` (type, L44), `ClipboardData` interface (L46-L53), `AllowedPasteMimeTypes` (L55), `ParsedClipboardEventTextData` (L57-L59), `AllowedParsedDataTransferItem` / `ParsedDataTransferItem` / `ParsedDataTransferItemType` (L365-L385), `ParsedDataTransferFile` (L387-L390), `ParsedDataTranferList` (intersection type bolting `findByType`/`getData`/`getFiles` onto an array, L392-L406).
- `probablySupportsClipboardReadText` (L61-L62), `probablySupportsClipboardWriteText` (L64-L65), `probablySupportsClipboardBlob` (L67-L71) — feature-detection booleans computed at module load.

Functions:
- `clipboardContainsElements(contents: any): contents is {...}` (internal, L73-L87) — Type guard: true when `contents.type` is one of the three excalidraw clipboard data-type strings and `contents.elements` is an array.
- `createPasteEvent({ types?, files? })` (L89-L140) — Synthesizes a `ClipboardEvent("paste")` with a fresh `DataTransfer`. Adds each string `type→value` pair (throwing if round-trip `getData` mismatches), and adds files; non-string values in `types` are demoted to files. Used to drive programmatic paste. Throws on failure to set any item.
- `serializeAsClipboardJSON({ elements, files })` (L142-L192) — Builds the clipboard payload. Collects only the `files` referenced by initialized image elements (warns if an image element exists but no `files` object given, L165-L169). Critically, for any element whose containing frame is NOT also being copied, it `deepCopyElement`s and `mutateElement(..., { frameId: null })` so the copy isn't orphaned to a missing frame (L174-L187). Returns `JSON.stringify(contents)` with `type: excalidrawClipboard`.
- `copyToClipboard(elements, files, clipboardEvent?)` (L194-L209) — Serializes then writes the JSON under both `MIME_TYPES.excalidrawClipboard` and `MIME_TYPES.text` via `copyTextToSystemClipboard`.
- `parseHTMLTree(el: ChildNode): PastedMixedContent` (internal recursive, L212-L230) — Walks DOM nodes: text nodes (nodeType 3) become `{type:"text"}` (trimmed, non-empty), `<img>` with an `http`-prefixed `src` become `{type:"imageUrl"}`, everything else recurses. Used to extract mixed text+image content from pasted HTML.
- `maybeParseHTMLDataItem(dataItem): {type:"mixedContent"; value} | null` (internal, L232-L250) — Parses an HTML clipboard string via `DOMParser`, runs `parseHTMLTree` on the body, returns mixedContent if any. Swallows parse errors to `console.error`.
- `readSystemClipboard()` (L256-L325) — Reads the OS clipboard via `navigator.clipboard.read()`, with a multi-level fallback to `readText()` and graceful handling of empty-clipboard `DataError` (L256-L292). Iterates items/types, keeping only `ALLOWED_PASTE_MIME_TYPES`; text/html stored as strings, supported image types converted to `File` via `createFile`, unsupported types throw `ExcalidrawError`. Returns a `{ [mime]: string | File }` map. Requests OS permission as a side effect.
- `parseClipboardEventTextData(dataList, isPlainPaste=false): Promise<ParsedClipboardEventTextData>` (internal, L330-L363) — If not plain-paste and HTML is present, parses mixed content; if all items are text, collapses to a single text value (preferring `text/plain`, else joining mixed text with newlines). Otherwise returns trimmed `text/plain`. Returns empty text on any throw.
- `findDataTransferItemType` (L408-L416), `getDataTransferItemData` (L417-L433), `getDataTransferFiles` (L435-L441) — The three methods bound onto a `ParsedDataTranferList`: find a string item by type, get its value, and filter file items respectively.
- `parseDataTransferEventMimeTypes(event): Set<string>` (L444-L464) — Synchronously enumerates the MIME types present on a clipboard/drag event's items (handles both `clipboardData` and `dataTransfer`).
- `parseDataTransferEvent(event): Promise<ParsedDataTranferList>` (L466-L517) — Asynchronously materializes all data-transfer items into `ParsedDataTransferItem`s: files are read, given a `fileHandle` (via `getFileHandle`) and normalized (`normalizeFile`); strings are read from `clipboardData.getData` or `getAsString`. Returns the array augmented with the three helper methods via `Object.assign`.
- `parseClipboard(dataList, isPlainPaste=false): Promise<ClipboardData>` (L522-L554) — Top-level paste parser. Returns mixedContent if detected; otherwise tries `JSON.parse` the text and, if it `clipboardContainsElements`, returns `{ elements, files, text?, programmaticAPI }` (text is the pretty-printed elements only when plain-paste). Falls back to `{ text }`.
- `copyBlobToClipboardAsPng(blob: Blob | Promise<Blob>)` (L556-L584) — Writes a PNG `ClipboardItem`. Notes the Safari requirement to construct the ClipboardItem synchronously and the Firefox quirk; if a Promise blob fails, it awaits the blob and retries (L572-L582).
- `copyTextToSystemClipboard<MimeType>(text, clipboardEvent?)` (L586-L636) — Three-tier write strategy: (1) if a `clipboardEvent` is available, `setData` each entry and verify round-trip; (2) else `navigator.clipboard.writeText` for the `text/plain` entry; (3) else `document.execCommand` fallback. Throws "Error copying to clipboard." if all fail (L633-L635).
- `copyTextViaExecCommand(text)` (internal, L639-L679) — The legacy fallback: creates an off-screen `<textarea>` (RTL-aware `-9999px` placement, `12pt` font to suppress iOS zoom), selects its content, runs `execCommand("copy")`, removes the textarea, returns success boolean. Empty text is replaced with a single space because execCommand rejects empties (L641-L643).
- `isClipboardEvent(event): event is ClipboardEvent` (L681-L690) — Duck-types on `event.type` being PASTE/COPY/CUT rather than `instanceof` (comment: jsdom-friendly).

---

### packages/excalidraw/css.d.ts

Purpose: TypeScript ambient declaration augmenting `csstype`'s `Properties` interface so custom CSS variables can be set type-safely in inline-style objects.

- Types-only / no functions. Augments `csstype` module's `Properties` interface (L3-L10) with four optional custom-property keys: `"--max-width"` (number|string), `"--swatch-color"` (string), `"--gap"` (number|string), `"--padding"` (number|string).

---

### packages/excalidraw/cursor.ts

Purpose: Helpers that set the interactive canvas's CSS `cursor` based on the active tool/theme, including a cached eraser-cursor canvas and inline-SVG laser-pointer cursors.

- Module-level cursor SVG strings (L7-L20): `laserPointerCursorSVG_tag`, `laserPointerCursorBackgroundSVG`, `laserPointerCursorIconSVG`, and the two `data:` URL cursors `laserPointerCursorDataURL_lightMode` (icon only) / `laserPointerCursorDataURL_darkMode` (background + icon) built with `encodeURIComponent`. Note: the *light* mode uses the icon-only SVG and *dark* mode adds the white background — intentional contrast inversion.
- `resetCursor(interactiveCanvas: HTMLCanvasElement | null)` (L22-L26) — Clears `style.cursor` to `""` (default).
- `setCursor(interactiveCanvas, cursor: string)` (L28-L35) — Sets `style.cursor` to the given string; no-op on null.
- `eraserCanvasCache` / `previewDataURL` (module-level mutable cache, L37-L38) — Memoize the rendered eraser cursor across calls, keyed by theme.
- `setEraserCursor(interactiveCanvas, theme: AppState["theme"])` (L39-L77) — Renders a 20px circle (radius 5, centered) onto an offscreen canvas with theme-appropriate fill/stroke (black-on-white inverted by theme), caches it as a data URL, and sets it as the cursor with a hotspot at `(10,10)` i.e. the circle's center (L71-L76). Re-renders only when the cache is empty or the theme changed (L67-L69). Performance: avoids re-rasterizing the cursor every pointer move.
- `setCursorForShape(interactiveCanvas, appState: Pick<AppState,"activeTool"|"theme">)` (L79-L106) — Dispatches the canvas cursor by active tool: `selection` → reset; hand → `CURSOR_TYPE.GRAB`; eraser → cached eraser cursor; `laser` → theme-specific laser data-URL cursor; any tool other than `image`/`custom` → `CURSOR_TYPE.CROSSHAIR`; final branch sets `CURSOR_TYPE.AUTO`. Comment notes image/custom tools are left alone so the host or image-preview can own the cursor (L93-L95, L101-L104).
