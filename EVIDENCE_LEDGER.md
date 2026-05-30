# Evidence Ledger (§14 mandate + geometry.md + browser/Excalidraw passes)

Every row is backed by command/test output that was actually run and pasted into the session.
"NOT VERIFIED (by automated test)" is used honestly where an automated check is impossible in this
environment; those items carry the manual steps in `NEEDS_HUMAN_TESTING.md`.

## §14.1 Build & type safety

| Claim | Command | Result | Status |
|---|---|---|---|
| Install clean | `pnpm install` | exit 0, "Already up to date" | VERIFIED |
| Zero type errors | `pnpm exec tsc --noEmit` | exit 0, 0 lines output | VERIFIED |
| svelte-check 0/0 | `pnpm run check` | `COMPLETED … 0 ERRORS 0 WARNINGS` (736 files) | VERIFIED |
| Build runs on Vite 8/Rolldown | `pnpm build` | exit 0; header `vite v8.0.14`; `rolldown` dep 1.0.2; `build.rolldownOptions` hint | VERIFIED |
| Pins match §1 | versions printed from node_modules + Cargo.lock | svelte 5.55.0, kit 2.57.1, vite 8.0.14, typescript 6.0.3, vps 7.1.2, adapter-static 3.0.10, unplugin-icons 23.0.1, @iconify-json/ph 1.2.2, @iconify/utils 3.1.3, drizzle-orm 0.45.2, drizzle-kit 0.31.10, tauri(crate) 2.11.2, cli 2.11.2, api 2.11.0, plugin-fs 2.5.1, plugin-sql 2.4.0, plugin-dialog 2.7.1 | VERIFIED (all rows match) |

## §14.2 Export compiler — determinism & realism

| Claim | Evidence | Status |
|---|---|---|
| Determinism unit test passes | `vitest … to-markdown.test.ts` → 14 passed | VERIFIED |
| Determinism independent of harness | two process runs → identical SHA-256 (`c977…9002`), empty `diff` | VERIFIED |
| Realism (no layout ambiguity) | full export pasted; audited claim-by-claim; **2 defects found & fixed in the compiler**: (A) nested-container `_Layout:_` lines dropped the responsive directive; (B) flex children emitted no grow/sizing intent. Re-exported: every region & leaf now emits direction, gap, padding, justify/align, responsive, main-axis sizing (`flex 1`/`fixed Npx`/`hug`/`fills`), cross-axis stretch. | VERIFIED — 0 remaining structural ambiguities |

## §14.3 Undo/redo + data integrity

| Claim | Evidence | Status |
|---|---|---|
| ≥500-op fuzz, multi-seed, do/undo/redo deep-equals | `fuzz.svelte.test.ts`: seeds 1/7/42/1337/90210, 500 ops each, ~990 assertions each, all PASS | VERIFIED |
| One undo entry per gesture | drag/resize/rotate/multi-move/text-edit each assert stack delta == 1 and single undo reverts | VERIFIED |
| Interrupt safety | cancelled gesture reverts state, stack delta == 0 | VERIFIED |
| Defects exposed & fixed | (1) the fuzz exposed that a stale baseline could mis-restore; history was rewritten to full deep-clone snapshots + `begin()` re-captures the baseline from the live scene. (2) structural sharing removed (could alias a stale element). | VERIFIED |

## §14.4 Persistence integrity

| Claim | Evidence | Status |
|---|---|---|
| Atomic write (temp→rename) | `persistence.test.ts`: target ends with NEW, temp gone | VERIFIED |
| Crash during rename keeps prior file | injected rename-failure → prior file byte-intact & parseable | VERIFIED |
| Rename-onto-existing fallback safe | backup-then-promote path keeps target present | VERIFIED |
| Defect exposed & fixed | old remove-then-rename fallback could destroy the good file if the rename then failed; replaced with backup-protected promote that restores on failure | VERIFIED |
| Validated load (a valid / b bad-version / c malformed) | all three asserted; bad/malformed rejected without throwing | VERIFIED |
| Lossless round-trip | complex doc (4 levels, rotated, icon, all types) save→load `toEqual`; re-serialize byte-identical | VERIFIED |

## §14.5 Performance

| Claim | Evidence | Status |
|---|---|---|
| Render hot-path frame time | Apple M5; 1440×900; `scripts/perf.mjs`: 1000 elems avg 0.70ms / worst 1.74ms; 2000 elems avg 1.19ms / worst 1.51ms (budget 16.7ms) | VERIFIED (JS compute) |
| GPU rasterization cost | cannot measure headlessly (no real canvas/Screen-Recording) | NOT VERIFIED → NEEDS_HUMAN_TESTING |
| Idle = zero redraws | static proof: NO `requestAnimationFrame`/`setInterval` in canvas/render path; repaint is a Svelte `$effect` over reactive state only | VERIFIED (static); runtime paint-count → NEEDS_HUMAN_TESTING |

