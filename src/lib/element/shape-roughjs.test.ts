// Phase 2 rendering gate — proves rough.js shape generation works in our runtime (vitest 4 /
// Vite 8), producing the hand-drawn geometry the static renderer paints, and that it is
// seed-deterministic (the property the whole "stable hand-drawn look across reloads" depends on).
import { describe, expect, it } from "vitest";

import { newElement, ShapeCache } from "@excalidraw/element";

import type { ExcalidrawRectangleElement } from "@excalidraw/element/types";
import type { Drawable } from "roughjs/bin/core";

const rect = (seed: number) =>
  newElement({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    seed,
  }) as ExcalidrawRectangleElement;

// generateElementShape returns Drawable | Drawable[] | (Drawable | SVGPathString)[] | null;
// a rectangle yields a single Drawable. Narrow defensively in the test helper.
const firstDrawable = (shape: unknown): Drawable => {
  expect(shape).toBeTruthy();
  const d = Array.isArray(shape) ? shape[0] : shape;
  return d as Drawable;
};

describe("Phase 2 — rough.js shape generation (runtime)", () => {
  it("generates a rough.js Drawable with path ops for a rectangle", () => {
    const drawable = firstDrawable(ShapeCache.generateElementShape(rect(42), null));

    expect(drawable.sets.length).toBeGreaterThan(0);
    expect(drawable.sets[0]!.ops.length).toBeGreaterThan(0);
  });

  it("is seed-deterministic — same seed yields identical geometry", () => {
    const da = firstDrawable(ShapeCache.generateElementShape(rect(424242), null));
    const db = firstDrawable(ShapeCache.generateElementShape(rect(424242), null));

    expect(JSON.stringify(db.sets)).toBe(JSON.stringify(da.sets));
  });

  it("different seeds yield different sketch geometry", () => {
    const da = firstDrawable(ShapeCache.generateElementShape(rect(1), null));
    const db = firstDrawable(ShapeCache.generateElementShape(rect(2), null));

    expect(JSON.stringify(db.sets)).not.toBe(JSON.stringify(da.sets));
  });
});
