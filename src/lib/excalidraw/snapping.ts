// Port stub — the snapping subsystem is Phase 7 (src/lib/draw/snapping). The `SnapLine`
// shape is declared here so the type hub (AppState.snapLines) is self-contained.
export type PointSnapLine = { type: "points"; points: unknown[] };
export type PointerSnapLine = { type: "pointer"; points: unknown[]; direction: string };
export type GapSnapLine = { type: "gap"; direction: string; points: unknown[] };
export type SnapLine = PointSnapLine | PointerSnapLine | GapSnapLine;
