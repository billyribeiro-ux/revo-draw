# Claude Code Build Prompt — Layout/Wireframe Desktop Tool ("LayoutForge")

> **How to use this prompt:** Paste the entire document into Claude Code at the root of an empty
> directory. Build top to bottom. Do not skip the Hard Rules or Acceptance Criteria. After the
> first full pass, expect to run a focused follow-up pass on §7 (Canvas Interaction) — that
> subsystem is the one most likely to need iteration.

---

## 0. What you are building

A **local-first, single-user desktop application** for macOS (via Tauri) that is a layout /
wireframe / dashboard-sketching tool — think Excalidraw or Miro, but constrained to **semantic UI
layout primitives** rather than freeform drawing, and far simpler to use.

The entire reason this tool exists: the user draws a dashboard / page / app layout on an infinite
canvas, tags each element with a **semantic component type and layout intent**, then **exports a
structured Markdown spec** that can be fed directly into Claude Code to generate the corresponding
SvelteKit 5 implementation. The export format is the heart of the product — treat §8 as the most
important section in this document.

Single user. The user's own machine. No auth, no cloud, no multi-tenant, no collaboration.

---

## 1. Pinned versions — DO NOT deviate, DO NOT "upgrade to latest" silently

These are pinned as of **May 30, 2026**. If the Tauri scaffold template pins older versions
(it commonly lags on Vite), **bump them to match this table** and verify the app still builds.

| Layer            | Package / Tool                          | Pinned version        |
|------------------|-----------------------------------------|-----------------------|
| Desktop shell    | Tauri (core, CLI, API)                  | `2.11.x`              |
| Tauri plugins    | `@tauri-apps/plugin-fs`                 | latest `2.x`          |
| Tauri plugins    | `@tauri-apps/plugin-sql`                | latest `2.x`          |
| Tauri plugins    | `@tauri-apps/plugin-dialog`             | latest `2.x`          |
| Framework        | `svelte`                                | `5.55.0`              |
| Framework        | `@sveltejs/kit`                         | `2.57.1`              |
| Adapter          | `@sveltejs/adapter-static`              | latest compatible     |
| Language         | `typescript`                            | `6.0.x` (strict)      |
| Build            | `vite`                                  | `8.0.14` (Rolldown)   |
| Vite/Svelte glue | `@sveltejs/vite-plugin-svelte`          | latest compatible     |
| Icons (build)    | `unplugin-icons`                        | latest                |
| Icon set         | `@iconify-json/ph` (Phosphor)           | latest                |
| Icon offline lib | `@iconify/utils`                        | latest                |
| Local index ORM  | `drizzle-orm`                           | latest                |
| Drizzle CLI      | `drizzle-kit`                           | latest                |
| Package manager  | **pnpm** (exclusively)                  | latest `10.x`/`11.x`  |

**Critical Vite 8 note:** Vite 8 uses Rolldown (Rust) as its single bundler, replacing the old
esbuild+Rollup setup. On first install, **verify `unplugin-icons` and the Tauri Vite integration
work under Rolldown.** They are widely used and were in Vite's pre-release CI, so this should be
fine — but confirm the build is clean before proceeding past §3. If a plugin is incompatible,
stop and report it rather than working around it.

---

## 2. Non-negotiable engineering standards (Hard Rules)

1. **TypeScript strict mode.** Zero `any`, zero `@ts-ignore`, zero type-safety shortcuts. No
   warnings, no errors, anywhere.
2. **Svelte 5 runes-only.** `$state`, `$derived`, `$effect`, `$props`. No legacy stores, no
   `export let`, no reactive `$:` labels.
3. **pnpm exclusively.** No npm, no yarn, no bun. All scripts assume pnpm.
4. **Complete, production-ready code.** No stubs, no `// TODO: implement`, no
   `// you can add more here`, no simplified examples. Every function fully implemented.
5. **Build for 10-year longevity.** No hacky workarounds. Architect for maintainability.
6. **Icons: Phosphor via `unplugin-icons` only.** Never Lucide. Build-time inlined SVG, no runtime
   CDN fetches (the app must work fully offline inside Tauri).
