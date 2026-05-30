# Needs Human Testing

Per §12.4: web search and type-checking close factual/API gaps, and the app has been launched
(the macOS window boots, the Rust shell + fs/sql/dialog plugins load, the frontend renders, no
panics). What a verification pass **cannot** confirm is the subjective *feel* of the interactions.
The following require you to exercise the running app (`pnpm tauri dev`) and judge by hand.

I have verified the **correctness of the code and APIs**. I have **not** verified the items below
by hand-use, and I am not claiming they are "fixed" — they are built and need your eyes.

1. **Drag/resize coalescing → exactly one undo entry.**
   The history layer wraps each gesture in a single `begin`/`commit` transaction, so a drag should
   produce one undo step, not many. *Test:* drag an element across the canvas, press ⌘Z once — it
   should snap back to the original position in a single step. Repeat for resize and rotate.

2. **Snapping/alignment guides feel correct and don't flicker across zoom levels.**
   The threshold is computed in screen pixels (converted to world units via zoom), so it should
   feel the same at 25% and 400%. *Test:* drag an element near another's edges/center at several
   zoom levels; guides should appear crisply, snapping should engage within a few px, and holding
   **alt** should disable it. Watch for jitter when two snap candidates compete.

3. **Hit-testing picks the intended element in dense/overlapping/nested layouts.**
   Hit-test walks front-to-back and respects rotation. *Test:* stack several elements, nest cards
   inside containers inside a frame, and click — the topmost element under the cursor should
   select, and clicking inside a child should select the child, not the parent.

4. **Text-edit overlay alignment holds under arbitrary pan/zoom/rotation.**
   The overlay `<textarea>` is positioned from the camera transform and rotated to match. *Test:*
   double-click a text element, then pan/zoom while editing (and try a rotated text element) — the
   editor box should stay glued to the element. Minor sub-pixel drift on rotated text is possible.

5. **60fps at the upper element counts (hundreds–low thousands).**
   Rendering is dirty-flag driven (no constant rAF), DPR-aware, and redraws the whole scene on
   change. *Test:* build or paste several hundred elements and drag a multi-selection; watch for
   frame drops. If needed, the renderer is the place to add per-element culling against the
   viewport.

6. **The exported Markdown actually produces good SvelteKit when fed back into Claude Code.**
   This is the real end-to-end test of the product. *Test:* draw a 2-column dashboard, tag
   semantics in the inspector, Export → Markdown, paste into Claude Code, and judge whether the
   generated SvelteKit 5 page matches your intent. The determinism and structure are verified by
   the unit test; the *usefulness* of the brief is a human judgment.

Everything else (build, type-safety, API correctness, determinism of the export, file
round-trip logic, offline icon loading) is verified-correct in code and by the automated checks.
