// Port stub for Excalidraw's `App` React class (packages/excalidraw/components/App.tsx).
//
// In the Svelte 5 port the editor controller (src/lib/draw/draw-editor.svelte.ts, Phase 3)
// fulfils this contract. It is declared structurally here so the element layer — whose
// `AppClassProperties` (src/lib/excalidraw/types.ts) indexes `App["scene"]`, `App["setActiveTool"]`,
// … — type-checks today. Members the element layer actually consumes (`scene`, `state`, `files`,
// `library`, `imageCache`, `getEffectiveGridSize`, `lastPointerMoveEvent`) carry real types; the
// remaining React-glue surface is absorbed by the index signature pending the controller port.
import type { Scene } from "@excalidraw/element";
import type { FileId } from "@excalidraw/element/types";

import type { IMAGE_MIME_TYPES } from "@excalidraw/common";

import type { ValueOf } from "@excalidraw/common/utility-types";

import type { AppState, AppProps, BinaryFiles, NullableGridSize } from "../types";

import type Library from "../data/library";

declare class App {
  // React-glue surface (updateScene, setActiveTool, onEvent, …) not yet ported — typed loosely.
  [key: string]: unknown;

  props: AppProps;
  state: AppState;
  scene: Scene;
  files: BinaryFiles;
  canvas: HTMLCanvasElement;
  interactiveCanvas: HTMLCanvasElement | null;
  library: Library;
  imageCache: Map<
    FileId,
    {
      image: HTMLImageElement | Promise<HTMLImageElement>;
      mimeType: ValueOf<typeof IMAGE_MIME_TYPES>;
    }
  >;
  focusContainer(): void;
  getEffectiveGridSize(): NullableGridSize;
  lastPointerMoveEvent: PointerEvent | null;
  lastViewportPosition: { x: number; y: number };
  lastPointerMoveCoords: { x: number; y: number } | null;

  // Remaining `AppClassProperties` members (TS won't let the index signature satisfy named
  // requirements). The hub picks these as `App["x"]`, which resolve to `unknown`; declaring
  // them explicitly makes `App` assignable to `AppClassProperties`. Refined with the controller.
  api: unknown;
  sessionExportThemeOverride: unknown;
  editorInterface: unknown;
  syncActionResult: unknown;
  fonts: unknown;
  pasteFromClipboard: unknown;
  id: unknown;
  onInsertElements: unknown;
  onExportImage: unknown;
  scrollToContent: unknown;
  addFiles: unknown;
  addElementsFromPasteOrLibrary: unknown;
  togglePenMode: unknown;
  toggleLock: unknown;
  setActiveTool: unknown;
  setOpenDialog: unknown;
  insertEmbeddableElement: unknown;
  onMagicframeToolSelect: unknown;
  getName: unknown;
  dismissLinearEditor: unknown;
  flowChartCreator: unknown;
  setPlugins: unknown;
  plugins: unknown;
  getEditorUIOffsets: unknown;
  visibleElements: unknown;
  excalidrawContainerValue: unknown;
  onPointerUpEmitter: unknown;
  updateEditorAtom: unknown;
  onPointerDownEmitter: unknown;
  onEvent: unknown;
  onStateChange: unknown;
  bindModeHandler: unknown;
  setAppState: unknown;
}

export default App;
