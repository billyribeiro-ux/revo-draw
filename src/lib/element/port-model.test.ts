// Phase 1 runtime gate — proves the vendored Excalidraw model primitives execute correctly
// in our toolchain (vitest 4 / Vite 8 / Rolldown), not merely type-check. Covers the element
// factory, fractional-index assignment/validation, and version/nonce mutation semantics that the
// scene/store/history layer is built on.
import { describe, expect, it } from "vitest";

import { arrayToMap } from "@excalidraw/common";

import {
  mutateElement,
  newElement,
  newElementWith,
  syncInvalidIndices,
  validateFractionalIndices,
} from "@excalidraw/element";

const rect = (x: number, y: number) =>
  newElement({ type: "rectangle", x, y, width: 100, height: 60 });

describe("Phase 1 — vendored Excalidraw model (runtime smoke)", () => {
  it("newElement produces a well-formed generic element", () => {
    const el = rect(10, 20);
    expect(el.type).toBe("rectangle");
    expect(el.x).toBe(10);
    expect(el.y).toBe(20);
    expect(typeof el.seed).toBe("number");
    expect(typeof el.versionNonce).toBe("number");
    expect(el.version).toBeGreaterThanOrEqual(1);
    expect(typeof el.id).toBe("string");
    expect(el.index).toBeNull();
    expect(el.isDeleted).toBe(false);
  });

  it("syncInvalidIndices assigns strictly increasing fractional indices in array order", () => {
    const els = [rect(0, 0), rect(0, 100), rect(0, 200)];
    const ordered = syncInvalidIndices(els);

    for (const e of ordered) {
      expect(e.index).toBeTruthy();
    }

    // fractional indices are designed so lexicographic order === logical (array) order
    const indices = ordered.map((e) => e.index as string);
    expect([...indices].sort()).toEqual(indices);

    // validation throws on a malformed/unordered set; a synced set must pass
    expect(() =>
      validateFractionalIndices(ordered, {
        shouldThrow: true,
        includeBoundTextValidation: false,
      }),
    ).not.toThrow();
  });

  it("mutateElement bumps version and regenerates versionNonce", () => {
    const el = rect(0, 0);
    const map = arrayToMap([el]);
    const v0 = el.version;
    const nonce0 = el.versionNonce;

    mutateElement(el, map, { x: 999 });

    expect(el.x).toBe(999);
    expect(el.version).toBe(v0 + 1);
    expect(el.versionNonce).not.toBe(nonce0);
  });

  it("newElementWith is immutable — original untouched, copy advances version", () => {
    const el = rect(0, 0);
    const v0 = el.version;

    const next = newElementWith(el, { x: 42 });

    expect(next).not.toBe(el);
    expect(el.x).toBe(0);
    expect(next.x).toBe(42);
    expect(next.version).toBe(v0 + 1);
  });
});
