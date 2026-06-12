// Save / open `.excalidraw` files, ported from excalidraw-master's data/json.ts.
// Excalidraw uses the `browser-fs-access` dependency (fileSave/fileOpen) to bridge
// the File System Access API with a download/input fallback; we inline a
// dependency-free equivalent (the FS Access API when present, else <a download> /
// <input type=file>) to keep the pinned dep set unchanged.
//
// The serialized envelope matches Excalidraw byte-for-byte: { type:"excalidraw",
// version:2, source, elements, appState:cleanAppStateForExport(...), files }.

import { EXPORT_DATA_TYPES, getExportSource, VERSIONS } from "@excalidraw/common";

import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

const MIME_EXCALIDRAW = "application/vnd.excalidraw+json";

/** The on-disk envelope (Excalidraw's ExportedDataState, files omitted). */
export interface ExportedExcalidrawData {
  type: string;
  version: number;
  source: string;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files?: undefined;
}

/** Serialize a scene to the Excalidraw JSON string (2-space indented, like upstream). */
export const serializeAsJSON = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
): string => {
  const data: ExportedExcalidrawData = {
    type: EXPORT_DATA_TYPES.excalidraw,
    version: VERSIONS.excalidraw,
    source: getExportSource(),
    elements,
    appState: cleanAppStateForExport(appState),
    files: undefined,
  };
  return JSON.stringify(data, null, 2);
};

/** Validate a parsed object as an Excalidraw document (Excalidraw isValidExcalidrawData). */
export const isValidExcalidrawData = (data?: {
  type?: unknown;
  elements?: unknown;
  appState?: unknown;
}): boolean =>
  data?.type === EXPORT_DATA_TYPES.excalidraw &&
  (!data.elements ||
    (Array.isArray(data.elements) &&
      (!data.appState || typeof data.appState === "object")));

type FsWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>;
};

/**
 * Save the scene to a `.excalidraw` file. Uses the File System Access API when
 * available (native Save dialog) and falls back to an `<a download>` blob link.
 * Returns true on success, false if the user cancelled.
 */
export const saveAsExcalidraw = async (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  name = "drawing.excalidraw",
): Promise<boolean> => {
  const json = serializeAsJSON(elements, appState);
  const blob = new Blob([json], { type: MIME_EXCALIDRAW });
  const fsWindow = window as FsWindow;

  if (fsWindow.showSaveFilePicker) {
    try {
      const handle = await fsWindow.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "Excalidraw file",
            accept: { [MIME_EXCALIDRAW]: [".excalidraw"] },
          },
        ],
      });
      const writable = await (
        handle as unknown as {
          createWritable: () => Promise<{
            write: (b: Blob) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }
      ).createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      // AbortError = user cancelled the picker; anything else → fall back to download
      if ((error as DOMException)?.name === "AbortError") {
        return false;
      }
    }
  }

  // fallback: trigger a download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
};

/** A loaded scene: validated elements + the persisted (partial) app-state. */
export interface LoadedScene {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
}

/** Parse a `.excalidraw` JSON string into a validated scene, or throw. */
export const parseExcalidrawJSON = (text: string): LoadedScene => {
  const data = JSON.parse(text);
  if (!isValidExcalidrawData(data)) {
    throw new Error("Not a valid Excalidraw file.");
  }
  return {
    elements: (data.elements ?? []) as ExcalidrawElement[],
    appState: (data.appState ?? {}) as Partial<AppState>,
  };
};

/**
 * Open a `.excalidraw` file via the File System Access API (or an `<input
 * type=file>` fallback), parse + validate it. Returns null if the user cancelled.
 */
export const openExcalidrawFile = async (): Promise<LoadedScene | null> => {
  const fsWindow = window as FsWindow;

  if (fsWindow.showOpenFilePicker) {
    try {
      const [handle] = await fsWindow.showOpenFilePicker({
        types: [
          {
            description: "Excalidraw file",
            accept: { [MIME_EXCALIDRAW]: [".excalidraw"], "application/json": [".json"] },
          },
        ],
        multiple: false,
      });
      const file = await (
        handle as unknown as { getFile: () => Promise<File> }
      ).getFile();
      return parseExcalidrawJSON(await file.text());
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return null;
      }
      // fall through to the input fallback on other errors
    }
  }

  return new Promise<LoadedScene | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".excalidraw,application/json";
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve(parseExcalidrawJSON(await file.text()));
      } catch (error) {
        reject(error);
      }
    });
    // cancel detection isn't reliable cross-browser; if no change fires, the
    // promise simply stays pending until the next open — acceptable for the fallback.
    document.body.appendChild(input);
    input.click();
  });
};
