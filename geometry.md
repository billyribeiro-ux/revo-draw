# DIAGNOSTIC PASS — Geometry / coordinate system is broken. Find the ROOT cause, prove the fix.

The canvas geometry is broken across the board — element positions, sizes (x/y/w/h), selection,
handles, and rendering are all misaligned. When *everything* is wrong, this is almost never many
separate bugs — it is **one broken foundation**: the coordinate-system contract. Do not patch
symptoms. Find the single root cause, fix it once, and prove the whole pipeline is consistent.

## RULE FOR THIS PASS

Do not "make it look better" by nudging offsets, adding magic `+0.5`/`* dpr` fudge factors, or
adjusting individual handlers until the screen looks right. That hides the root cause and guarantees
it breaks again at a different zoom/pan. **Diagnose first, fix the contract, then prove it with
output.** Paste real command/test output — no "should work now" assertions.

## STEP 1 — State the coordinate contract explicitly (in writing, before changing code)

Open `geometry.ts`, `camera.svelte.ts`, `scene-graph.svelte.ts`, `renderer.ts`, `hit-test.ts`.
Write down, as a short spec at the top of `geometry.ts`, the ANSWERS to these — these are the
questions whose inconsistent answers cause exactly this "everything is a mess" failure:

1. **Units & space of stored `x/y/w/h`:** Are element coordinates stored in WORLD space or SCREEN
   space? (Must be world.) Is the origin top-left? Is `y` down?
2. **Child coordinates:** Are a child element's `x/y` stored ABSOLUTE (world) or RELATIVE to its
   parent's origin? Pick ONE and confirm every read/write site agrees. (Mixed is the classic cause
   of nested-element offset chaos.)
3. **The camera transform:** What is the exact forward mapping world→screen and inverse
   screen→world? Write both formulas. Confirm it is `screen = (world - cameraPos) * zoom` (or
   whatever the code intends) and that the inverse is the precise algebraic inverse — not an
   approximation.
4. **Device pixel ratio:** Where is DPR applied — exactly once, at the canvas backing-store /
   context scale level — or is it leaking into the world transform and being double-counted?
5. **Rotation:** Is `rotation` applied about the element center or its top-left? Is the same pivot
   used in render, hit-test, and handle placement?

If any of these five has a DIFFERENT answer in different files, that mismatch IS the bug. List every
inconsistency you find as `MISMATCH: <file:line> assumes X, <file:line> assumes Y`.

## STEP 2 — Establish ONE source of truth for the transform

There must be exactly ONE place that converts world↔screen, and everything else calls it:

- `camera.svelte.ts` exposes `worldToScreen(p)`, `screenToWorld(p)`, and the matrix used by the
  renderer — and these are provably inverses of each other.
- `renderer.ts` draws by applying that camera transform to the context ONCE, then drawing elements
  in world coordinates. It must NOT also manually multiply each element's coords by zoom/offset
  (that double-applies the transform — a prime "everything's a mess" cause).
- `hit-test.ts` converts the pointer screen→world ONCE via `screenToWorld`, then tests against
  world-space element bounds. It must NOT compare screen coords to world coords.
- Transform handles are positioned by taking world-space element bounds → `worldToScreen` for
  drawing the handle overlay, and pointer → `screenToWorld` for dragging. One direction each, no
  mixing.

Refactor so there is a single transform implementation. Delete any duplicate/inline coordinate math
in handlers and route it through the camera functions. Name every duplicate you removed.

## STEP 3 — Prove the round-trip invariant (this is the decisive test)

Write and run a unit test asserting the transform is internally consistent — this catches the whole
class of bug at once:

- For a grid of sample points and a matrix of camera states (several `zoom` values incl. <1 and >1,
  several pan offsets incl. large ones, and zoom=1/pan=0):
  `screenToWorld(worldToScreen(p)) ≈ p` and `worldToScreen(screenToWorld(p)) ≈ p` within float
  epsilon, for every point × every camera state.
- Paste the test output. If it fails, the forward/inverse pair is wrong — fix the algebra, not the
  call sites.

Then prove the higher-level invariants:

- **Click-locates-element:** place an element at known world `x/y/w/h`; under several camera states,
  compute the screen position of its center via `worldToScreen`, feed that screen point to
  hit-test, assert it returns that element. Paste output.
- **Drag-is-identity-at-rest:** simulate a pointer-down then pointer-up with zero movement on an
  element; assert its `x/y/w/h` are byte-identical afterward (no drift from a bad round-trip). Paste
  output.
- **Pan/zoom does not move world coords:** assert that panning or zooming the camera changes NO
  element's stored `x/y/w/h` at all (only the view changes). If panning mutates element coords, that
  is the bug. Paste output.

## STEP 4 — Visual ground-truth check

Add a temporary debug overlay (toggle): draw each element's stored world `x/y/w/h` as text on the
element, and draw the world origin (0,0) and world axes. Render a known fixture: a 100×100 box at
world (0,0) and another at world (300,200). Confirm — and report — that at zoom=1/pan=0 they sit
exactly where their numbers say, and that after a pan/zoom they stay visually pinned to the same
world location relative to the grid. Describe what you observe. Remove the overlay after (or leave it
behind a dev flag).

## STEP 5 — Report with evidence

- The coordinate contract you wrote (the 5 answers).
- Every `MISMATCH` you found and which one was the root cause.
- The duplicate transform math you removed.
- Pasted output of: the round-trip invariant test, click-locates-element, drag-identity, and
  pan/zoom-doesn't-mutate tests — all passing.
- Honest statement: if any invariant still fails, say `NOT FIXED` and show the failing output. Do not
  claim resolution without the passing test.

Do NOT add features, do NOT touch the export compiler or persistence in this pass. Coordinate system
only. Find the one broken thing, fix it at the source, prove it with tests.