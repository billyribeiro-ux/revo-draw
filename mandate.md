---

## 14. Evidence mandate — PROVE it, do not assert it (run after §13)

The prior reports claim things are done. Claims are not evidence. This pass replaces **every status
assertion with reproducible proof**. The rule for this entire section:

> **No claim counts unless it is backed by command output, a passing test, or a measured number
> that you actually ran and pasted in. "Implemented", "works", "verified", "should", and ✅ are
> banned as standalone statements. If you cannot produce evidence for a claim, the correct answer
> is "NOT VERIFIED" — say that instead of asserting success.**

Do not refactor or add features in this pass. The goal is to find out what is actually true. If
evidence reveals a defect, fix the defect, then re-run the evidence and paste the new output.

For each item below: state the claim, run the command/test, **paste the real output verbatim**, and
then mark `VERIFIED` or `NOT VERIFIED`. Truncate long output to the decisive lines, but never
fabricate or paraphrase output — paste what actually printed.

---

### 14.1 Build & type safety (cheap, do first)

Run and paste output for each:
- `pnpm install` — paste the tail (lockfile resolution, any peer warnings).
- `pnpm exec tsc --noEmit` — paste the result. Claim is `VERIFIED` only on exit code 0 with zero
  errors. Paste the exit code.
- `pnpm exec svelte-check --threshold error` (or the project's check script) — paste the summary
  line (errors/warnings counts).
- `pnpm build` — paste the tail including the emitted bundle sizes. Confirm Vite 8/Rolldown ran.
- Print the actually-installed versions: `pnpm list svelte @sveltejs/kit vite typescript
  drizzle-orm @tauri-apps/cli 2>/dev/null` (and the Tauri core/plugin versions from
  `src-tauri/Cargo.lock`). Paste them and reconcile against the §1 pin table line by line. Any
  mismatch = `NOT VERIFIED` for that row, with the actual vs. expected shown.

### 14.2 Export compiler — determinism AND realism (the product)

**Determinism (must be a test, not a claim):**
- Run the determinism unit test. Paste the test runner output showing it pass.
- Then prove it independently of the test harness: export the same fixture document twice to two
  files and diff them. Paste the exact commands and the diff result (expect empty diff / identical
  hashes — paste `shasum` of both files).

**Realism (the gate that actually matters):**
- Pick the most representative fixture (a real 2-column dashboard: sidebar + nav + header + stat-card
  row + chart region, with at least one nested container and one Phosphor icon).
- **Paste the full exported Markdown** for that fixture into the report. Not a description — the
  actual export.
- Then **self-audit it against this question, claim by claim:** "Could a SvelteKit 5 implementer
  build this exact layout without inventing any layout decision?" For every place the spec leaves
  layout ambiguous (missing direction, gap, sizing, responsive behavior, alignment), list it
  explicitly as an `AMBIGUITY`. If there are ambiguities, **fix the compiler** so it emits the
  missing intent, re-export, and paste the corrected Markdown. Do not fix it by editing the
  instruction block — fix the data the compiler emits.
- Report the final count of remaining ambiguities. Target: zero. Each remaining one must have a
  one-line justification for why it's acceptable.

### 14.3 Undo/redo + data integrity — the invariant must be a passing fuzz test

This is the integrity guarantee. A prose description of "immutable snapshots" is **not** acceptance.

- **Write (if absent) and run a fuzz harness** that: starts from an empty document, applies a long
  randomized sequence (≥500 ops) of every mutating command (create each semantic type, move,
  resize, rotate, restyle, reparent, z-order, delete, text-edit, duplicate, paste), recording a
  deep-serialized snapshot after each op; then undoes every step asserting the document deep-equals
  the recorded snapshot at each point back to empty; then redoes every step asserting it deep-equals
  forward to the final state. Seed the RNG and print the seed so failures reproduce.
- Paste the harness result (ops run, assertions passed, seed). `VERIFIED` only if it runs clean over
  multiple seeds — run it at least 5 times and paste the summary of each.
- **Gesture coalescing — prove one entry per gesture.** For each of: a drag-move, a resize, a
  rotate, a multi-element move, and an inline text edit — perform the gesture programmatically (or
  via a scripted sequence of pointer events), then assert the undo stack grew by **exactly 1** and a
  single undo fully reverts it. Paste the assertion output (stack depth before/after, and post-undo
  deep-equal to pre-gesture state).
- **Interrupt safety.** Script an interrupted gesture (begin drag → fire Escape / window blur
  mid-drag) and assert the document deep-equals its pre-gesture state and the undo stack did not
  grow. Paste the result.

### 14.4 Persistence integrity — atomic write & validated load, proven

- **Atomic autosave.** Show the actual save code path and confirm it writes to a temp file then
  renames over the target (no truncate-in-place). Paste the relevant code. Then prove it: simulate a
  crash by killing the write between temp-write and rename (or unit-test the function with the rename
  step stubbed to throw) and assert the previously-saved file is still intact and parseable. Paste
  the test output.
- **Validated load.** Feed the loader three payloads: (a) a valid `.lfdoc`, (b) a payload with a
  wrong/missing `schemaVersion`, (c) a structurally malformed payload (truncated JSON, orphaned
  `parentId`). Assert (a) loads, and (b)/(c) are rejected/quarantined **without crashing**. Paste
  the outputs.
- **Lossless round-trip.** Build a complex document (every semantic type, ≥4 nesting levels, a
  rotated element, ≥1 icon), save it, read it back, and assert deep-equality of the in-memory
  document before save vs. after load. Paste the comparison result (and `shasum` of a re-save to
  show byte-stability).

### 14.5 Performance — measured numbers, not targets

- Generate a synthetic document at **1,000** and **2,000** elements (paste the generator or the
  command). 
- Measure and paste **actual numbers**, not adjectives: average and worst-case frame time (ms) over
  a scripted pan+zoom+drag sequence at each element count, derived from real `performance.now()` /
  frame timing instrumentation. State the hardware/window size the measurement ran at.
- Confirm idle = zero redraws: instrument the render loop with a paint counter and show it stays
  flat when nothing changes. Paste the counter before/after a 5-second idle.
- If worst-case frame time exceeds ~16.7ms at the target counts, profile, identify the hot path
  (name it — allocation in render loop / linear hit-test / text re-raster), fix it, and paste the
  before/after numbers. Only add a spatial index if the profile proves linear hit-testing is the
  cause.

### 14.6 macOS bundle — show the artifact exists

- Run `pnpm tauri build` and paste the tail showing the `.app` and `.dmg` were emitted, with their
  output paths and file sizes (`ls -lh` the artifacts).
- Confirm offline operation with evidence: grep the built bundle for any runtime network calls
  (`fetch(`, CDN hostnames, `iconify.design`); paste the grep result showing none in the runtime
  path (icons are build-time inlined). 
- Restate the signing/notarization status from KNOWN_GAPS as a one-liner (unsigned local `.app`
  runs via right-click→Open; notarization needs full Xcode + Developer cert) — this one is a config
  fact, not something to execute.

---

### 14.7 Final evidence ledger

End with a single table: each claim → `VERIFIED` (with a pointer to the pasted evidence above) or
`NOT VERIFIED` (with the reason). Anything that could not be proven goes to `NEEDS_HUMAN_TESTING.md`
with the exact manual steps for the user to run it themselves — never silently upgraded to
"done".

Rules restated: paste real output, never fabricate or paraphrase it; "NOT VERIFIED" is an
acceptable and expected answer for anything you genuinely cannot prove; fix defects that evidence
exposes, then re-run and re-paste. Do not mark anything ✅ on the strength of the code "looking
correct."