7. **adapter-static, `ssr = false`.** This is a Tauri SPA. No Node server in the bundle, no SSR.
8. **No external state library.** State lives in Svelte 5 runes inside `.svelte.ts` modules.
9. **The canvas is hand-rolled Canvas 2D.** Do NOT pull in Konva, Fabric, PixiJS, or any
   canvas/graphics library. The scene graph is your own code. (Tiny math helpers like a 2D matrix
   util are fine to write yourself; a `gl-matrix` dependency is acceptable if justified.)
10. **Conventional Commits** if you make commits.

---

## 3. Project scaffold & structure

Scaffold a Tauri 2.11 + SvelteKit 2.57.1 project with pnpm. Target macOS (`.app` / `.dmg` via
`tauri build`). Configure:

- `svelte.config.js` → `adapter-static`, `ssr = false` (via root `+layout.ts` exporting
  `export const ssr = false; export const prerender = true;`).
- `vite.config.ts` → SvelteKit plugin + `unplugin-icons` with `{ compiler: 'svelte' }`.
- `tsconfig.json` → strict, plus the SvelteKit-generated extends.
- Tauri config → app metadata, macOS bundle identifier `com.layoutforge.app`, window defaults
  (1440×900, min 1024×700, resizable), `fs`/`sql`/`dialog` plugin permissions scoped to an app
  data directory.

Target structure (adjust names sensibly, keep the separation of concerns):

```
src/
  lib/
    canvas/
      scene-graph.svelte.ts      # document model: elements, hierarchy, reactive state
      camera.svelte.ts           # pan/zoom transform matrix + viewport <-> world mapping
      renderer.ts                # Canvas 2D draw loop (pure: state in, pixels out)
      hit-test.ts                # point/marquee hit-testing against the scene graph
      geometry.ts                # 2D matrix, vec, bbox, rotation math
      snapping.ts                # alignment guides + snap resolution
    commands/
      history.svelte.ts          # undo/redo (command pattern OR immutable snapshots — see §7)
      commands.ts                # typed command definitions
    elements/
      types.ts                   # SemanticType enum, LayoutIntent, Element discriminated union
      defaults.ts                # default props per semantic type
    persistence/
      document-file.ts           # save/load .lfdoc JSON via Tauri fs + dialog
      library-db.ts              # Drizzle + tauri-plugin-sql: the document INDEX only
      schema.ts                  # Drizzle schema for the index DB
      migrations/                # forward-only Drizzle migrations
    export/
      to-markdown.ts             # THE export compiler — scene graph -> Claude-Code Markdown spec
    icons/
      offline-iconify.ts         # local Iconify set loading via @iconify/utils
    ui/
      Toolbar.svelte
      LeftPanel.svelte           # layers / element tree
      RightPanel.svelte          # properties / semantic-type + layout-intent inspector
      Canvas.svelte              # the <canvas> host + event wiring
      ...
  routes/
    +layout.ts                   # ssr=false, prerender=true
    +layout.svelte               # app shell
    +page.svelte                 # the editor
src-tauri/                       # Rust shell, plugin registration, capabilities
```

---

## 4. Data model — the element & document schema

Define in `src/lib/elements/types.ts`. This schema is the single source of truth and also what
gets serialized to disk and compiled to the export. Design it carefully.

