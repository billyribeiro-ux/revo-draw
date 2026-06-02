// Phase 1 undo/redo-engine gate (capture + forward apply).
//
// Excalidraw's `ElementsDelta` is the low-level primitive under undo/redo: `calculate(prev, next)`
// captures a change; `applyTo(elements)` replays it. The BACKWARD (undo) direction is derived from
// the committed `StoreSnapshot` that `Store`/`History` maintain on the editor controller ("App"),
// so full bidirectional time-travel is wired and tested in Phase 3. Here we prove the
// snapshot-independent half: a change is captured into a non-empty delta and replays forward.
import { describe, expect, it } from "vitest";

import { arrayToMap } from "@excalidraw/common";

import {
  ElementsDelta,
  newElement,
  newElementWith,
  syncInvalidIndices,
} from "@excalidraw/element";

import type {
  OrderedExcalidrawElement,
  SceneElementsMap,
} from "@excalidraw/element/types";

const rect = (x: number, y: number) =>
  newElement({ type: "rectangle", x, y, width: 10, height: 10 });

const asOrdered = (m: SceneElementsMap) =>
  m as Map<string, OrderedExcalidrawElement>;

describe("ElementsDelta — undo/redo engine (capture + forward apply)", () => {
  it("captures an element move into a non-empty delta and replays it forward", () => {
    const a = rect(0, 0);
    const b = rect(50, 0);
    syncInvalidIndices([a, b]);
    const prevMap = arrayToMap([a, b]) as SceneElementsMap;

    const aMoved = newElementWith(a, { x: 100 }); // bumps version
    const nextMap = arrayToMap([aMoved, b]) as SceneElementsMap;

    const delta = ElementsDelta.calculate(asOrdered(prevMap), asOrdered(nextMap));
    expect(delta.isEmpty()).toBe(false);

    const [forward] = delta.applyTo(prevMap);
    expect(forward.get(a.id)?.x).toBe(100);
    expect(forward.get(b.id)?.x).toBe(50); // untouched element preserved
  });

  it("captures an insertion and replays it forward", () => {
    const a = rect(0, 0);
    syncInvalidIndices([a]);
    const prevMap = arrayToMap([a]) as SceneElementsMap;

    const b = rect(20, 20);
    syncInvalidIndices([a, b]);
    const nextMap = arrayToMap([a, b]) as SceneElementsMap;

    const delta = ElementsDelta.calculate(asOrdered(prevMap), asOrdered(nextMap));
    expect(delta.isEmpty()).toBe(false);

    const [forward] = delta.applyTo(prevMap);
    expect(forward.get(b.id)?.isDeleted).toBe(false);
  });

  it("produces an empty delta when nothing changed", () => {
    const a = rect(0, 0);
    syncInvalidIndices([a]);
    const map = arrayToMap([a]) as SceneElementsMap;

    const delta = ElementsDelta.calculate(asOrdered(map), asOrdered(map));
    expect(delta.isEmpty()).toBe(true);
  });
});
