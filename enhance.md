---

## 13. Final hardening pass (run LAST — after the build and the §12 verification pass)

This is the closing pass. Its job is **not** to polish everything evenly — it is to harden the
three areas where failure actually costs the user, and to deliberately leave alone the areas where
it doesn't. Resist the urge to touch things that work.

**Latitude:** you may refactor where it *materially* improves 10-year maintainability or fixes a
real defect. You may not rewrite working subsystems for taste, churn public shapes without reason,
or "modernize" code that is already correct. Every change must be justified by a defect, a
correctness gap, or a concrete longevity win — state which, in the commit/notes.

Concentrate on exactly these three fronts. Everything else is explicitly out of scope for this pass
(log it to `KNOWN_GAPS.md` instead of fixing it).

---

### 13.1 Export compiler correctness — `export/to-markdown.ts` (highest priority)

This is the product. The tool is worthless if the exported spec produces messy or wrong SvelteKit.
Harden it to a contract, not a vibe.

- **Determinism, proven.** Same document → byte-identical Markdown, every time. Stable sort on
  every collection (siblings by `z` then stable tiebreak; never rely on object/Map insertion order).
  No timestamps, no random IDs, no locale-dependent formatting in the output body. Add/extend the
  unit test to assert byte-stability across two runs of the same fixture.
- **Hierarchy integrity.** Deeply nested frames→containers→leaves must round-trip into correctly
  nested Markdown. Test with at least 4 levels of nesting and with siblings that mix layout modes.
- **Geometry→intent inference is sound.** Where `LayoutIntent` is absent, the inferred
  flex/grid/gap/alignment must be defensible. Write fixtures for the common shapes (sidebar+main,
  stat-card row, header bar, grid of cards) and assert the inferred layout matches intent. Where
  inference is ambiguous, prefer emitting an explicit note over guessing silently.
- **Round-trip realism test (the real acceptance gate).** Take the exported Markdown for a
  representative dashboard and confirm it is unambiguous enough that a SvelteKit 5 implementer
  (Svelte 5 runes, TS strict, Phosphor via unplugin-icons, semantic HTML, OKLCH/`@layer`/logical
  properties) could build it without inventing layout. If anything in the spec forces guessing, fix
  the *compiler* so it emits the missing intent — do not paper over it in the instruction block.
- **Icon fidelity.** Every `icon` element emits its exact Iconify name (`ph:...`) so it re-imports
  cleanly. No icon should degrade to a prose description.
- **Failure modes.** Empty document, single element, orphaned `parentId`, zero-size elements,
  rotated elements, elements outside the canvas bounds — none may throw; each must produce sane
  output or a clearly-marked spec note.

---

### 13.2 Undo/redo + data integrity (never corrupt, never lose work)

The user must never lose work or hit a corrupted state. This is a hard guarantee, not a feature.

- **Operation coalescing.** A single continuous gesture = a single undo entry. One drag, one resize,
  one rotate, one multi-element move, one inline-text edit → exactly one undoable step. Verify by
  performing each gesture and confirming a single ctrl/cmd-Z fully reverts it.
- **Round-trip invariant.** For every mutating command: do → undo → redo must return to an identical
  document state (deep-equal the serialized document). Add a test harness that fuzzes a sequence of
  random operations and asserts undo-to-empty and redo-to-final both reconstruct exact state.
- **No partial/torn state.** Interrupting a gesture (escape mid-drag, focus loss, window blur) must
  leave a clean, consistent document — never a half-applied mutation. Verify the interrupt paths.
- **Autosave + crash safety.** Autosave must be atomic: write to a temp file, then rename over the
  target (never truncate-in-place), so a crash mid-write can't corrupt the saved document. On
  launch, the restore path must validate the autosaved payload against `schemaVersion` and the
  schema before loading; reject/quarantine malformed payloads rather than crashing.
- **Schema versioning is load-bearing.** Confirm `schemaVersion: 1` is written and checked on load.
  Add a migration seam now (a `migrate(doc)` function switched on version) even though there's only
  v1 — so future format changes never strand old `.lfdoc` files. Forward-only, never mutate a
  shipped migration.
- **Save integrity.** Confirm a save→quit→relaunch→open cycle is byte-lossless for a complex
  document (nesting, icons, rotation, all semantic types).

---

### 13.3 Performance at scale + macOS app polish

Make it feel like a native, fast desktop app — on the element counts you'll actually hit, plus
headroom.

- **Redraw discipline.** Confirm rendering is dirty-flag driven, not a constant rAF loop. Idle =
  zero redraws. A single element move repaints once per frame, not N times.
- **60fps target, measured.** Verify smooth pan/zoom/drag at a realistic upper bound (e.g.
  1,000–2,000 elements). If it degrades, profile and fix the actual hot path — candidates: per-frame
  allocations in the render loop, hit-testing without a broad-phase/spatial index, re-rasterizing
  text every frame instead of caching per zoom bucket. Add a spatial index (grid/quadtree) for
  hit-testing only if profiling shows linear scans are the bottleneck — don't add it speculatively.
- **Zoom/pan stability.** No drift, no precision artifacts at extreme zoom; text stays crisp across
  zoom levels (DPR-aware, cached sensibly).
- **Startup.** Cold launch to interactive should feel instant. Confirm the static bundle is lean
  (Vite 8/Rolldown), no accidental large deps pulled in, icons are build-time inlined (no runtime
  fetch).
- **macOS bundle polish.** `pnpm tauri build` produces a clean `.dmg`. Verify: correct app name and
  bundle identifier, an app icon set, sensible default + min window size, native traffic-light
  window controls, native file dialogs (open/save/export) via `plugin-dialog`, and that the app is
  fully functional with networking disabled (offline guarantee). Note (don't necessarily perform)
  whether code-signing/notarization is needed for the user's own machine — flag it for the user.

---

### 13.4 Out of scope for this pass (do not fix — log instead)

To keep this pass sharp, explicitly **do not** spend effort on: interaction feel on workflows the
user doesn't use, exhaustive cross-device/touch input hardening, multi-user/collab concerns,
accessibility beyond reasonable semantic HTML, theming/visual restyling, or speculative
generalization. If you notice issues in these areas, append them to `KNOWN_GAPS.md` with a one-line
note and move on. This is a single-user personal tool, not a product for millions — hardening these
would be wasted effort.

---

### 13.5 Final report

Produce a concise closing report:
- **Export:** what correctness gaps you found and fixed; confirmation of byte-determinism and the
  round-trip realism check; remaining ambiguities (if any) and why they're acceptable.
- **Integrity:** confirmation of coalescing, do/undo/redo invariant (with the fuzz test result),
  atomic autosave, and lossless save round-trip.
- **Perf/macOS:** measured frame behavior at the tested element count, bundle size, and `.dmg`
  build status; any code-signing note.
- **Refactors:** each non-trivial refactor, with its justification (defect / correctness / longevity).
- **Deferred:** what landed in `KNOWN_GAPS.md` and why it's safe to defer.

State concretely what is now verified-correct vs. built-but-unverified. No "starting point" hedging.