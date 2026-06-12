// localStorage-backed library store for the web editor. Excalidraw persists the
// library to IndexedDB; for the single-player web build we mirror the existing
// web-storage.ts localStorage approach (the library is small — element groups, no
// binary files). A LibraryItem is { id, status, elements, created }.

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { LibraryItem, LibraryItems } from "@excalidraw/excalidraw/types";

const LIBRARY_KEY = "excalidraw-library";

const hasLocalStorage = (): boolean => typeof localStorage !== "undefined";

/** Read the persisted library (oldest→newest). Returns [] on absence / parse error. */
export const loadLibrary = (): LibraryItems => {
  if (!hasLocalStorage()) {
    return [];
  }
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as LibraryItems;
    }
  } catch {
    // corrupt → start fresh
  }
  return [];
};

/** Persist the full library. */
export const saveLibrary = (items: LibraryItems): void => {
  if (!hasLocalStorage()) {
    return;
  }
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
  } catch {
    // quota / serialization failure → silently drop (non-critical)
  }
};

/** Build a LibraryItem from a set of elements (deep-copied, ids preserved). */
export const makeLibraryItem = (
  elements: readonly ExcalidrawElement[],
  id: string,
  created: number,
): LibraryItem => ({
  id,
  status: "unpublished",
  elements: elements.map((e) => structuredClone(e)) as LibraryItem["elements"],
  created,
});
