import { describe, expect, it } from "vitest";

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
});
