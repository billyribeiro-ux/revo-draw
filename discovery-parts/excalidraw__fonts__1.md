## Cluster: excalidraw__fonts__1

This cluster contains the package barrel re-export for the fonts subsystem plus five per-font-family "registration" modules. Each per-font module is **data-only**: it imports one or more `.woff2` binary assets (resolved by the bundler to URL strings) and exports a typed array of `ExcalidrawFontFaceDescriptor` objects. There are **no functions, classes, hooks, or React components** in this cluster — every file is either a pure re-export or a `const` data declaration. The `ExcalidrawFontFaceDescriptor` type itself (and the `Fonts` runtime that consumes these arrays) lives in the sibling cluster `excalidraw__fonts__0` (`fonts/Fonts.ts`), so it is only referenced here, not defined.

The descriptor arrays are the registration surface a parity reimplementation must replicate: the **order** of entries, the **`unicodeRange`** (subsetting) per entry, and any per-entry `weight` matter for which `.woff2` chunk the browser fetches for a given codepoint. For Latin/CJK families, each array element corresponds to one woff2 subset file plus the CSS `unicode-range`/`font-weight` descriptors that the `FontFace` API will be constructed with downstream.

---

### packages/excalidraw/fonts/index.ts

Purpose: Package barrel that re-exports the entire fonts runtime (the `Fonts.ts` module) so callers import from `fonts/` rather than `fonts/Fonts`.

- **Re-export only.** L1: `export * from "./Fonts";`. Contains no declarations of its own. It surfaces everything `Fonts.ts` exports (the `Fonts` class/runtime, the `ExcalidrawFontFaceDescriptor` type, font registries, etc.) under the `fonts` directory's public name. No functions, constants, or types are defined here.

---

### packages/excalidraw/fonts/Liberation/index.ts

Purpose: Registers the Liberation Sans (Helvetica-metric-compatible) font as a single, unsubsetted woff2 face.

- **`LiberationFontFaces: ExcalidrawFontFaceDescriptor[]`** (constant) — L5-L9. A one-element array whose single entry has `uri: LiberationSansRegular` (the imported `LiberationSans-Regular.woff2` URL, L3) and **no `descriptors`** — meaning no `unicodeRange` subsetting and default weight. This is the simplest registration shape: one file covers the whole repertoire. Type imported at L1 (`import { type ExcalidrawFontFaceDescriptor } from "../Fonts"`). No side effects beyond the static woff2 import; the array is consumed by `Fonts.ts` to construct a `FontFace`.

---

### packages/excalidraw/fonts/Lilita/index.ts

Purpose: Registers the Lilita One display font as two Latin subsets (base Latin + Latin Extended) using Google Fonts' standard unicode ranges.

- **`LilitaFontFaces: ExcalidrawFontFaceDescriptor[]`** (constant) — L8-L17. Two-element array. Element 0 (`uri: LilitaLatinExt`, L10-L12) carries `descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT }`; element 1 (`uri: LilitaLatin`, L13-L16) carries `descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN }`. `GOOGLE_FONTS_RANGES` is imported from `@excalidraw/common` (L1). 
- Notable detail: ordering puts Latin-Ext **before** Latin. Because each face declares an explicit `unicode-range`, the browser only downloads the subset whose range contains the rendered codepoint, so the ordering here is registration order, not a precedence fallback. The two woff2 filenames are Google-Fonts content-hashed (L5-L6).

---

### packages/excalidraw/fonts/Nunito/index.ts

Purpose: Registers the Nunito font at weight 500 across five unicode subsets (Cyrillic, Cyrillic-Ext, Vietnamese, Latin-Ext, Latin).

- **`NunitoFontFaces: ExcalidrawFontFaceDescriptor[]`** (constant) — L11-L38. Five-element array; **every** entry sets `weight: "500"` in its `descriptors` alongside a `unicodeRange` drawn from `GOOGLE_FONTS_RANGES` (imported L1). Mapping of entry → range:
  - L12-L18: `CyrilicExt` → `GOOGLE_FONTS_RANGES.CYRILIC_EXT`, weight 500.
  - L19-L22: `Cyrilic` → `GOOGLE_FONTS_RANGES.CYRILIC`, weight 500.
  - L23-L29: `Vietnamese` → `GOOGLE_FONTS_RANGES.VIETNAMESE`, weight 500.
  - L30-L33: `LatinExt` → `GOOGLE_FONTS_RANGES.LATIN_EXT`, weight 500.
  - L34-L37: `Latin` → `GOOGLE_FONTS_RANGES.LATIN`, weight 500.
