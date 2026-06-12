# LayoutForge — project guide for Claude Code

A local-first, single-user macOS desktop app (Tauri) for sketching semantic UI layouts on an
infinite canvas and **exporting a structured Markdown spec** that briefs Claude Code to generate
a SvelteKit 5 implementation. The export compiler (`src/lib/export/to-markdown.ts`) is the heart
of the product.

No auth, no cloud, no collaboration. The user's own machine.

## Stack & pinned versions (as of 2026-05-30 — do NOT silently upgrade)

| Layer | Package | Version |
|-------|---------|---------|
| Desktop shell | Tauri (core/CLI/api) | `2.11.x` (cli 2.11.2, api 2.11.0) |
| Tauri plugins | plugin-fs / plugin-sql / plugin-dialog | 2.5.1 / 2.4.0 / 2.7.1 |
| Framework | svelte | `5.55.0` |
| Framework | @sveltejs/kit | `2.57.1` |
| Adapter | @sveltejs/adapter-static | 3.0.10 |
| Vite/Svelte glue | @sveltejs/vite-plugin-svelte | 7.1.2 (v7 = Vite 8 support) |
| Language | typescript | `6.0.3` (strict) |
| Build | vite | `8.0.14` (Rolldown bundler) |
| Icons (build) | unplugin-icons | 23.0.1 |
| Icon set | @iconify-json/ph (Phosphor) | 1.2.2 |
| Icon offline lib | @iconify/utils | 3.1.3 |
| Local index ORM | drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 |
| Tests | vitest | 4.1.7 (4.x = Vite 8 support) |
| Package manager | **pnpm** | 11.6.0 |

Vitest is pinned to 4.x and vite-plugin-svelte to 7.x because the §1 pins (Vite 8) require those
majors; vitest 3 / vps ≤6 do not support Vite 8. These are the only "free" version choices and
they are the minimum compatible with the hard pins.

## Commands

```sh
pnpm install            # install (workspace-root shadowing is configured — see Gotchas)
pnpm dev                # Vite dev server (http://localhost:1420)
pnpm tauri dev          # launch the macOS app window (runs pnpm dev as beforeDevCommand)
pnpm tauri build        # produce .app / .dmg
pnpm check              # svelte-kit sync + svelte-check (strict) — must be 0/0
pnpm test               # both vitest suites (pure + rune-bearing)
pnpm test:pure          # node-env tests (export compiler, geometry) — vitest.config.ts
pnpm test:runes         # rune-bearing tests (history/scene integrity) — vitest-svelte.config.ts
pnpm db:generate        # drizzle-kit generate (library index migrations)
```

Two vitest configs exist because rune-bearing modules (`.svelte.ts`) need the Svelte compiler to
define `$state`/`$derived`/`$effect`. `vitest.config.ts` runs plain-node tests and **excludes**
`*.svelte.test.ts`; `vitest-svelte.config.ts` runs `*.svelte.test.ts` through the Svelte plugin.
Any module that uses a rune MUST be a `.svelte.ts` file (e.g. `commands.svelte.ts`).
```

## Repo map

```
src/lib/
  canvas/
    geometry.ts            2D matrix/vec/bbox/rotation math (hand-rolled, no graphics lib)
    camera.svelte.ts       pan/zoom transform; ONLY place world<->screen math happens
    scene-graph.svelte.ts  reactive document model + selection + raw mutations (singleton `scene`)
    renderer.ts            pure (document + camera + overlay) -> Canvas 2D pixels; DPR-aware
    hit-test.ts            point/marquee/handle hit-testing (world space)
    snapping.ts            alignment guides + equal-spacing snap resolution
    editor.svelte.ts       the controller: tool, drag/resize/rotate/marquee state, gestures
  commands/
    history.svelte.ts      undo/redo — immutable snapshots + structural sharing; gesture coalescing
    commands.ts            typed user-facing operations (all wrapped in one history transaction)
  elements/
    types.ts               SemanticType, LayoutIntent, Element discriminated union, LayoutDocument
    defaults.ts            createElement() factory + per-type defaults; createBlankDocument()
    uuid.ts                UUID v7 (hand-rolled, crypto.getRandomValues; no deps)
  persistence/
    document-file.ts       save/open/export (.lfdoc/.json/.md/.svg/.png) + Autosave
    library-db.ts          SQLite index via tauri-plugin-sql (metadata only, never bodies)
    schema.ts              Drizzle schema for the documents index table
    migrations/            forward-only, immutable SQL (mirrors src-tauri/src/lib.rs migration v1)
  export/
    to-markdown.ts         THE export compiler (semantic, hierarchical, deterministic)
    to-markdown.test.ts    byte-stable determinism test (fixture -> expected)
    to-svg.ts              best-effort visual SVG snapshot
    to-png.ts              raster export + library thumbnail (offscreen render)
  icons/
    offline-iconify.ts     lazy-loaded bundled Phosphor set (offline; its own chunk)
  ui/
    Toolbar / LeftPanel / RightPanel / Canvas / FileMenu / IconPicker / LibraryView / PhIcon
