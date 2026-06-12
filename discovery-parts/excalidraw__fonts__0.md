## Cluster: excalidraw__fonts__0

This cluster covers Excalidraw's font subsystem: per-font-family WOFF2 face descriptor tables, the `ExcalidrawFontFace` wrapper around the browser `FontFace` API (with unicode-range subsetting and URL fallback resolution), and the central `Fonts` registry/loader orchestrator. Several files are pure data tables (font-face descriptors), while `ExcalidrawFontFace.ts` and `Fonts.ts` hold the load/subset/inline logic that a Canvas reimplementation must mirror for text-metric parity and offline export.

---

### packages/excalidraw/fonts/Cascadia/index.ts

Data-only module exporting the WOFF2 face descriptor table for the Cascadia Code (monospace) font.

- `CascadiaFontFaces: ExcalidrawFontFaceDescriptor[]` — L5-L9. A single-entry array containing one descriptor whose `uri` is the bundled `CascadiaCode-Regular.woff2` asset import (L3). No `descriptors` / `unicodeRange` is set, so the whole font covers all glyphs. Pure data; no functions.

---

### packages/excalidraw/fonts/ComicShanns/index.ts

Data-only module exporting the WOFF2 face descriptor table for "Comic Shanns Mono" (the hand-drawn monospace), split into 4 subsetted WOFF2 files by unicode range.

