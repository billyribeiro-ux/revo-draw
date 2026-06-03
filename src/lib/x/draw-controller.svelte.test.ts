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

  it("eraser removes the element under the pointer", () => {
    const c = new DrawController();
    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(200, 180);
    c.pointerUp();
    c.setTool("rectangle");
    c.pointerDown(300, 100);
    c.pointerMove(400, 180);
    c.pointerUp();
    expect(c.scene.elements.length).toBe(2);

    c.setTool("eraser");
    c.pointerDown(100, 140); // left outline of the first rectangle
    c.pointerUp();

    expect(c.scene.elements.length).toBe(1);
  });

  it("deletes the selected element", () => {
    const c = new DrawController();
    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(200, 180);
    c.pointerUp();
    c.setTool("selection");
    c.pointerDown(100, 140);
    c.pointerUp();
    expect(c.scene.elements.length).toBe(1);

    c.deleteSelected();
    expect(c.scene.elements.length).toBe(0);
    expect(c.selectedId).toBeNull();
  });

  it("duplicates the selected element (new id, +10 offset, copy selected)", () => {
    const c = new DrawController();
    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(200, 180);
    c.pointerUp();
    c.setTool("selection");
    c.pointerDown(100, 140);
    c.pointerUp();
    const orig = c.scene.elements[0]!;

    c.duplicateSelected();
    expect(c.scene.elements.length).toBe(2);
    const copy = c.scene.elements.find((e) => e.id !== orig.id)!;
    expect(copy.id).not.toBe(orig.id);
    expect(copy.x).toBe(orig.x + 10);
    expect(c.selectedId).toBe(copy.id);
  });

  it("undo/redo round-trips a draw", () => {
    const c = new DrawController();
    expect(c.scene.elements.length).toBe(0);
    expect(c.canUndo).toBe(false);

    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(200, 180);
    c.pointerUp();
    expect(c.scene.elements.length).toBe(1);
    expect(c.canUndo).toBe(true);

    c.undo();
    expect(c.scene.elements.length).toBe(0); // tombstoned → not visible

    c.redo();
    expect(c.scene.elements.length).toBe(1);
  });

  it("undo restores an element's position after a move", () => {
    const c = new DrawController();
    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(200, 180);
    c.pointerUp();
    const x0 = c.scene.elements[0]!.x;

    c.setTool("selection");
    c.pointerDown(100, 140); // select via outline + begin drag
    c.pointerMove(150, 170); // dx=50
    c.pointerUp();
    expect(c.scene.elements[0]!.x).toBe(x0 + 50);

    c.undo();
    expect(c.scene.elements[0]!.x).toBe(x0);
  });

  it("style setters update defaults, apply to new elements, and restyle the selection", () => {
    const c = new DrawController();

    c.setStrokeColor("#e03131");
    c.setStrokeWidth(4);
    expect(c.strokeColor).toBe("#e03131");
    expect(c.strokeWidth).toBe(4);

    // a newly drawn element picks up the current style
    c.setTool("rectangle");
    c.pointerDown(100, 100);
    c.pointerMove(200, 180);
    c.pointerUp();
    const rect = c.scene.elements[0]! as { strokeColor: string; strokeWidth: number };
    expect(rect.strokeColor).toBe("#e03131");
    expect(rect.strokeWidth).toBe(4);

    // selecting then changing a color restyles the selected element
    c.setTool("selection");
    c.pointerDown(100, 140);
    c.pointerUp();
    c.setBackgroundColor("#a5d8ff");
    expect((c.scene.elements[0]! as { backgroundColor: string }).backgroundColor).toBe("#a5d8ff");
  });

  it("line and arrow tools create 2-point linear elements", () => {
    const c = new DrawController();

    c.setTool("line");
    c.pointerDown(100, 100);
    c.pointerMove(250, 180);
    c.pointerUp();
    const line = c.scene.elements[0]! as { type: string; points: readonly unknown[] };
    expect(line.type).toBe("line");
    expect(line.points.length).toBe(2);

    c.setTool("arrow");
    c.pointerDown(300, 100);
    c.pointerMove(450, 200);
    c.pointerUp();
    const arrow = c.scene.elements[1]! as { type: string; endArrowhead: string | null };
    expect(arrow.type).toBe("arrow");
    expect(arrow.endArrowhead).toBe("arrow");
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