- Notable detail: the `weight: "500"` on each descriptor is the key parity invariant — Nunito is registered specifically at medium weight, not the default 400. The five woff2 filenames (L5-L9) are Google-Fonts content-hashed and differ only in the final hash segment (one source file per subset). Ordering is Cyrillic-Ext → Cyrillic → Vietnamese → Latin-Ext → Latin.

---

### packages/excalidraw/fonts/Virgil/index.ts

Purpose: Registers Excalidraw's classic hand-drawn "Virgil" font as a single unsubsetted woff2 face (the legacy default sketch font).

- **`VirgilFontFaces: ExcalidrawFontFaceDescriptor[]`** (constant) — L5-L9. One-element array; entry has `uri: Virgil` (the imported `Virgil-Regular.woff2`, L3) with **no `descriptors`** (no `unicodeRange`, default weight). Structurally identical to the Liberation registration. Type imported at L1. No side effects beyond the static woff2 import.

---

### packages/excalidraw/fonts/Xiaolai/index.ts

Purpose: Registers the Xiaolai SC Chinese (CJK) handwriting font, split into **209 separately-downloadable woff2 subsets** (indices `_0`..`_208`), each scoped to a precise `unicodeRange`, so a page only fetches the few subset chunks needed for the CJK glyphs it actually renders.

- **`XiaolaiFontFaces: ExcalidrawFontFaceDescriptor[]`** (constant) — L242-L1324. A large array; each element is `{ uri: _N, descriptors: { unicodeRange: "<range list>" } }`. The 209 woff2 assets are statically imported at L6-L214 (note the imports are **not** in numeric order — e.g. `_80` is the first import line at L6 — but the array body at L243+ is ordered by intended subset index `_0, _1, _2, …`). The type is imported at L4.
- Subsetting / coverage detail (the parity-critical part):
  - `unicodeRange` strings are comma-separated CSS unicode-range tokens, e.g. L246-L247 `"U+f9b8-fa6d,U+fe32,U+fe45-fe4f,U+ff02-ff0b,U+ff0d-ff1e,U+ff20-ff2a"` (CJK compatibility ideographs + fullwidth/halfwidth forms), and very large ranges further down such as the dense codepoint lists at L1300 and L1314/L1321 enumerating hundreds of individual CJK codepoints.
  - Entries cover Hangul syllable blocks (e.g. L300-L312 ranges like `U+11fb-11ff`, `U+ad2d-ae01`), CJK Unified Ideographs, compatibility ideographs (`U+f900-f9b7`, L257), and enclosed/fullwidth symbol ranges (`U+20dd-20de,U+25ef`, L254).
  - No `weight` is set on any entry — Xiaolai is registered at default weight; the only descriptor is `unicodeRange`.
- Provenance / non-obvious notes (from the header comments):
  - L1-L2: generated via chinese-font.netlify.app online-split, then hand-rewritten from `@font-face` rules into TS leveraging the FontFace API.
  - L216-L233: a generator banner from `cn-font-split@5.2.2` recording the origin font metadata (family "Xiaolai SC" / 小賴字體 SC, version 3.11, SIL OFL license).
  - L235-L240: a documented modification note — the original font was altered by (a) removing non-CJK codepoints, (b) reducing Hangul side-bearings to 40%, and (c) re-centering improperly-centered CJK codepoints. These metric changes (side-bearing reduction, centering) are advance-width/positioning modifications baked into the woff2 binaries themselves, so a Canvas reimplementation that ships the same woff2 files inherits them automatically; one that re-subsets from an unmodified Xiaolai source would get different CJK spacing.
- Performance detail: the 209-way split is purely a network/lazy-load optimization. Because each `FontFace` declares a disjoint `unicode-range`, the browser defers fetching any given subset woff2 until a glyph in that range is laid out — critical for a multi-megabyte CJK font. A parity implementation must preserve both the per-subset `unicode-range` boundaries and the file-to-range mapping, or it will either over-fetch (one giant font) or render tofu for codepoints whose subset never loads.