- `ComicShannsFontFaces: ExcalidrawFontFaceDescriptor[]` — L70-L96. Four descriptors, each mapping one hashed WOFF2 asset import (`_0`.._3`, imported L6-L9, note the deliberate non-sequential `_0,_3,_2,_1` import ordering) to an explicit `descriptors.unicodeRange` string. Ranges partition the codepoint space: `_0` = basic Latin + Latin-1 punctuation/symbols (L74-L75), `_1` = Latin Extended-A/B (L81-L82), `_2` = misc math/diacritics/arrows (L88-L89), `_3` = a single codepoint `U+3bb` (lambda, L94). The large header comment (L1-L68) is `cn-font-split` provenance + MIT license text. Pure data; no functions. Notable: unicode ranges are load-bearing — the browser only fetches a face when a document character falls in its range, and `ExcalidrawFontFace.getUnicodeRangeRegex` parses these same strings.

---

### packages/excalidraw/fonts/Emoji/index.ts

Data-only module declaring the Windows emoji fallback as a system/local font (no downloadable asset).

- `EmojiFontFaces: ExcalidrawFontFaceDescriptor[]` — L5-L9. Single descriptor whose `uri` is `LOCAL_FONT_PROTOCOL` (imported from `@excalidraw/common`, L1). This sentinel URI signals `ExcalidrawFontFace.createUrls` to produce zero URLs (i.e. resolve to a locally installed system font, never fetched/inlined). Pure data; no functions.

---

### packages/excalidraw/fonts/ExcalidrawFontFace.ts

Wraps the browser `FontFace` API for one font face, resolving asset URIs into fetchable URLs (with CDN fallbacks) and producing subsetted, base64-inlined `@font-face` CSS for export.

- `type DataURL = string` — L5. Local alias used to distinguish data-URI strings from `URL` instances throughout.
- `class ExcalidrawFontFace` — L7-L209. Holds `public readonly urls: URL[] | DataURL[]` (resolved sources) and `public readonly fontFace: FontFace` (the live browser object).
  - `private static readonly ASSETS_FALLBACK_URL` — L11-L15. Computes a CDN base (`https://esm.sh/<pkg>@<version>/dist/prod/`) from `import.meta.env.PKG_NAME`/`PKG_VERSION`, falling back to `@excalidraw/excalidraw` (latest) when those build-time envs are absent. This is the final fallback host for bundled fonts so Excalidraw needn't host them forever.
  - `constructor(family: string, uri: string, descriptors?: FontFaceDescriptors)` — L17-L30. Resolves `uri` to `this.urls` via `createUrls`, builds a comma-joined `src` string of `url(<url>) format('<ext>')` entries (L20-L22), and constructs `this.fontFace = new FontFace(family, sources, {...})` defaulting `display:"swap"`, `style:"normal"`, `weight:"400"` then spreading caller `descriptors` (so `unicodeRange`/overrides win). Side effect: instantiates a real `FontFace`.
  - `public toCSS(characters: string): Promise<string> | undefined` — L37-L51. Early-returns `undefined` if none of `characters` falls in this face's unicode range (`getUnicodeRangeRegex().test`, L39). Otherwise converts the string to an array of codepoints via `Array.from(characters).map(c => c.codePointAt(0)!)` (L43-L45; `Array.from` is used so surrogate pairs become single codepoints) and resolves to a self-contained `@font-face { font-family: ...; src: url(<base64 data url>); }` string built from `getContent`. Output is the inlined CSS used for SVG/PNG export.
  - `public async getContent(codePoints: Array<number>): Promise<string>` — L58-L88. Iterates `this.urls` in order (treated as fallbacks): for each, `fetchFont` then `subsetWoff2GlyphsByCodepoints(arrayBuffer, codePoints)` to get a base64 subset, returning on first success. On all-fail it `console.error`s the accumulated per-url error messages (L80-L83) and returns the last url string as a degraded fallback (L87), or `""` if none. Side effect: network fetch + WASM woff2 subsetting.
  - `public fetchFont(url: URL | DataURL): Promise<ArrayBuffer>` — L90-L112. Wrapped in `promiseTry` (so sync throws become rejections). `fetch` with `cache:"force-cache"` (always prefer cache, even stale — freshness is guaranteed by the hash in the filename, L93-L96) and `Accept: font/woff2`. Throws on non-ok response (L102-L107), else returns `response.arrayBuffer()`. Performance note: force-cache avoids redundant revalidation requests.
  - `private getUnicodeRangeRegex()` — L114-L131. Parses `this.fontFace.unicodeRange` (comma-separated `U+xxxx[-yyyy]` tokens) into a single `RegExp` with the `u` (unicode) flag. Each token becomes `\u{start}-\u{end}` or `\u{start}` and they are concatenated inside one `[...]` character class (L118-L130). Uses `\u{...}` brace syntax precisely so multi-hex ranges (e.g. `U+1007F`) don't trigger "Invalid Unicode escape" (comment L115-L117). Returned regex is the gate used by `toCSS`.
  - `private static createUrls(uri: string): URL[] | DataURL[]` — L133-L170. URI dispatch: a `data`-prefixed uri returns `[uri]` as-is (skips expensive `URL` parsing of huge data strings, L134-L137); a `LOCAL_FONT_PROTOCOL` uri returns `[]` (system fonts have no fetchable url, L139-L142); an `http` uri returns `[new URL(uri)]` (L144-L147). Otherwise it's an asset path: strips leading slashes (L150), then for each entry in `window.EXCALIDRAW_ASSET_PATH` (string → one base, array → many) builds `new URL(assetUrl, normalizedBaseUrl)` (L153-L164), and always appends the `ASSETS_FALLBACK_URL` CDN url last (L167). Invariant: returned list is ordered primary→fallback, matching `getContent`'s iteration.
  - `private static getFormat(url: URL | DataURL)` — L172-L189. Returns `""` for non-`URL` (data urls don't need a format hint). For a `URL`, splits the pathname on `.` and returns `format('<lastExtension>')`, or `""` if there's no extension or parsing throws. Feeds the `src` string built in the constructor.
  - `private static normalizeBaseUrl(baseUrl: string)` — L191-L208. Normalizes a user-supplied asset base: if it's root-relative or `./`-relative (`/^\.?\//`), it strips the leading slashes/dot and resolves against `window.location.origin` to make it absolute (L197-L202); then guarantees exactly one trailing slash (L205) so `new URL(assetUrl, base)` concatenates correctly.

---

### packages/excalidraw/fonts/Excalifont/index.ts

Data-only module exporting the WOFF2 face descriptor table for "Excalifont" (the default hand-drawn family), split into 7 subsetted WOFF2 files by unicode range.

- `ExcalifontFontFaces: ExcalidrawFontFaceDescriptor[]` — L122-L160. Seven descriptors mapping hashed WOFF2 imports (`_0`.._6`, imported L3-L9 in deliberately scrambled order) to explicit `descriptors.unicodeRange` strings: `_0` = Latin + Latin-1 + punctuation/symbols (L126-L127), `_1` = Latin Extended (L133-L134), `_2` = Cyrillic core + numero sign (L137), `_3` = Greek (L141-L142), `_4` = diacritics/math/ligatures (L148-L149), `_5` = extended Cyrillic (L156), `_6` = combining grave/acute/tilde `U+300-301,U+303` (L159). Header comment (L11-L120) is `cn-font-split` provenance + full SIL OFL license. Pure data; no functions. Parity note: this is the app's default font, so its codepoint partitioning drives which subset files load for typical text.

---

### packages/excalidraw/fonts/Fonts.ts

The central font registry and loader: lazily registers all bundled/fallback families, loads only the font faces actually needed by scene text (concurrency-limited), inlines subsetted `@font-face` CSS for export, and invalidates/rerenders text shapes once real fonts replace fallbacks.

- `class Fonts` — L46-L465.
  - `public static readonly loadedFontsCache = new Set<string>()` — L49. Process-wide dedupe of already-processed font faces (keyed by a family-style-weight-unicodeRange signature), static to share across `Fonts` instances and cut memory.
  - `private static _registered` — L51-L59. Lazy map: `fontFamily(number) → { metadata, fontFaces[] }`. Undefined until first access.
  - `private static _initialized: boolean` — L61. Guards the host-app-registers-before-lazy-load merge path.
  - `public static get registered()` — L63-L77. Lazy accessor: if `_registered` is unset, runs `init()`; if set but `init` hasn't run (`!_initialized`), merges `init()`'s entries first and existing entries second so host-app pre-registered fonts are NOT overridden (L67-L74). Returns the map.
  - `public get registered()` — L79-L81. Instance proxy to the static getter.
  - `constructor(scene: Scene)` — L85-L87. Stores `this.scene` (the only per-instance state); all heavy logic is static.
  - `public getSceneFamilies = () =>` — L92-L94. Returns unique font families used by the scene's non-deleted elements (delegates to `getUniqueFamilies`).
  - `public onLoaded = (fontFaces: readonly FontFace[]): void =>` — L104-L146. Called after font faces load. Builds a `family-style-weight-unicodeRange` signature per face; if every face is already in `loadedFontsCache` it bails (L108-L122) — comment flags this can bail on a false positive since only a subset of props is hashed. Otherwise, for each non-deleted text element it deletes the `ShapeCache` entry, clears `charWidth` cache for that font string (so re-wrapping uses true metrics, not stale fallback metrics — L131-L135), and also invalidates the bound container's shape (L136-L139). Calls `this.scene.triggerUpdate()` if anything changed (L143-L145). This is the fix for issue #637 (text rendered with fallback before the real font arrives).
  - `public loadSceneFonts = async (): Promise<FontFace[]> =>` — L151-L158. Gathers scene families + chars-per-family and delegates to `loadFontFaces`.
  - `public static loadElementsFonts = async (elements): Promise<FontFace[]>` — L163-L170. Same as `loadSceneFonts` but for an explicit element array (used when there's no live scene, e.g. export).
  - `public static async generateFontFaceDeclarations(elements)` — L175-L210. Produces inlined `@font-face` CSS strings for export. Special-cases CJK: finds a family whose fallbacks include `CJK_HAND_DRAWN_FALLBACK_FONT`, and if its characters `containsCJK`, copies those chars under the CJK fallback family and `unshift`s the fallback family to the front of `families` (L182-L199) — order matters because fallbacks must be declared first/reversed so later faces override on shared codepoints (comment L195-L196). Then runs `fontFacesStylesGenerator` through a `PromisePool` with `concurrency = 3` (deliberately throttled to avoid hundreds of concurrent fetch+worker spawns and rate limits, L201-L206) and returns a de-duped array (L208-L209).
  - `private static async loadFontFaces(fontFamilies, charsPerFamily)` — L212-L235. Adds every registered non-`local` font face into `window.document.fonts` if absent (L217-L228; local fonts like Helvetica are skipped), then drives `fontFacesLoader` through a `PromisePool` with `concurrency = 10` (L231-L233) and returns the flattened, truthy-filtered face list.
  - `private static *fontFacesLoader(fontFamilies, charsPerFamily)` — L237-L271. Generator yielding load promises. For each family it builds a font string at `FONT_SIZES.sm` and the set of characters used; if `document.fonts.check(font, text)` is false it yields a `promiseTry` calling `document.fonts.load(font, text)` (returning `[index, fontFaces]`). Comments warn (L247, L254) that checking/loading WITH the `text` param is essential — without it the browser may report loaded while range-specific faces stay unloaded. Per-font failures are caught and logged so one bad CDN doesn't fail the batch (L259-L267).
  - `private static *fontFacesStylesGenerator(families, charsPerFamily)` — L273-L317. Generator yielding CSS-build promises. For each family it looks up registered `fontFaces`/`metadata`, skips with error if not found (L280-L286), skips `local` fonts (don't inline, L288-L291), and for each face yields a `promiseTry` calling `fontFace.toCSS(characters)`; on success it computes a stable ordering key `familyIndex * 10_000 + fontFaceIndex` (10K-face buffer per family, L303-L304) and yields `[order, css]`. The order tuple lets the caller sort declarations deterministically.
  - `private static register(this, family, metadata, ...fontFacesDecriptors)` — L326-L357. Resolves a string family name to its numeric id via `FONT_FAMILY` then `FONT_FAMILY_FALLBACKS` (L340-L342), and if not already registered, sets `registered[id] = { metadata, fontFaces: descriptors.map(d => new ExcalidrawFontFace(family, d.uri, d.descriptors)) }` (L346-L354). Uses an explicit polymorphic `this` type so it can run against either a `Fonts` or a bare `{registered}` object (used by `init`). Returns the registered map.
  - `private static init()` — L362-L403. One-time registration of all families. Builds a local `fonts = { registered: Map }`, defines a local `init(family, ...descriptors)` that resolves the numeric family, picks `FONT_METADATA[fontFamily]` defaulting to Excalifont's metrics (L378-L380), and calls `Fonts.register.call(fonts, ...)`. Registers Cascadia, Comic Shanns, Excalifont, Helvetica (local system font, kept for back-compat), Liberation Sans (server-side pdf/png export substitute for Helvetica), Lilita One, Nunito, Virgil, plus fallbacks Xiaolai (`CJK_HAND_DRAWN_FALLBACK_FONT`) and Emoji (`WINDOWS_EMOJI_FALLBACK_FONT`) — L385-L398. Sets `_initialized = true` (L400) and returns the map. Parity note: the default-to-Excalifont-metrics behavior means unknown families share Excalifont's text-measurement metrics.
  - `private static getUniqueFamilies(elements): Array<...>` — L408-L419. Reduces elements into a `Set<number>` of `fontFamily` ids for text elements only, returned as an array.
  - `private static getCharsPerFamily(elements): Record<number, Set<string>>` — L424-L445. Builds, per font-family id, the set of unique characters across all text elements' `originalText` (iterated char-by-char, L435-L441). Drives which codepoints get subsetted/loaded.
  - `private static getCharacters(charsPerFamily, family)` — L450-L457. Returns the characters for one family joined into a single string (`""` if none).
  - `private static getAllFamilies()` — L462-L464. Returns all registered family ids (`Array.from(registered.keys())`).
- `interface ExcalidrawFontFaceDescriptor` — L467-L470. `{ uri: string; descriptors?: FontFaceDescriptors }`. The shape every per-font `index.ts` table emits and that `ExcalidrawFontFace`/`register` consume.

---

### packages/excalidraw/fonts/Helvetica/index.ts

Data-only module declaring Helvetica as a system/local font (no downloadable asset), kept for backwards compatibility.

- `HelveticaFontFaces: ExcalidrawFontFaceDescriptor[]` — L5-L9. Single descriptor with `uri: LOCAL_FONT_PROTOCOL` (imported L1), so it resolves to the locally installed system font (Helvetica on macOS, Arial on Windows per `Fonts.ts` L388) and is never fetched or inlined. Pure data; no functions.
