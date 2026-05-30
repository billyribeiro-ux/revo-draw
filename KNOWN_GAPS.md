# Known Gaps

This file records anything intentionally deferred or partially implemented, per §7/§11 of the
build prompt. The §7 interaction checklist is implemented in full; the items below are honest
scoping notes, not silent half-implementations.

## §7 Canvas interaction — status

All eleven §7 criteria are **implemented**:

| Criterion | Status | Notes |
|-----------|--------|-------|
| Single select | ✅ | Topmost element at the point via back-to-front hit-test. |
| Marquee select | ✅ | Partial intersection; works at any zoom/pan (world-space). |
| Multi-select | ✅ | Shift-click toggles; shift-drag adds to marquee. |
| Move | ✅ | World-space; multi-select moves together; whole subtree moves with a parent. |
| Transform handles | ✅ | 8 resize handles + rotate handle; shift = aspect lock; rotation about selection center; handles re-derived under any camera transform. |
| Snapping & alignment guides | ✅ | Edge/center alignment to neighbors + equal-spacing distribution; threshold in screen px (zoom-independent); **alt bypasses** snapping. |
| Nesting/grouping | ✅ | Drag-into-container reparents (preview highlight); tree drag-reparent; world coords preserved; cycle-safe. |
| Z-order | ✅ | Bring forward/back, to front/back; draw + hit-test order both honor `z`. |
| Text editing | ✅ | Double-click opens a positioned `<textarea>` transformed to match the element; commit on blur, Esc cancels, ⌘/Ctrl-Enter commits. |
| Keyboard | ✅ | delete, ⌘D duplicate, ⌘C/⌘V copy/paste, arrow-nudge (shift = ×10), ⌘Z / ⇧⌘Z undo/redo, ⌘A select-all, Esc deselect, tool shortcuts (V/F/C/T/B), ⌘[ /⌘] z-order, ⌘±/⌘0 zoom. |
| Undo/redo | ✅ | Immutable snapshots with structural sharing; one undo entry per gesture (transaction coalescing). Justification documented in `src/lib/commands/history.svelte.ts`. |

## Previously-deferred items — now CLOSED

These were earlier scope boundaries; they have since been implemented:

1. **Rotated-element resize in local axes — DONE.** A single rotated element now resizes in its
   own local frame: the pointer is transformed into the element's un-rotated space, the dragged
   edge moves there, and the opposite corner/edge stays fixed in world space (no skew, no drift).
   Handles sit on the element's rotated outline (`orientedHandles`), and resize cursors rotate to
   match the edge. Multi-selection still uses proportional AABB scaling (correct for groups).
   See `#updateResizeRotated` in `src/lib/canvas/editor.svelte.ts`.

2. **Richer SVG export — DONE.** `to-svg.ts` now renders table grids (header band, column
   separators, row lines), chart skeletons (line/bar series with axes), list rows (bullets +
   bars), and input placeholders — not just container rects. It remains a *visual* snapshot
   (the Markdown export is the semantic, high-fidelity output).

3. **OS clipboard — DONE.** ⌘C writes the selection to the system clipboard as a typed JSON
   envelope (`persistence/clipboard.ts`) and ⌘V reads it back, so copy/paste survives focus
   changes; an in-process copy remains as a permission-free fast fallback.

## Remaining scope boundaries (not bugs)

1. **`.dmg` notarization requires full Xcode + an Apple Developer certificate.** `pnpm tauri build`
   produces a working `.app` and `.dmg` (verified: `LayoutForge_0.1.0_aarch64.dmg`) with Command
   Line Tools; *signing/notarization* for distribution to other Macs is a machine/account concern,
   not a code gap. The bundle pipeline and `bundle.targets: ["app", "dmg"]` are configured correctly.

## §13.4 — explicitly out of scope for the hardening pass (logged, not fixed)

Per §13.4, these were deliberately not worked on (single-user personal tool):

- Interaction feel on workflows the user doesn't exercise.
- Exhaustive cross-device / touch-input hardening (the app is mouse/trackpad on macOS).
- Multi-user / collaboration concerns (explicitly not a product goal).
- Accessibility beyond reasonable semantic HTML (panels use roles/labels; not WCAG-audited).
- Theming / visual restyling (the editorial light theme is the intended look).
- Speculative generalization (e.g. a spatial index for hit-testing was NOT added — current
  linear scan is fine at the stated element counts; add only if profiling shows it's the
  bottleneck, per §13.3).

## Nothing else is stubbed

There are no `// TODO: implement`, placeholder functions, or simplified examples in the codebase.
Every function is fully implemented. `pnpm check` and `tsc` report zero errors/warnings under
strict mode; the export-compiler determinism test passes.
