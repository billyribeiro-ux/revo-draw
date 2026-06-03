// PNG / SVG export for the editor. Mirrors Excalidraw's scene/export.ts (exportToCanvas /
// exportToSvg) but reuses the already-vendored renderStaticScene / renderSceneToSvg directly,
// so we avoid pulling in the heavy Fonts + data/* tree. Font inlining is skipped (system-font
// fallback) — the geometry, colours and hand-drawn strokes are identical to the on-canvas scene.
import rough from "roughjs/bin/rough";

import { renderStaticScene } from "@excalidraw/excalidraw/renderer/staticScene";
import { renderSceneToSvg } from "@excalidraw/excalidraw/renderer/staticSvgScene";

import { getCommonBounds, syncInvalidIndices } from "@excalidraw/element";
import { arrayToMap, THEME } from "@excalidraw/common";

import type {
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  NormalizedZoomValue,
  StaticCanvasAppState,
} from "@excalidraw/excalidraw/types";
import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "@excalidraw/excalidraw/scene/types";

const DEFAULT_EXPORT_PADDING = 10; // px (mirrors common/constants DEFAULT_EXPORT_PADDING)
const SVG_NS = "http://www.w3.org/2000/svg";
const FRAME_RENDERING = {
  enabled: true,
  clip: true,
  name: true,
  outline: true,
} as const;

export type ExportImageCache = StaticCanvasRenderConfig["imageCache"];

export interface ExportOpts {
  /** raster up-scale for PNG (Excalidraw's exportScale) / nominal scale for SVG */
  scale?: number;
  /** paint the view background rectangle */
  exportBackground?: boolean;
  viewBackgroundColor: string;
  theme?: AppState["theme"];
}

/** Tight scene bounds + symmetric export padding (mirrors export.ts getCanvasSize). */
function exportBounds(elements: readonly NonDeletedExcalidrawElement[]): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const [minX, minY, maxX, maxY] = getCommonBounds(elements);
  return {
    minX,
    minY,
    width: maxX - minX + DEFAULT_EXPORT_PADDING * 2,
    height: maxY - minY + DEFAULT_EXPORT_PADDING * 2,
  };
}

/** Render the scene to a fresh canvas sized to its content (the PNG source). */
export function exportToCanvas(
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  imageCache: ExportImageCache,
  opts: ExportOpts,
): HTMLCanvasElement {
  const scale = opts.scale ?? 2;
  const theme = opts.theme ?? THEME.LIGHT;
  const { minX, minY, width, height } = exportBounds(elements);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const elementsMap = arrayToMap(elements) as RenderableElementsMap;

  renderStaticScene(
    {
      canvas,
      rc: rough.canvas(canvas),
      scale,
      elementsMap,
      allElementsMap: elementsMap as unknown as NonDeletedSceneElementsMap,
      visibleElements: elements,
      appState: {
        ...appState,
        width,
        height,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX: -minX + DEFAULT_EXPORT_PADDING,
        scrollY: -minY + DEFAULT_EXPORT_PADDING,
        zoom: { value: 1 as NormalizedZoomValue },
        shouldCacheIgnoreZoom: false,
        viewBackgroundColor: opts.exportBackground
          ? opts.viewBackgroundColor
          : null,
        theme,
      } as unknown as StaticCanvasAppState,
      renderConfig: {
        canvasBackgroundColor: opts.viewBackgroundColor,
        imageCache,
        renderGrid: false,
        isExporting: true,
        embedsValidationStatus: new Map(),
        elementsPendingErasure: new Set(),
        pendingFlowchartNodes: null,
        theme,
      },
    },
    false,
  );

  return canvas;
}

/** Render the scene to an `<svg>` element (the SVG source; fonts not inlined). */
export function exportToSvg(
  elements: readonly NonDeletedExcalidrawElement[],
  opts: ExportOpts,
): SVGSVGElement {
  const scale = opts.scale ?? 1;
  const theme = opts.theme ?? THEME.LIGHT;
  const { minX, minY, width, height } = exportBounds(elements);
  const offsetX = -minX + DEFAULT_EXPORT_PADDING;
  const offsetY = -minY + DEFAULT_EXPORT_PADDING;

  const svgRoot = document.createElementNS(SVG_NS, "svg");
  svgRoot.setAttribute("version", "1.1");
  svgRoot.setAttribute("xmlns", SVG_NS);
  svgRoot.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgRoot.setAttribute("width", `${width * scale}`);
  svgRoot.setAttribute("height", `${height * scale}`);

  if (opts.exportBackground && opts.viewBackgroundColor) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", `${width}`);
    rect.setAttribute("height", `${height}`);
    rect.setAttribute("fill", opts.viewBackgroundColor);
    svgRoot.appendChild(rect);
  }

  // renderSceneToSvg wants ordered, index-valid elements + their map
  const ordered = syncInvalidIndices(
    elements as readonly OrderedExcalidrawElement[],
  ) as NonDeletedExcalidrawElement[];
  const elementsMap = arrayToMap(ordered) as RenderableElementsMap;

  renderSceneToSvg(ordered, elementsMap, rough.svg(svgRoot), svgRoot, {}, {
    offsetX,
    offsetY,
    isExporting: true,
    exportWithDarkMode: theme === THEME.DARK,
    renderEmbeddables: false,
    frameRendering: FRAME_RENDERING,
    canvasBackgroundColor: opts.viewBackgroundColor,
    embedsValidationStatus: new Map(),
    reuseImages: true,
    theme,
  });

  return svgRoot;
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
