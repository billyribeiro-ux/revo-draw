# Changelog

Working log for the Excalidraw forensic-audit + Phosphor-icon work on `feat/phase-e-vocabulary`.
Newest first. "Done" = committed on this branch with tests green; "Pending" = not yet started.

## Done

### Web-editor (`/x`) Phase 1 parity continuation — 2026-06-12 (branch `feat/excalidraw-parity-gaps`)

Completed and pushed four isolated Tier 1 wiring fixes from `PARITY_REMAINING_WORK.md`, one bug per
commit, each with a dedicated headless-Chrome differential probe:

- **#32** Delete/Backspace no longer delete while Cmd/Ctrl is held (`1bb3bb3`,
  `probe-x-fix32-delete-modifier-guard.mjs`).
- **#44** Shift+wheel now pans horizontally with `(deltaY || deltaX) / zoom` (`156e7cd`,
  `probe-x-fix44-shift-wheel-horizontal.mjs`).
- **#40** reset zoom preserves the viewport center via upstream `getStateForZoom` (`1b66a2d`,
  `probe-x-fix40-reset-zoom-center.mjs`).
- **#41** zoom-to-fit now caps at 100% and floors to `ZOOM_STEP` instead of using the old `0.85`
  multiplier (`95b632e`, `probe-x-fix41-zoom-to-fit.mjs`).

Verification: `pnpm check` 0/0, `pnpm test` 172/172, and the full
`for p in scripts/probe-x-fix*.mjs; do node "$p"; done` sweep passed **20/20**.

### Web-editor (`/x`) behavioral-parity fixes — 2026-06-12 (branch `feat/excalidraw-parity-gaps`)

End-to-end fidelity audit (95-agent workflow → `PARITY_E2E_AUDIT.md` / `PARITY_E2E_FINDINGS.json`)
found 84 confirmed divergences, all in the two seams the port wrote itself: the hand-rolled
`draw-controller.svelte.ts` and the 6 placeholder modules. The math/element/common/utils/
fractional-indexing packages and the renderers are **byte-identical to `excalidraw-master`** (proven
by `diff`), so every fix = wire the already-ported helper the controller wasn't calling. **16 fixes
landed (20 audit findings), one bug per commit, each proven with a differential headless-Chrome probe
(`scripts/probe-x-fix*.mjs`, 15/15 pass) plus `pnpm check` 0/0, 172 unit tests, and existing
regression probes green.** Full remaining-work list + continuation prompt in `PARITY_REMAINING_WORK.md`.

- **#1** style edits busted `ShapeCache` so the rough shape repaints (`3731960`).
- **#3/#4** shapes/lines honour `currentItemRoundness` at create via `getCurrentItemRoundness` (`39db1ff`).
- **#6** creation origin grid-snapped via `getGridPoint` (Ctrl bypasses) (`b19ecfa`).
- **#12** resize keeps the grabbed corner under the cursor via `getResizeOffsetXY` (`e9fcf4d`).
- **#13/#16** grouped selection sets `selectedGroupIds` via `selectGroupsForSelectedElements`; verified
  the real "contain"-mode box-selection contract (`63d1798`).
- **#15** double-click deep-enters a selected group (`editingGroupId`) (`e0d8230`).
- **#18/#19** dragging an arrow endpoint re-binds / un-binds via `bindOrUnbindBindingElement` (`f7b4c8b`).
- **#24** font-size change re-anchors text (`offsetElementAfterFontResize`; center stays fixed) (`9099714`).
- **#29** sloppiness change re-rolls the seed (`91b9fbf`).
- **#30** `setEdges` applies per-type roundness + skips elbow arrows (`a14df6a`).
- **#31** faithful `deleteSelectedElements` (frame children unparent+reselect, bound-text delete,
  `fixBindingsAfterDeletion`) (`46255a9`).