src/routes/
  +layout.ts               ssr=false, prerender=true (Tauri SPA)
  +layout.svelte           app shell + global CSS
  +page.svelte             the editor (wires controller, keyboard, file ops)
src-tauri/                  Rust shell: lib.rs (plugin registration + SQL migrations), capabilities
```

## Hard rules (enforced)

1. TypeScript strict, zero `any` / `@ts-ignore`. `pnpm check` and `tsc` report 0 errors/0 warnings.
2. Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`). No stores, `export let`, or `$:`.
3. pnpm exclusively.
4. Complete code — no stubs/TODOs.
5. Icons: Phosphor via unplugin-icons only (never Lucide). Build-time inlined; offline.
6. adapter-static, `ssr = false`. Tauri SPA, no SSR.
7. No external state library — runes in `.svelte.ts` modules.
8. Canvas is hand-rolled Canvas 2D — no Konva/Fabric/Pixi.

## Export-format contract (`to-markdown.ts`)

- Walks the hierarchy depth-first (frames → containers → leaves), preserving nesting.
- Translates geometry into layout **intent** (flex direction, grid columns, gap, alignment, fixed
  vs. fluid sizing, relative order) — never raw pixels. Uses explicit `LayoutIntent` where present,
  infers from geometry where absent.
- Emits semantic roles from `SemanticType` + `label`; emits per-region `Responsive:` directives.
- Preserves icon identity (`ph:<name>`) so Claude Code re-imports the exact icon.
- Ends with a deterministic instruction block (SvelteKit 2 + Svelte 5 runes, TS strict, Phosphor
  via unplugin-icons, semantic HTML, `@layer`/logical-props/native-nesting/OKLCH).
- **Determinism is mandatory**: stable geometric ordering, no timestamps/ids/random in the body,
  rounded numbers, normalized blank lines + single trailing newline. Asserted by the unit test.

## Gotchas / session hygiene

- **pnpm workspace shadowing:** a `~/pnpm-workspace.yaml` exists in `$HOME`; without the
  project-local `pnpm-workspace.yaml` (declaring `packages: ['.']`), pnpm treats the home dir as
  the workspace root and `install` no-ops here. The local file also sets `allowBuilds: { esbuild:
  false }` (esbuild arrives transitively but is unused under Rolldown) and `verifyDepsBeforeRun:
  false` (so `tauri dev`'s `beforeDevCommand` doesn't trip the deps-build gate).
- **Migrations are forward-only and immutable.** Never edit a shipped migration; add a new one and
  bump the version in both `src-tauri/src/lib.rs` and `src/lib/persistence/migrations/`.
- **The library DB stores only metadata.** Document bodies are `.lfdoc` JSON files on disk.
- **Geometry is world-space everywhere.** Children are not stored relative to parents; reparenting
  preserves world position. Camera is the single conversion point.
- After editing any `.svelte` file, run `pnpm check` — it must stay 0/0.

See `KNOWN_GAPS.md` and `NEEDS_HUMAN_TESTING.md` for scope boundaries and what needs hands-on use.
