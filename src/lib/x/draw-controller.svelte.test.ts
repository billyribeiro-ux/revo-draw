import { describe, expect, it } from "vitest";

import { getTransformHandles } from "@excalidraw/element";

import { DrawController } from "./draw-controller.svelte.ts";

// Default app state has zoom 1, scroll 0, offsets 0 → scene coords == client coords here.
describe("DrawController — generic-create gesture", () => {
  it("drag creates a correctly-sized element of the active tool, then reverts to selection", () => {
    const c = new DrawController();
    c.setTool("rectangle");

    c.pointerDown(100, 100);
    expect(c.scene.elements.length).toBe(1);

    c.pointerMove(300, 220);
    const el = c.scene.elements[0]!;
    expect(el.type).toBe("rectangle");
    expect(Math.round(el.width)).toBe(200);
    expect(Math.round(el.height)).toBe(120);

    c.pointerUp();
    expect(c.activeTool).toBe("selection");
    expect(c.scene.elements.length).toBe(1);
  });

  it("handles negative-direction drag (origin becomes the min corner)", () => {
    const c = new DrawController();
    c.setTool("ellipse");

    c.pointerDown(300, 300);
    c.pointerMove(100, 150);

    const el = c.scene.elements[0]!;
    expect(el.x).toBe(100);
    expect(el.y).toBe(150);
    expect(el.width).toBe(200);
    expect(el.height).toBe(150);
  });

  it("discards a zero-size click (no drag)", () => {
    const c = new DrawController();
    c.setTool("diamond");

    c.pointerDown(50, 50);
    c.pointerUp();

    expect(c.scene.elements.length).toBe(0);
    expect(c.activeTool).toBe("selection");
  });

  it("the selection tool does not create elements", () => {
    const c = new DrawController();
    c.setTool("selection");

    c.pointerDown(100, 100);
    c.pointerMove(200, 200);
    c.pointerUp();

    expect(c.scene.elements.length).toBe(0);
  });

  it("selection tool hit-tests an element on its outline and clears on a miss", () => {
    const c = new DrawController();
    // draw a transparent rectangle 100,100 → 300,200
    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(300, 200);
    c.pointerUp();
    const id = c.scene.elements[0]!.id;

    // click the left outline (transparent shapes hit on the stroke, not interior)
    c.setTool("selection");
    c.pointerDown(100, 150);
    expect(c.selectedId).toBe(id);
    expect(c.selectedElements.length).toBe(1);

    // click empty space → deselect
    c.pointerDown(600, 600);
    expect(c.selectedId).toBeNull();
    expect(c.selectedElements.length).toBe(0);
  });

  it("drags the selected element by the pointer delta (origin-based)", () => {
    const c = new DrawController();
    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(200, 180); // rect x=100 y=100 w=100 h=80
    c.pointerUp();

    c.setTool("selection");
    c.pointerDown(100, 140); // left outline → select + begin drag
    c.pointerMove(150, 170); // dx=50 dy=30
    c.pointerUp();

    const el = c.scene.elements[0]!;
    expect(Math.round(el.x)).toBe(150);
    expect(Math.round(el.y)).toBe(130);
  });

  it("resizes the selected element by dragging a corner handle", () => {
    const c = new DrawController();
    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(300, 260); // rect 100,100 w=200 h=160
    c.pointerUp();

    c.setTool("selection");
    c.pointerDown(100, 150); // left outline → select
    c.pointerUp();

    const el = c.scene.elements[0]!;
    const w0 = el.width;
    const h0 = el.height;

    // grab the SE handle (computed) and drag it out by +80,+60
    const hs = getTransformHandles(
      el,
      c.appState.current.zoom,
      c.scene.scene.getNonDeletedElementsMap(),
      "mouse",
    );
    const se = hs.se!;
    const cx = se[0] + se[2] / 2;
    const cy = se[1] + se[3] / 2;
    c.pointerDown(cx, cy);
    c.pointerMove(cx + 80, cy + 60);
    c.pointerUp();

    expect(el.width).toBeGreaterThan(w0 + 50);
    expect(el.height).toBeGreaterThan(h0 + 40);
  });

  it("freedraw accumulates local points along the stroke", () => {
    const c = new DrawController();
    c.setTool("freedraw");

    c.pointerDown(100, 100); // origin → seeds point [0,0]
    c.pointerMove(130, 110); // local [30,10]
    c.pointerMove(170, 160); // local [70,60]
    c.pointerUp();

    expect(c.scene.elements.length).toBe(1);
    const el = c.scene.elements[0]!;
    expect(el.type).toBe("freedraw");
    const points = (el as { points: readonly (readonly [number, number])[] }).points;
    expect(points.length).toBe(3);
    expect([...points[2]!]).toEqual([70, 60]);
    // freedraw stroke is kept even though it has no drag-box (not discarded)
    expect(c.activeTool).toBe("selection");
  });
});
