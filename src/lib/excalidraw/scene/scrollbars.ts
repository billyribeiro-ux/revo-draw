// Port stub — scrollbar geometry is ported with the scene/viewport phase.
export type ScrollBars = {
  horizontal: { x: number; y: number; width: number; height: number } | null;
  vertical: { x: number; y: number; width: number; height: number } | null;
};
export declare function isOverScrollBars(
  scrollBars: ScrollBars,
  x: number,
  y: number,
): {
  isOverEither: boolean;
  isOverHorizontal: boolean;
  isOverVertical: boolean;
};
