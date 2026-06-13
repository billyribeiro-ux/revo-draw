import {
  ALLOWED_PASTE_MIME_TYPES,
  EXPORT_DATA_TYPES,
  MIME_TYPES,
  arrayToMap,
  EVENT,
} from "@excalidraw/common";

import {
  deepCopyElement,
  getContainingFrame,
  isFrameLikeElement,
  isInitializedImageElement,
  mutateElement,
} from "@excalidraw/element";

import type { IMAGE_MIME_TYPES, STRING_MIME_TYPES } from "@excalidraw/common";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { ValueOf } from "@excalidraw/common/utility-types";

import type { BinaryFiles } from "./types";

type ElementsClipboard = {
  type: typeof EXPORT_DATA_TYPES.excalidrawClipboard;
  elements: readonly NonDeletedExcalidrawElement[];
  files: BinaryFiles | undefined;
};

export type PastedMixedContent = { type: "text" | "imageUrl"; value: string }[];

export interface ClipboardData {
  elements?: readonly ExcalidrawElement[];
  files?: BinaryFiles;
  text?: string;
  mixedContent?: PastedMixedContent;
  errorMessage?: string;
  programmaticAPI?: boolean;
}

type AllowedPasteMimeTypes = (typeof ALLOWED_PASTE_MIME_TYPES)[number];

type ParsedDataTransferText = {
  kind: "string";
  type: ValueOf<typeof STRING_MIME_TYPES>;
  value: string;
};

export type ParsedDataTransferFile = {
  kind: "file";
  type: ValueOf<typeof IMAGE_MIME_TYPES>;
  value: File;
};

type ParsedDataTransferItem = ParsedDataTransferText | ParsedDataTransferFile;

export type ParsedDataTranferList = ParsedDataTransferItem[] & {
  files: ParsedDataTransferFile[];
};

export const probablySupportsClipboardReadText =
  typeof navigator !== "undefined" &&
  "clipboard" in navigator &&
  "readText" in navigator.clipboard;

export const probablySupportsClipboardWriteText =
  typeof navigator !== "undefined" &&
  "clipboard" in navigator &&
  "writeText" in navigator.clipboard;

export const probablySupportsClipboardBlob =
  typeof navigator !== "undefined" &&
  typeof window !== "undefined" &&
  "clipboard" in navigator &&
  "write" in navigator.clipboard &&
  "ClipboardItem" in window &&
  typeof HTMLCanvasElement !== "undefined" &&
  "toBlob" in HTMLCanvasElement.prototype;

const clipboardContainsElements = (
  contents: unknown,
): contents is { elements: ExcalidrawElement[]; files?: BinaryFiles } => {
  const parsed = contents as { type?: string; elements?: unknown };
  return (
    (parsed?.type === EXPORT_DATA_TYPES.excalidraw ||
      parsed?.type === EXPORT_DATA_TYPES.excalidrawClipboard ||
      parsed?.type === EXPORT_DATA_TYPES.excalidrawClipboardWithAPI) &&
    Array.isArray(parsed.elements)
  );
};

export const createPasteEvent = ({
  types,
  files,
}: {
  types?: { [key in AllowedPasteMimeTypes]?: string | File };
  files?: File[];
}) => {
  if (typeof ClipboardEvent === "undefined" || typeof DataTransfer === "undefined") {
    throw new Error("ClipboardEvent/DataTransfer are not available.");
  }

  const event = new ClipboardEvent(EVENT.PASTE, {
    clipboardData: new DataTransfer(),
  });

  if (types) {
    for (const [type, value] of Object.entries(types)) {
      if (typeof value !== "string") {
        files = files || [];
        files.push(value);
        continue;
      }
      event.clipboardData?.items.add(value, type);
    }
  }

  if (files) {
    for (const file of files) {
      event.clipboardData?.items.add(file);
    }
  }

  return event;
};

export const serializeAsClipboardJSON = ({
  elements,
  files,
}: {
  elements: readonly NonDeletedExcalidrawElement[];
  files: BinaryFiles | null;
}) => {
  const elementsMap = arrayToMap(elements);
  const framesToCopy = new Set(
    elements.filter((element) => isFrameLikeElement(element)),
  );
  let foundFile = false;

  const serializedFiles = elements.reduce((acc, element) => {
    if (isInitializedImageElement(element)) {
      foundFile = true;
      if (files && files[element.fileId]) {
        acc[element.fileId] = files[element.fileId];
      }
    }
    return acc;
  }, {} as BinaryFiles);

  if (foundFile && !files) {
    console.warn(
      "copyToClipboard: attempting to copy file element(s) without files.",
    );
  }

  const contents: ElementsClipboard = {
    type: EXPORT_DATA_TYPES.excalidrawClipboard,
    elements: elements.map((element) => {
      if (
        getContainingFrame(element, elementsMap) &&
        !framesToCopy.has(getContainingFrame(element, elementsMap)!)
      ) {
        const copiedElement = deepCopyElement(element);
        mutateElement(copiedElement, elementsMap, {
          frameId: null,
        });
        return copiedElement;
      }

      return element;
    }),
    files: files ? serializedFiles : undefined,
  };

  return JSON.stringify(contents);
};

export const copyToClipboard = async (
  elements: readonly NonDeletedExcalidrawElement[],
  files: BinaryFiles | null,
  clipboardEvent?: ClipboardEvent | null,
) => {
  const json = serializeAsClipboardJSON({ elements, files });

  await copyTextToSystemClipboard(
    {
      [MIME_TYPES.excalidrawClipboard]: json,
      [MIME_TYPES.text]: json,
    },
    clipboardEvent,
  );
};

