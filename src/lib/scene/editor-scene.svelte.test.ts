import { describe, expect, it } from "vitest";

import { newElement, syncInvalidIndices } from "@excalidraw/element";

const rect = (x: number, y: number) =>
  newElement({ type: "rectangle", x, y, width: 10, height: 10 });

// Scene.replaceAllElements validates fractional indices (throwing in dev/test) BEFORE syncing,
// so — matching Excalidraw's contract — callers hand it already-ordered elements. The editor's
// commands/store layer guarantees this; in tests we sync explicitly.
const ordered = (...els: ReturnType<typeof rect>[]) => syncInvalidIndices(els);

import { EditorScene } from "./editor-scene.svelte.ts";

describe("EditorScene (runes bridge over Scene)", () => {
  it("reflects elements and bumps version on mutation", () => {
    const es = new EditorScene(ordered(rect(0, 0)));
    expect(es.elements.length).toBe(1);

    const v0 = es.version;
    es.replaceAllElements(ordered(rect(0, 0), rect(10, 10)));

    expect(es.elements.length).toBe(2);
    expect(es.version).toBeGreaterThan(v0);
  });

  it("preserves strictly-increasing fractional index order", () => {
    const es = new EditorScene(ordered(rect(0, 0), rect(0, 10), rect(0, 20)));

    const indices = es.allElements.map((e) => e.index as string);
    expect(indices.every(Boolean)).toBe(true);
    expect([...indices].sort()).toEqual(indices);
  });

  it("starts empty and exposes a monotonic version signal", () => {
    const es = new EditorScene();
    expect(es.elements.length).toBe(0);

    const v0 = es.version;
    es.replaceAllElements(ordered(rect(0, 0)));
    const v1 = es.version;
    es.replaceAllElements(ordered(rect(0, 0), rect(0, 10)));
    const v2 = es.version;

    expect(v1).toBeGreaterThan(v0);
    expect(v2).toBeGreaterThan(v1);
  });
});