## §14.6 macOS bundle + offline

| Claim | Evidence | Status |
|---|---|---|
| `.app` + `.dmg` emitted | `pnpm tauri build` → `LayoutForge.app` (13M) + `LayoutForge_0.1.0_aarch64.dmg` (≈5.4M). (One run failed at `bundle_dmg.sh` due to a stale mounted `rw.*.dmg` volume; detaching it fixed it — `hdiutil` contention, not a code issue.) | VERIFIED |
| Offline (no runtime network) | grep of built client bundle: no `iconify.design`/CDN hosts; only `fetch(` is SvelteKit's internal `window.fetch` (unused in this static SPA); only URL is Svelte's error-message string `https://svelte.dev/e/…`. Our source: zero `fetch(`. Icons build-time inlined. | VERIFIED |
| Signing/notarization | config fact: unsigned local `.app` runs via right-click→Open; distribution needs full Xcode + Apple Developer cert | NOTED (not executed) |

## geometry.md — coordinate-system diagnostic

| Claim | Evidence | Status |
|---|---|---|
| transform round-trip | `geometry-contract.svelte.test.ts`: `screenToWorld(worldToScreen(p))≈p` and inverse, 42 points × 6 camera states (zoom 0.05–8, large pans), <1e-6 | VERIFIED |
| click locates element | element center → `worldToScreen` → hit-test returns that element, all camera states | VERIFIED |
| create lands where you click | tool create at screen point → element centered on click world point | VERIFIED |
| pan/zoom mutates no element | panning/zooming changes no stored x/y/w/h | VERIFIED |
| **ROOT CAUSE** | two bugs, both fixed: (1) `history.begin()` did not re-capture the baseline, so a click that started+cancelled a move restored a stale baseline that **predated the element → element vanished** ("won't draw where I click"); fix: `begin()` re-snapshots the live scene. (2) `zoomToFit()` ran in a page mount effect **before** the ResizeObserver set a real viewport → fit divided by a 1×1 viewport → camera pan/zoom garbage ("X/Y always negative, everything off"); fix: the initial fit now runs from Canvas once the viewport is real. | VERIFIED |

## Browser parity (runs in browser AND Tauri)

| Claim | Evidence | Status |
|---|---|---|
| Boots in a real browser | headless Chrome DOM dump: 1 `<canvas>`, tool rail, titlebar, inspector present; 0 crash/error text; console capture: no `Uncaught`/`TypeError`/tauri errors | VERIFIED |
| Draw-at-click works in browser | CDP driver dispatches a real mouse click on the canvas → card created with center exactly at click world point (`dx=0.00 dy=0.00`) | VERIFIED |
| Full drag-create + drag-move loop (Excalidraw-style) | `scripts/browser-interact.mjs` via CDP real mouse drag: drag (200,150)→(440,310) created a card at exactly (200,150) size 240×160; then drag-moving it +120,+60 landed it at exactly (320,210). `RESULT: PASS` | VERIFIED |
| Tauri-only APIs degrade gracefully | `isTauri()` guards on fs/sql; browser Save/Export → download, Open → file input | VERIFIED (build + boot) |

## Excalidraw parity (mechanics matched against /Users/billyribeiro/Downloads/excalidraw-master)

Extracted Excalidraw's exact coordinate + interaction logic (Explore subagent, with file:line) and
reconciled ours:
- viewport↔scene conversion: Excalidraw `(' clientX-offset)/zoom - scroll`; ours `screen = world*zoom + pan` with the camera as the single conversion point — algebraically equivalent, round-trip proven <1e-6.
- DPR kept strictly at the canvas context scale, never in scene math — same in ours (`render()` applies `dpr * worldToScreen`).
- drag-to-size with negative-direction (drag up/left) handling — ours uses `min/abs` corner anchoring, proven by the browser drag test above.
- tool reverts to selection after a shape unless the lock flag is set — implemented (lock toggle Q/🔒).

## Excalidraw UX alignment

| Behavior | Status |
|---|---|
| Tool reverts to Select after drawing one shape (default) | DONE |
| Tool lock 🔒 toggle keeps tool active (Q key + toolbar button) | DONE |
| Hand tool for panning (H) + space-drag + middle-drag | DONE |
| Shortcuts: V select, H hand, R card, T text, B button, I image, F frame, C container | DONE |

## Test totals (this session)

`pnpm test` → pure 22 passed (2 files) + rune 26 passed (4 files) = **48 tests, all passing**.
`pnpm exec tsc --noEmit` exit 0. `pnpm run check` 0 errors / 0 warnings (736 files).
