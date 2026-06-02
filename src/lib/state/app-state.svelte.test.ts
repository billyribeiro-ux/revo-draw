import { describe, expect, it } from "vitest";

import { THEME } from "@excalidraw/common";

import { EditorAppState } from "./app-state.svelte.ts";

describe("EditorAppState (runes)", () => {
  it("starts from the Excalidraw default app state", () => {
    const s = new EditorAppState();
    expect(s.current.theme).toBe(THEME.LIGHT);
    expect(s.current.width).toBe(0);
    expect(s.current.viewModeEnabled).toBe(false);
  });

  it("setState merges immutably — new object, original untouched", () => {
    const s = new EditorAppState();
    const before = s.current;

    s.setState({ theme: THEME.DARK, width: 800 });

    expect(s.current).not.toBe(before);
    expect(s.current.theme).toBe(THEME.DARK);
    expect(s.current.width).toBe(800);
    expect(before.theme).toBe(THEME.LIGHT);
  });

  it("reset restores defaults", () => {
    const s = new EditorAppState();
    s.setState({ width: 999 });
    s.reset();
    expect(s.current.width).toBe(0);
  });
});