- **#33** duplicate uses batch `duplicateElements` so groups stay one group (`a05df17`).
- **#34** `selectAll` skips locked elements + bound-text labels (`4aedafe`).
- **#36** flip swaps arrowheads (all-bound-arrows), re-binds, and recenters (no drift) (`1b37569`).
- **#35/#37/#38/#42/#43** keyboard shortcuts wired: z-order chords (`event.code` + Darwin Alt), lock
  (⌘⇧L), align (⌘⇧Arrow), zoom (⌘±/0, ⇧1/2), view/zen (Alt+R / Alt+Z) (`2c67468`).

Housekeeping: reverted an incidental transitive `acorn 8.16.0→8.17.0` lockfile bump (no real dep
change; pnpm pinned at 11.6.0, `--frozen-lockfile` clean).

### Audit deliverables
- **`discovery.md`** — forensic per-function inventory of **all 474** non-test source files in
  `excalidraw-master/` (~2,150 functions/methods), produced by an 85-agent workflow, each agent
  reading full files and citing real line ranges. Coverage verified programmatically: **0 files
  missing** (a clustering name-collision that mis-covered 3 clusters was caught and re-run).
- **`parity-report.md`** — behavioral parity of our Svelte 5 / Canvas 2D code vs excalidraw-master
  across **13 subsystems** (geometry, camera, scene/z-order, element model, hit-test/collision,
  transform-handles, drag, resize/rotate, snapping, rendering, commands/history, export,
  persistence). Every function classified MATCH / DIVERGENT / ABSENT with file:line on both sides,
  then an **adversarial verify pass** re-checked the claims (**162 upheld, 4 flagged** for imprecise
  citations). Honest conclusion: NOT a 100% match — large ABSENT surface is intentional (no
  collab/firebase/mobile/React/linear-arrow/freedraw), plus real divergences listed below.

### Web-shell parity sweep (audit → fix, multi-agent)
- **Systematic UI-shell side-by-side audit + fix.** Ran a 12-agent read-only audit comparing every
  web-shell surface against its Excalidraw source counterpart (design tokens, app-shell layout,
  toolbar, main menu, style panel, color picker, footer/zoom, library, stats, canvas
  selection-overlay, keyboard shortcuts, dialogs/a11y) → **91 matchable findings** (source-cited,
  with exact values), written to `audit-parts/` (gitignored). Then a 7-agent fix pass (one agent
  per disjoint file-group, parallel-safe) applied **65 fixes**; the orchestrator serialized the
  gates (`pnpm check` 0/0, 141 tests) and committed per group (`beecc93`, `b9087e3`, `e2e26ce`,
  `35e9f47`, `0fbf324`, `3e34dcf`, `6ea6ce9`). Highlights: focus-ring/danger/brand-active tokens;
  599px phone breakpoint + ultrawide top-grid + zoom-limit disabling; toolbar glyph 16px + focus
  ring + press feedback; menu neutral hover + roving keyboard nav + Escape + disabled-Save;
  selection-overlay/cursor parity; library/stats/dialog-a11y chrome; Shift+Arrow nudge 5px.
  Product-divergent items (rough.js, element types, branding, collab) were explicitly excluded.

### Web-shell behavior/visual parity
- **Toolbar keybinding badges — ADDED** (`src/lib/ui/Toolbar.svelte`). Excalidraw shows an
  always-visible shortcut badge in each tool's corner (`.ToolIcon__keybinding`: bottom:2px,
  right:3px, 0.625rem, gray-40); ours only showed the key in a hover tooltip. Added a matching
  corner `kbd` badge for tools that have a shortcut (V/H/F/C/T/B). NOTE: the toolbar's *tool set*
  is semantic (frame/card/nav/…) vs Excalidraw's geometric (rect/ellipse/arrow/…) — a product
  difference that can't and shouldn't match; only the chrome does.