```ts
// Public-facing IDs are UUID v7 strings. No raw integer PKs exposed in the document file.

export type ElementId = string; // uuid v7

export const SEMANTIC_TYPES = [
  'frame',        // a page/screen boundary or a sub-region container
  'container',    // generic layout container (maps to a div with layout intent)
  'card',
  'nav',          // top nav / app bar
  'sidebar',
  'button',
  'input',
  'text',         // heading or body text region
  'image',
  'table',        // data table region
  'chart',        // chart/graph region
  'list',
  'tabs',
  'modal',
  'icon',         // a placed Iconify icon (carries icon name + path data)
  'divider',
] as const;
export type SemanticType = (typeof SEMANTIC_TYPES)[number];

export type LayoutMode = 'flow' | 'flex-row' | 'flex-col' | 'grid' | 'absolute';
export type Align = 'start' | 'center' | 'end' | 'stretch' | 'space-between';

export interface LayoutIntent {
  mode: LayoutMode;
  gap?: number;            // px
  padding?: number;        // px (uniform; expand to per-side if needed)
  justify?: Align;
  align?: Align;
  gridCols?: number;       // when mode === 'grid'
  // responsive intent: how this region should behave at narrower widths
  responsive?: 'stack' | 'reflow' | 'hide' | 'scroll' | 'none';
  // fixed sizing hints that matter for layout (e.g. sidebar width)
  fixedWidth?: number;
  fixedHeight?: number;
}

export interface BaseElement {
  id: ElementId;
  type: SemanticType;
  parentId: ElementId | null;
  // geometry in WORLD coordinates
  x: number; y: number; width: number; height: number; rotation: number; // radians
  z: number;                 // stacking order within parent
  label?: string;            // human label, e.g. "Revenue card", surfaced in export
  layout?: LayoutIntent;     // present on containers/frames/etc.
  // style hints that matter to a layout spec (NOT a full design system)
  style?: {
    fill?: string;           // OKLCH string preferred
    stroke?: string;
    radius?: number;
    fontSize?: number;
    fontWeight?: number;
    opacity?: number;
  };
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  textRole?: 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label';
}

export interface IconElement extends BaseElement {
  type: 'icon';
  iconName: string;          // e.g. "ph:chart-bar" — so Claude Code can re-import it
  svgPath: string;           // raw path data, so it survives in the file & renders offline
}

// ...one interface per semantic type as needed; export a discriminated union:
export type Element = BaseElement | TextElement | IconElement /* | ... */;

export interface LayoutDocument {
  schemaVersion: 1;          // version from day one; never reuse a version number
  id: string;                // uuid v7
  name: string;
  createdAt: string;         // ISO 8601
  updatedAt: string;
  canvas: { width: number; height: number; background: string };
  elements: Record<ElementId, Element>;
  rootOrder: ElementId[];    // top-level element order
}
```

