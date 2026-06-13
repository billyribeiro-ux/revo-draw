/**
 * Helpers for the image tool — porting the relevant slices of Excalidraw's
 * `packages/element/src/image.ts`, `newElement.ts` (`newImageElement`) and
 * `data/blob.ts` into a small, self-contained module.
 *
 * `loadImageFile` reads a `File` into a data URL, decodes it into an
 * `HTMLImageElement` to recover its natural dimensions, and mints a `FileId`.
 * `createImageElement` builds a "saved" `ExcalidrawImageElement` via the
 * vendored `newImageElement` factory. `makeImageCache` produces the map shape
 * expected by `renderConfig.imageCache`.
 */

import { newImageElement } from "@excalidraw/element";

import type {
  ExcalidrawImageElement,
  FileId,
} from "@excalidraw/element/types";

import type { DataURL } from "@excalidraw/excalidraw/types";

/** Cache entry shape consumed by `renderConfig.imageCache`. */
export type ImageCacheEntry = { image: HTMLImageElement; mimeType: string };

/** Read a `File` (or `Blob`) as a data URL via `FileReader`. */
const fileToDataURL = (file: Blob): Promise<DataURL> =>
  new Promise<DataURL>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      if (typeof result === "string") {
        resolve(result as DataURL);
      } else {
        reject(new Error("Failed to read file as a data URL"));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

/** Decode a data URL into an `HTMLImageElement`, resolving once loaded. */
const dataURLToImage = (dataURL: DataURL): Promise<HTMLImageElement> =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Cannot decode image outside of a DOM environment"));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (error) =>
      reject(error instanceof Error ? error : new Error("Failed to load image"));
    image.src = dataURL;
  });

/**
 * Read an image `File`, decode it, and return everything the image tool needs:
 * a freshly-minted `fileId`, the `dataURL`, the source `mimeType`, the natural
 * `width`/`height`, and the decoded `HTMLImageElement`.
 */
export const loadImageFile = async (
  file: File,
): Promise<{
  fileId: FileId;
  dataURL: DataURL;
  mimeType: string;
  width: number;
  height: number;
  image: HTMLImageElement;
}> => {
  const dataURL = await fileToDataURL(file);
  const image = await dataURLToImage(dataURL);
  const fileId = crypto.randomUUID() as string as FileId;

  return {
    fileId,
    dataURL,
    mimeType: file.type || "image/png",
    width: image.naturalWidth,
    height: image.naturalHeight,
    image,
  };
};

/**
 * Build a "saved" `ExcalidrawImageElement` bound to an already-loaded `fileId`.
 * Stroke/background default to `"transparent"` (matching the source factory).
 * `customData` is passed through so callers (e.g. the icon feature) can tag the
 * element — the icon path stores `{ kind: 'icon', iconName, iconColor }` there.
 */
export const createImageElement = (opts: {
  fileId: FileId;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  customData?: Record<string, unknown>;
}): ExcalidrawImageElement =>
  newImageElement({
    type: "image",
    status: "saved",
    fileId: opts.fileId,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    strokeColor: opts.strokeColor ?? "transparent",
    backgroundColor: opts.backgroundColor ?? "transparent",
    customData: opts.customData,
  });

/** Create the empty image cache map passed to `renderConfig.imageCache`. */
export const makeImageCache = (): Map<FileId, ImageCacheEntry> =>
  new Map<FileId, ImageCacheEntry>();
