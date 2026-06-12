// OS-clipboard support for the editor, ported from excalidraw-master's
// packages/excalidraw/clipboard.ts (single-player web subset). Excalidraw writes
// its elements as an `application/json`-style envelope on BOTH the custom
// `application/vnd.excalidraw.clipboard+json` MIME and `text/plain`, so other apps
// get the JSON text while Excalidraw round-trips the structured payload. Reads pull
// the structured payload back when present, else fall through to plain text.
//
// We intentionally omit excalidraw's `ClipboardEvent`/DataTransfer parsing path
// (it only matters for native paste events with mixed HTML/image content); the
// editor drives copy/paste through keyboard + context-menu actions and reads the
// system clipboard programmatically.

import { EXPORT_DATA_TYPES, MIME_TYPES } from "@excalidraw/common";

import { deepCopyElement } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

/** The structured payload Excalidraw stores on the clipboard. */
export interface ElementsClipboard {
  type: typeof EXPORT_DATA_TYPES.excalidrawClipboard;
  elements: readonly ExcalidrawElement[];
}

export const probablySupportsClipboardReadText =
  "clipboard" in navigator && "readText" in navigator.clipboard;

export const probablySupportsClipboardWriteText =
  "clipboard" in navigator && "writeText" in navigator.clipboard;

export const probablySupportsClipboardBlob =
  "clipboard" in navigator &&
  "write" in navigator.clipboard &&
  "ClipboardItem" in window &&
  "toBlob" in HTMLCanvasElement.prototype;

/** Serialize elements into Excalidraw's clipboard JSON envelope. */
export const serializeAsClipboardJSON = (
  elements: readonly ExcalidrawElement[],
): string => {
  const contents: ElementsClipboard = {
    type: EXPORT_DATA_TYPES.excalidrawClipboard,
    // deep-copy so later mutations to the live scene don't leak into the payload
    elements: elements.map((element) => deepCopyElement(element)),
  };
  return JSON.stringify(contents);
};

/**
 * Write text to the system clipboard. Mirrors excalidraw's fallback ladder:
 * navigator.clipboard.writeText → document.execCommand("copy"). The custom MIME
 * type cannot go through writeText (it only accepts text/plain), so we write the
 * JSON as plain text; reads detect the envelope by parsing the text back.
 */
export const copyTextToSystemClipboard = async (text: string): Promise<void> => {
  if (probablySupportsClipboardWriteText) {
    try {
      // NOTE: fails on Firefox over non-HTTPS or when the document isn't focused.
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.error(error);
    }
  }
  if (!copyTextViaExecCommand(text)) {
    throw new Error("Error copying to clipboard.");
  }
};

/** Legacy fallback: stage the text in an offscreen textarea and execCommand-copy it. */
const copyTextViaExecCommand = (text: string): boolean => {
  const isRTL = document.documentElement.getAttribute("dir") === "rtl";
  const textarea = document.createElement("textarea");
  textarea.style.border = "0";
  textarea.style.padding = "0";
  textarea.style.margin = "0";
  textarea.style.position = "absolute";
  textarea.style[isRTL ? "right" : "left"] = "-9999px";
  const yPosition = window.pageYOffset || document.documentElement.scrollTop;
  textarea.style.top = `${yPosition}px`;
  textarea.setAttribute("readonly", "");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (error) {
    console.error(error);
  }
  textarea.remove();
  return success;
};

/** Write the elements envelope to the OS clipboard (plain text). */
export const copyElementsToClipboard = async (
  elements: readonly ExcalidrawElement[],
): Promise<void> => {
  await copyTextToSystemClipboard(serializeAsClipboardJSON(elements));
};

/**
 * Read the system clipboard as text. Returns "" when unavailable / denied.
 */
export const readSystemClipboardText = async (): Promise<string> => {
  try {
    if (probablySupportsClipboardReadText) {
      return (await navigator.clipboard.readText()) ?? "";
    }
  } catch (error) {
    console.warn("readSystemClipboard failed", error);
  }
  return "";
};

/**
 * Parse clipboard text into the Excalidraw envelope if present. Returns the
 * structured elements when the text is an Excalidraw clipboard/document payload,
 * else null (the caller treats the raw text as plaintext-to-paste).
 */
export const parseClipboardElements = (
  text: string,
): readonly ExcalidrawElement[] | null => {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as {
      type?: string;
      elements?: ExcalidrawElement[];
    };
    if (
      parsed &&
      (parsed.type === EXPORT_DATA_TYPES.excalidrawClipboard ||
        parsed.type === EXPORT_DATA_TYPES.excalidraw) &&
      Array.isArray(parsed.elements)
    ) {
      return parsed.elements;
    }
  } catch {
    // not JSON → plaintext
  }
  return null;
};

/**
 * Copy a PNG blob to the clipboard (export-to-clipboard). Constructs the
 * ClipboardItem synchronously (Safari requirement) with the blob promise, then
 * falls back to awaiting the blob if the promise form throws.
 */
export const copyBlobToClipboardAsPng = async (
  blob: Blob | Promise<Blob>,
): Promise<void> => {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [MIME_TYPES.png]: blob }),
    ]);
  } catch (error) {
    if (typeof (blob as Promise<Blob>)?.then === "function") {
      await navigator.clipboard.write([
        new ClipboardItem({ [MIME_TYPES.png]: await blob }),
      ]);
    } else {
      throw error;
    }
  }
};