Implement it fully (every semantic type gets sensible fields). The document on disk is this object
serialized to JSON with extension **`.lfdoc`** (it's just versioned JSON).

---

## 5. Persistence

Two distinct stores. Do not conflate them.

**Document bodies → plain JSON files on disk.**
- `src/lib/persistence/document-file.ts`: save/open/save-as using `@tauri-apps/plugin-dialog`
  (native file pickers) + `@tauri-apps/plugin-fs`. Files use the `.lfdoc` extension.
- Also implement **import/export to other formats**, user-selectable:
  - Native `.lfdoc` (full fidelity, default).
  - `.json` (same payload, generic extension).
  - `.md` (the Claude-Code export — see §8).
  - `.svg` (walk the scene graph, emit SVG — best-effort visual snapshot).
  - `.png` (raster via `canvas.toBlob`).
- **Autosave** the active document to the app data dir on a debounced timer so a crash/quit never
  loses work. On launch, offer to restore the autosaved session.

**Library index → SQLite via `tauri-plugin-sql`, accessed through Drizzle.**
- `schema.ts`: a single `documents` index table — `id` (uuid v7), `name`, `file_path`,
  `thumbnail` (base64 PNG or path), `tags`, `created_at`, `updated_at`, `last_opened_at`.
- This DB stores **only metadata/index**, never document bodies.
- Migrations are **forward-only and immutable** under `migrations/`. Never edit a shipped
  migration; always add a new one.
- A "Library" / "Recent files" view in the UI reads from this index.

---

## 6. Rendering (Canvas 2D)

`renderer.ts` is a pure function of (document state + camera) → pixels. No DOM mutation outside the
single `<canvas>`. Requirements:

- **Infinite canvas** with pan (space-drag + trackpad) and zoom (pinch / ctrl-scroll), implemented
  via a camera transform matrix (`camera.svelte.ts`). World ↔ screen coordinate conversion lives
  there and is the only place that math happens.
- **Device-pixel-ratio aware.** Crisp on Retina. Re-rasterize text crisply across zoom levels.
- Draw each semantic type with a distinct, clean, **editorial** visual treatment (this is a design
  tool for a user with a strong post-print aesthetic — restrained, precise, not gamer/skeuomorphic).
- A **dot or line grid** in world space that scales with zoom.
- Render order respects `z` and parent/child hierarchy.
- 60fps with hundreds-to-low-thousands of elements. Only redraw on state/camera change (dirty flag),
  not a constant rAF loop.

---

## 7. Canvas interaction — the hard part (verify each criterion independently)

Implement all of the following. **Each bullet has an explicit acceptance criterion; treat them as a
checklist and confirm each one works before declaring this section done.**

- **Single select** — click an element selects it. *Accept:* clicking inside an element's bounds
  selects exactly the topmost element at that point.
- **Marquee select** — drag on empty canvas selects all intersecting elements. *Accept:* partial
  intersection selects; works at any zoom/pan.
- **Multi-select** — shift-click adds/removes. *Accept:* selection set updates correctly.
- **Move** — drag selection. *Accept:* moves in world space regardless of zoom; multi-select moves
  together.
- **Transform handles** — 8 resize handles + rotate handle on selection. *Accept:* resize respects
  the correct anchor; shift = aspect lock; rotation is around the selection center; handles stay
  correctly placed under any camera transform.
- **Snapping & alignment guides** — while moving/resizing, show smart guides for edge/center
  alignment to nearby elements and detect equal-spacing. *Accept:* guides appear, snapping engages
  within a px threshold, and can be bypassed by holding a modifier (e.g. alt). **This is the feature
  that makes the tool feel better than Miro — do not cut it.**
- **Nesting/grouping** — elements can be parented into containers/frames; moving a parent moves
  children. *Accept:* reparenting works via drag-into; child coords stay correct.
- **Z-order** — bring forward / send back. *Accept:* draw order and hit-test order both update.
- **Text editing** — double-click a text element opens an inline editor (overlay a positioned
  `<textarea>`/contenteditable transformed to match the element), commit back on blur/escape.
  *Accept:* editing position matches the element under zoom/pan; content round-trips.
- **Keyboard** — delete, duplicate (cmd/ctrl-D), copy/paste, arrow-nudge, undo/redo
  (cmd/ctrl-Z / shift-cmd/ctrl-Z), select-all, escape-to-deselect. *Accept:* all bound and working.
- **Undo/redo** — `history.svelte.ts`. Choose **immutable document snapshots with structural
  sharing** OR a **typed command pattern**; pick one, justify it in a comment, and apply it
  consistently. *Accept:* every mutating operation is undoable and redoable with no state corruption,
  including multi-step operations (e.g. a drag = one undo entry, not many).

If any criterion can't be met cleanly in this pass, **leave a clearly marked section in a
`KNOWN_GAPS.md` file** rather than shipping a silent half-implementation.

---

## 8. THE EXPORT COMPILER — `export/to-markdown.ts` (most important section)

This is why the tool exists. It compiles the scene graph into a **structured Markdown layout spec**
optimized to be pasted into Claude Code as a brief for generating a SvelteKit 5 implementation.

**It is NOT a visual description and NOT raw coordinates.** It is a semantic, hierarchical
description of intent. Coordinates are translated into layout relationships.

The compiler must:

1. **Walk the element hierarchy** (frames → containers → leaves), depth-first, preserving nesting.
2. **Translate geometry into layout intent**, not pixels. Infer/emit: flex direction, grid columns,
   gaps, alignment, fixed vs. fluid sizing, and relative ordering. Use each element's explicit
   `LayoutIntent` where present; infer sensible defaults from geometry where absent (e.g. children
   in a horizontal row → `flex-row`).
3. **Emit semantic roles**, using each element's `SemanticType` and `label` (e.g. "Sidebar (fixed,
   240px, left)", "Card: Revenue", "DataTable").
4. **Emit responsive intent** per region from `LayoutIntent.responsive`.
5. **Preserve icon identity** — for `icon` elements, emit the Iconify name (e.g. `ph:chart-bar`) so
   Claude Code re-imports the exact icon, not a vague description.
6. **End with an explicit, deterministic instruction block** telling Claude Code to implement the
   layout in **SvelteKit 2 + Svelte 5 runes-only, TypeScript strict, Phosphor icons via
   unplugin-icons, semantic HTML, CSS with logical properties / `@layer` / OKLCH tokens, native CSS
   nesting**, and to honor the responsive intents.