- **First-load welcome screen — ADDED** (`src/lib/ui/WelcomeScreen.svelte` new, wired in
  `+page.svelte`, shown when `scene.ordered.length === 0`). We showed a blank canvas on load;
  Excalidraw shows a WelcomeScreen. Replicated its structure from source (WelcomeScreen.Center +
  WelcomeScreen.Hints + WelcomeScreen.scss): a centered logo + heading + menu (Open / Browse
  library), plus the three **hand-drawn dashed arrow hints** (Excalidraw's exact `WelcomeScreen*Arrow`
  SVG paths) pointing to the menu (top-left, "Export, preferences, and more…"), the toolbar
  (top-center, "Pick a tool & start sketching!"), and the bottom island cluster ("Shortcuts &
  help"). Layout/sizing matched to the SCSS; hints hide on short/narrow viewports like Excalidraw.
  Branding is LayoutForge's own mark/wordmark — Excalidraw's logo/wordmark is a trademark and is NOT
  reproduced. `pnpm check` 0/0; svelte-autofixer clean (no issues, no suggestions).
- **Right-click context menu — ADDED** (`src/lib/ui/ContextMenu.svelte` new, wired in
  `src/lib/ui/Canvas.svelte`). We had no canvas context menu at all (browser default). Built one
  matching Excalidraw's `ContextMenu.tsx`/`ContextMenu.scss` structure (a `ul.context-menu` of
  rows with label + shortcut `kbd`, `hr` separators with leading/trailing/adjacent collapsed,
  clamped into the viewport). Right-clicking an element selects it first, then shows the element
  menu; right-clicking empty space shows the canvas menu (Excalidraw `handleCanvasContextMenu` +
  `getContextMenuItems`). Items mapped to our real commands:
  - **Element:** Cut / Copy / Paste · Copy styles / Paste styles · Group / Ungroup · Bring
    forward / Send backward / Bring to front / Send to back · Flip horizontal / Flip vertical ·
    Lock-Unlock · Duplicate · Delete (danger).
  - **Canvas:** Paste · Select all · Unlock all elements.
  - Excalidraw items with no analogue in our model are intentionally omitted (arrow-binding,
    bind/unbind text, linear editor, crop, frame ops, zen/view mode, stats, element links) — those
    features don't exist here. `pnpm check` 0/0; svelte-autofixer clean on the new component; 141 tests.

- **Menu button did nothing — FIXED** (`src/routes/+page.svelte`). Traced from CSS alone: the
  hamburger lives in `.menu-island`, whose `overflow: hidden` clipped `FileMenu`'s absolutely-
  positioned dropdown to the 2.25rem button box — so the button toggled open but the menu was
  invisible. Set the island to `overflow: visible` (the button's own border-radius already rounds
  its hover bg). `pnpm check` 0/0.
- **Canvas background — verified already matches Excalidraw** (no change needed). Our web tokens are
  `--canvas-bg: #ffffff` (= Excalidraw `COLOR_PALETTE.white` / `viewBackgroundColor` default) and the
  grid is off in web (`gridVisible = !isWeb` → false; Excalidraw `gridModeEnabled: false`). If the
  background still looks off on screen, it's a visual nuance that needs a screenshot to identify.

- **Color picker box rebuilt to Excalidraw's ColorPicker** (`src/lib/ui/StylePanel.svelte`,
  `src/lib/elements/palette.ts`) — the "more colors" popover was a 10×5 hue-grid; it now matches
  Excalidraw's structure verified against `ColorPicker.scss`/`Picker.tsx`: a **"Colors" heading +
  5-column base grid of the 15 named colors** (transparent/white/gray/black/bronze + 10 hues at the
  active shade), a **"Shades" row** (5 shades of the active color), and a **`#`-prefixed hex input**.
  Geometry matched exactly: 1.875rem swatches, 0.25rem gap, 0.5rem padding, 4px/0.5rem radii,
  inset 1px #d9d9d9 outline, scale(1.075) hover. Palette hex values are Excalidraw's exact
  open-color set. Picking a base color keeps the popover open to refine the shade (Excalidraw
  behavior). `pnpm check` 0/0, svelte-autofixer clean, 141 tests green.
  - NOTE: matched against Excalidraw source spec; **pixel-parity not yet visually confirmed** — I
    cannot see the live app (Chrome extension unpaired, no headless browser in repo). Needs a
    screenshot or Chrome connection to verify and to catch remaining web-shell diffs.