export const readSystemClipboard = async (): Promise<ClipboardData> => {
  if (
    typeof navigator === "undefined" ||
    !("clipboard" in navigator) ||
    !("readText" in navigator.clipboard)
  ) {
    return {};
  }

  const text = await navigator.clipboard.readText();
  return parseClipboard(text);
};

const parseHTMLTree = (el: ChildNode): PastedMixedContent => {
  let result: PastedMixedContent = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      const text = node.textContent?.trim();
      if (text) {
        result.push({ type: "text", value: text });
      }
    } else if (node instanceof HTMLImageElement) {
      const url = node.getAttribute("src");
      if (url && url.startsWith("http")) {
        result.push({ type: "imageUrl", value: url });
      }
    } else {
      result = result.concat(parseHTMLTree(node));
    }
  }
  return result;
};

export const parseDataTransferEventMimeTypes = (
  dataTransfer: DataTransfer,
): ParsedDataTranferList => {
  const parsed = [] as unknown as ParsedDataTranferList;
  parsed.files = [];

  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file && (Object.values(MIME_TYPES) as string[]).includes(file.type)) {
        const parsedFile = {
          kind: "file",
          type: file.type as ValueOf<typeof IMAGE_MIME_TYPES>,
          value: file,
        } as const;
        parsed.push(parsedFile);
        parsed.files.push(parsedFile);
      }
      continue;
    }

    const value = dataTransfer.getData(item.type);
    if (value) {
      parsed.push({
        kind: "string",
        type: item.type as ValueOf<typeof STRING_MIME_TYPES>,
        value,
      });
    }
  }

  return parsed;
};

export const parseDataTransferEvent = async (
  event: ClipboardEvent | DragEvent,
): Promise<ClipboardData> => {
  const dataTransfer =
    "clipboardData" in event ? event.clipboardData : event.dataTransfer;
  if (!dataTransfer) {
    return {};
  }

  const parsed = parseDataTransferEventMimeTypes(dataTransfer);
  const file = parsed.files[0]?.value;
  if (file) {
    return { files: { [file.name]: file as unknown as BinaryFiles[string] } };
  }

  const excalidrawData = parsed.find(
    (item): item is ParsedDataTransferText =>
      item.kind === "string" && item.type === MIME_TYPES.excalidrawClipboard,
  );
  if (excalidrawData) {
    return parseClipboard(excalidrawData.value);
  }

  const htmlData = parsed.find(
    (item): item is ParsedDataTransferText =>
      item.kind === "string" && item.type === MIME_TYPES.html,
  );
  if (htmlData && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(htmlData.value, MIME_TYPES.html);
    const mixedContent = parseHTMLTree(doc.body);
    if (mixedContent.length) {
      return { mixedContent };
    }
  }

  const textData = parsed.find(
    (item): item is ParsedDataTransferText =>
      item.kind === "string" && item.type === MIME_TYPES.text,
  );
  return textData ? parseClipboard(textData.value) : {};
};

export const parseClipboard = async (
  clipboardData: string,
): Promise<ClipboardData> => {
  try {
    const contents = JSON.parse(clipboardData) as unknown;
    if (clipboardContainsElements(contents)) {
      return {
        elements: contents.elements,
        files: contents.files,
        programmaticAPI:
          (contents as { type?: string }).type ===
          EXPORT_DATA_TYPES.excalidrawClipboardWithAPI,
      };
    }
  } catch {
    // plain text
  }

  return { text: clipboardData };
};

export const copyBlobToClipboardAsPng = async (blob: Blob | Promise<Blob>) => {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Clipboard blob writes are not supported.");
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [MIME_TYPES.png]: blob }),
    ]);
  } catch (error) {
    if (typeof (blob as Promise<Blob>).then === "function") {
      await navigator.clipboard.write([
        new ClipboardItem({ [MIME_TYPES.png]: await blob }),
      ]);
    } else {
      throw error;
    }
  }
};

export const copyTextToSystemClipboard = async <
  T extends string | Record<string, string>,
>(
  text: T,
  clipboardEvent?: ClipboardEvent | null,
): Promise<void> => {
  const plainText = typeof text === "string" ? text : text[MIME_TYPES.text];

  if (clipboardEvent?.clipboardData) {
    clipboardEvent.preventDefault();
    if (typeof text === "string") {
      clipboardEvent.clipboardData.setData(MIME_TYPES.text, text);
    } else {
      for (const [mimeType, value] of Object.entries(text)) {
        clipboardEvent.clipboardData.setData(mimeType, value);
      }
    }
    return;
  }

  if (probablySupportsClipboardWriteText) {
    await navigator.clipboard.writeText(plainText);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("System clipboard is not available.");
  }

  const textarea = document.createElement("textarea");
  textarea.style.border = "0";
  textarea.style.padding = "0";
  textarea.style.margin = "0";
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  textarea.setAttribute("readonly", "");
  textarea.value = plainText;
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand("copy");
  textarea.remove();
  if (!success) {
    throw new Error("Error copying to clipboard.");
  }
};

export const isClipboardEvent = (
  event: Event,
): event is ClipboardEvent | DragEvent => {
  return "clipboardData" in event || "dataTransfer" in event;
};