**Determinism is mandatory:** the same document always produces byte-identical Markdown. Stable
ordering, no timestamps in the body, no random IDs in the output.

Target output shape (illustrative — design the real thing to be clean and unambiguous):

```md
# Layout Spec: <Document Name>

## Screen: Dashboard (1440×900)
Layout: grid, 2 columns (sidebar + main), gap 0.

### Sidebar  — container, fixed width 240px, left, full height
Layout: flex-col, gap 8, padding 16. Responsive: stays fixed (no stack).
- Nav (vertical)
  - Button: "Overview"  [icon: ph:house]
  - Button: "Reports"   [icon: ph:chart-bar]
  - Button: "Settings"  [icon: ph:gear]

### Main — container, fluid, fills remaining width
Layout: flex-col, gap 24, padding 32. Responsive: reflow.
- Header — flex-row, justify space-between, align center
  - Text (h1): "Dashboard"
  - Button: "Export"  [icon: ph:export]
- Stats row — flex-row, gap 16. Responsive: stack on narrow.
  - Card: "Revenue"  (flex 1)
  - Card: "Users"    (flex 1)
  - Card: "Churn"    (flex 1)
- Chart region — card, fills width, min-height 320
  - Chart: line

---

## Implementation instructions for Claude Code
Implement this layout as a SvelteKit 2 + Svelte 5 (runes-only) page.
- TypeScript strict. pnpm. Phosphor icons via unplugin-icons (`~icons/ph/...`). Never Lucide.
- Semantic HTML. CSS with `@layer`, logical properties, native nesting, OKLCH tokens.
- Honor every "Responsive:" directive above.
- Components: extract on reuse/coherence, not line count.
- No placeholder code — full implementations.
```

Write a **unit test** for the compiler: a fixture document → expected Markdown, asserting
byte-stable output.

---

## 9. UI shell

- **Top toolbar**: tool selection (select, frame, container, card, text, button, input, table,
  chart, image, icon, divider), with Phosphor icons; active tool shown via Phosphor weight (e.g.
  `bold`/`fill` = active). Undo/redo. Zoom controls + zoom-to-fit.
- **Left panel**: layer/element tree reflecting the hierarchy; click to select, drag to reparent.
- **Right panel (inspector)**: edit the selected element's **semantic type, label, layout intent
  (mode/gap/padding/justify/align/grid cols/responsive), fixed sizing, and style hints**. This panel
  is how the user enriches elements so the export is high quality.
- **Icon picker**: searchable, browsing a **locally bundled** Phosphor Iconify JSON set via
  `@iconify/utils` (offline — no network). Placing an icon stores `iconName` + `svgPath` on the
  element.
- **File menu**: New, Open, Save, Save As, Import, Export (with format submenu), plus a Library /
  Recent view backed by the index DB.
- Clean, restrained, editorial styling. OKLCH tokens, `@layer` cascade, logical properties.

---

## 10. Acceptance criteria (whole app)

Before declaring done, verify:

- [ ] `pnpm install` clean; `pnpm tauri dev` launches the macOS app; `pnpm tauri build` produces a
      `.dmg`.
- [ ] All pinned versions from §1 are actually installed (check the lockfile); Vite 8/Rolldown build
      is clean with `unplugin-icons` working.
- [ ] `pnpm check` (svelte-check) and `tsc` report **zero** errors/warnings under strict mode.
- [ ] Every §7 interaction criterion passes, or is documented in `KNOWN_GAPS.md`.
- [ ] Draw a 2-column dashboard, tag semantics, **export to Markdown**, and confirm the spec is
      clean, hierarchical, semantic, deterministic, and would produce good SvelteKit from Claude Code.
- [ ] Save → quit → relaunch → open: document round-trips losslessly. Autosave restore works.
- [ ] Import/export across `.lfdoc` / `.json` / `.md` / `.svg` / `.png` all function.
- [ ] App works fully offline (no network calls anywhere, including icons).

---

## 11. Output discipline

- Deliver complete, working code for every file. No stubs or placeholders.
- If a pinned dependency is genuinely incompatible under Vite 8/Rolldown, **stop and report it**
  with the exact error — do not silently swap it for something else.