### Fixes (from the parity audit; controller logic was already proven correct by headless tests)
- **Phosphor icon recolor** (`src/lib/canvas/renderer.ts`) — added exported `iconInk(style)` that
  resolves a glyph's ink as `stroke ?? fill ?? INK`. Icons are monochrome glyphs whose visible
  color is their ink; Excalidraw colors glyph-like elements (freedraw) by `strokeColor`, so the
  prominent Style-panel **Stroke** control now recolors icons. Strictly additive: existing docs
  (icon color in `fill`) and the per-type default render unchanged. Tests:
  `src/lib/canvas/icon-interaction.svelte.test.ts` (place via tool + drag-drop, drag-move,
  resize-bigger, fill-recolor, stroke-recolor, + 3 `iconInk` unit tests).
- **SVG export per-element isolation** (`src/lib/export/to-svg.ts`) — `compileToSvg` now wraps each
  element render in `try/catch` (parity with excalidraw `staticSvgScene.ts:734-761`), so one
  malformed element no longer aborts the entire export. Tests added to
  `src/lib/export/icon-export.test.ts`.
- **Load-time element validation** (`src/lib/persistence/document-file.ts`) — `isLayoutDocument`
  only checked the document envelope, so a `.lfdoc` with an element missing/NaN `x/y/width/height`
  passed and fed NaN to the renderer/hit-test (blank/broken canvas). Now validates each element's
  base geometry (`type` + finite `x/y/width/height/rotation/z` + `parentId` string|null) and
  rejects a corrupt file **loudly** (caller throws "schema mismatch") rather than silently healing
  it — matching the repo's fail-loud philosophy (chose strict rejection over excalidraw's lenient
  field-defaulting). Tests added to `src/lib/persistence/persistence.test.ts`.

### Investigation evidence (icon bug)
- Proved at the controller level (5/5 headless tests) that placing, dragging, resizing-bigger, and
  recoloring an icon all work. Phosphor render data confirmed correct (single-path, nonzero winding).
  Conclusion: any remaining *live* icon failure is in the browser/DOM/CSS layer, not the logic.

## Pending

### Icon bug — live confirmation (BLOCKED on environment)
- Reproduce the reported "can't drag / resize / recolor" **in a real browser**. Blocked: the Claude
  Chrome extension reports 0 paired browsers, and there is no Puppeteer/Playwright in the repo.
  Needs either the extension connected or a described repro (web vs desktop; tool-click vs
  drag-from-picker; exact symptom).

### Parity divergences — reviewed; dispositioned
After review, the remaining "divergences" are NOT defects in our product. Matching excalidraw on
them would impose its choices on a different app, so they are intentionally left as-is unless a
future feature changes the premise:
- **Corner radius** — our `clamp(r, min(w,h)/2)` is correct and safe; excalidraw's proportional
  radius is an aesthetic choice, not a bug. **By design.**
- **Bbox intersection** — `bboxesIntersect` is unused in our codebase (verified). **N/A.**
- **Element bounds (rectangle-only)** — our element set is semantic (card/container/text/…), not
  geometric shapes; there is no ellipse/diamond to special-case. **N/A** until a non-rect element
  is added.
- **Zoom quantization / MIN-MAX** — float-drift only; our 0.05–8 range is a deliberate product
  choice. **Low value; deferred.**
- **Unbounded z-order growth** — latent; only matters after many thousands of reorderings on one
  doc. **Deferred** (add renormalization only if it ever bites).
- **SVG image export** — images export as empty boxes (the SVG export is a best-effort visual
  snapshot by design; Markdown is the high-fidelity output). **Feature gap, not a bug** — schedule
  only if SVG image fidelity becomes a requirement.

### Housekeeping
- Keep this file updated as items move from Pending → Done.
- Nothing pushed; commits land on `feat/phase-e-vocabulary` only.