- Keep a running `CLAUDE.md` at the repo root documenting stack, pinned versions, repo map,
  commands, hard rules, the export-format contract, and session hygiene.
- Conventional Commits if committing.

Build it.


12. Post-build verification pass (run AFTER the first full build)
Once the app builds and the §10 acceptance criteria are attempted, perform a deliberate
verification pass. Web search is required for this section — your training data is stale on
several pinned dependencies, so do not rely on memory for any version-specific API. The pinned
version table in §1 is correct as of May 30, 2026; treat it as authoritative.
12.1 What to verify (search official sources)
For each item below, consult the official documentation / changelog / release notes (not blog
aggregators or Q&A sites) and confirm the code you wrote uses APIs that actually exist at the
pinned version:

Vite 8.0.14 / Rolldown — confirm vite.config.ts, plugin ordering, and any build options you
used are valid under the Rolldown bundler. Verify unplugin-icons and the Tauri Vite integration
are Rolldown-compatible; if either needs a Rolldown-specific config, apply it.
Svelte 5.55.0 — confirm every rune usage ($state, $derived, $effect, $props,
$state.raw, $derived.by) matches current semantics. Confirm no deprecated-in-5.55 patterns.
SvelteKit 2.57.1 — confirm adapter-static config, ssr/prerender flags, and any
$app/* imports are current. (Note 2.57.1 included a security patch over 2.56/2.57 — make sure
nothing you wrote depends on the patched-out behavior.)
Tauri 2.11 — confirm the capabilities/permissions JSON shape, plugin registration in
src-tauri, and the JS API imports for plugin-fs, plugin-sql, and plugin-dialog match the
current 2.x API. Tauri's permission model is the area most likely to have drifted from your
priors — verify it explicitly.
drizzle-orm + drizzle-kit (SQLite driver) — confirm the schema syntax, the tauri-plugin-sql
driver wiring, and the migration generation/apply flow are current.
TypeScript 6.0 — confirm no syntax or compiler-option you used was changed/removed in 6.0.

12.2 Reconciliation rule (when sources conflict)

On version numbers: the §1 table wins. Do not "upgrade to latest" beyond the pins. If a pin
is genuinely broken (yanked, security-critical), stop and report it with the evidence — do not
silently change it.
On API shape at a given version: the official current docs win over your training priors and
over this prompt's illustrative code snippets (the snippets in §4–§8 are shape guidance, not
verified API). Fix the code to match real current APIs.
Cite the source (URL) in a comment or in KNOWN_GAPS.md for any non-obvious correction you make.

12.3 Then fill genuine gaps
After API reconciliation, address anything in KNOWN_GAPS.md and any §10 criterion that failed —
search for current best-practice implementations where the gap is factual (correct config, correct
API usage, correct migration pattern).
12.4 What web search will NOT fix — flag these for the user instead
Be honest about the limits of this pass. Search reliably closes factual/API gaps. It does
not close interaction-quality gaps, which require running and using the app. Do not claim
these are "fixed" by searching. Instead, after the verification pass, produce a short
NEEDS_HUMAN_TESTING.md listing the things only hands-on use can validate, specifically:

Whether a drag/resize produces exactly one undo entry (coalescing), not many.
Whether snapping/alignment guides feel correct and don't flicker/jitter across zoom levels.
Whether hit-testing picks the intended element in dense/overlapping/nested layouts.
Whether text-edit overlay alignment holds under arbitrary pan/zoom/rotation.
Whether 60fps holds at the upper element counts.
Whether the exported Markdown actually produces good SvelteKit when fed back into Claude Code
(the real end-to-end test of the product).

State plainly that these require the user to exercise the app, and that you have verified
correctness of code/APIs but not the subjective feel of the interactions.
12.5 Final report
Conclude with a concise report: which APIs you corrected and why (with source URLs), which pins you
confirmed current, what remains in KNOWN_GAPS.md, and what's in NEEDS_HUMAN_TESTING.md. No
"this is just a starting point" hedging — state concretely what is verified-correct, what is
untested-but-built, and what is genuinely missing.
