import {
  URL_HASH_KEYS,
  URL_QUERY_KEYS,
  arrayToMap,
  cloneJSON,
  randomId,
} from "@excalidraw/common";

import { getCommonBoundingBox } from "@excalidraw/element";
import { hashElementsVersion, hashString } from "@excalidraw/element";

import type { ExcalidrawElement, NonDeleted } from "@excalidraw/element/types";

import type { MaybePromise } from "@excalidraw/common/utility-types";

import type {
  LibraryItem,
  LibraryItems,
  LibraryItemsSource,
  LibraryItems_anyVersion,
} from "../types";

const ALLOWED_LIBRARY_URLS = [
  "excalidraw.com",
  "raw.githubusercontent.com/excalidraw/excalidraw-libraries",
];

type LibraryUpdate = {
  deletedItems: Map<LibraryItem["id"], LibraryItem>;
  addedItems: Map<LibraryItem["id"], LibraryItem>;
  updatedItems: Map<LibraryItem["id"], LibraryItem>;
};

export type LibraryPersistedData = { libraryItems: LibraryItems };

export type LibraryAdatapterSource = "load" | "save";

export interface LibraryPersistenceAdapter {
  load(metadata: {
    source: LibraryAdatapterSource;
  }): MaybePromise<{ libraryItems: LibraryItems_anyVersion } | null>;
  save(libraryData: LibraryPersistedData): MaybePromise<void>;
}

export interface LibraryMigrationAdapter {
  load(): MaybePromise<{ libraryItems: LibraryItems_anyVersion } | null>;
  clear(): MaybePromise<void>;
}

const cloneLibraryItems = (libraryItems: LibraryItems): LibraryItems =>
  cloneJSON(libraryItems);

const isLibraryItem = (
  item: LibraryItems_anyVersion[number],
): item is LibraryItem =>
  typeof item === "object" &&
  item !== null &&
  !Array.isArray(item) &&
  "elements" in item;

const restoreLibraryItems = (
  libraryItems: LibraryItems_anyVersion,
  defaultStatus: LibraryItem["status"],
): LibraryItems =>
  libraryItems.map((item) => {
    if (isLibraryItem(item)) {
      return {
        ...item,
        id: item.id || randomId(),
        status: item.status || defaultStatus,
        created: item.created || Date.now(),
      };
    }
    return {
      id: randomId(),
      status: defaultStatus,
      elements: item as readonly NonDeleted<ExcalidrawElement>[],
      created: Date.now(),
    };
  });

const isUniqueItem = (
  existingLibraryItems: LibraryItems,
  targetLibraryItem: LibraryItem,
) => {
  return !existingLibraryItems.find((libraryItem) => {
    if (libraryItem.elements.length !== targetLibraryItem.elements.length) {
      return false;
    }

    return libraryItem.elements.every((libItemExcalidrawItem, idx) => {
      return (
        libItemExcalidrawItem.id === targetLibraryItem.elements[idx].id &&
        libItemExcalidrawItem.versionNonce ===
          targetLibraryItem.elements[idx].versionNonce
      );
    });
  });
};

export const mergeLibraryItems = (
  localItems: LibraryItems,
  otherItems: LibraryItems,
): LibraryItems => {
  const newItems = [];
  for (const item of otherItems) {
    if (isUniqueItem(localItems, item)) {
      newItems.push(item);
    }
  }

  return [...newItems, ...localItems];
};

const createLibraryUpdate = (
  prevLibraryItems: LibraryItems,
  nextLibraryItems: LibraryItems,
): LibraryUpdate => {
  const nextItemsMap = arrayToMap(nextLibraryItems);

  const update: LibraryUpdate = {
    deletedItems: new Map<LibraryItem["id"], LibraryItem>(),
    addedItems: new Map<LibraryItem["id"], LibraryItem>(),
    updatedItems: new Map<LibraryItem["id"], LibraryItem>(),
  };

  for (const item of prevLibraryItems) {
    if (!nextItemsMap.has(item.id)) {
      update.deletedItems.set(item.id, item);
    }
  }

  const prevItemsMap = arrayToMap(prevLibraryItems);

  for (const item of nextLibraryItems) {
    const prevItem = prevItemsMap.get(item.id);
    if (!prevItem) {
      update.addedItems.set(item.id, item);
    } else if (getLibraryItemHash(prevItem) !== getLibraryItemHash(item)) {
      update.updatedItems.set(item.id, item);
    }
  }

  return update;
};

type LibraryHost = {
  props?: { onLibraryChange?: (libraryItems: LibraryItems) => void | Promise<unknown> };
  focusContainer?: () => void;
};

class Library {
  private currLibraryItems: LibraryItems = [];
  private prevLibraryItems = cloneLibraryItems(this.currLibraryItems);
  private updateQueue: Promise<LibraryItems>[] = [];

  constructor(private app?: LibraryHost) {}

  private getLastUpdateTask = (): Promise<LibraryItems> | undefined => {
    return this.updateQueue[this.updateQueue.length - 1];
  };

  private notifyListeners = () => {
    if (this.updateQueue.length > 0) {
      return;
    }
    try {
      const prevLibraryItems = this.prevLibraryItems;
      this.prevLibraryItems = cloneLibraryItems(this.currLibraryItems);
      const nextLibraryItems = cloneLibraryItems(this.currLibraryItems);
      createLibraryUpdate(prevLibraryItems, nextLibraryItems);
      void this.app?.props?.onLibraryChange?.(nextLibraryItems);
    } catch (error) {
      console.error(error);
    }
  };

  destroy = () => {
    this.updateQueue = [];
    this.currLibraryItems = [];
    this.prevLibraryItems = [];
  };

  resetLibrary = () => {
    return this.setLibrary([]);
  };

  getLatestLibrary = (): Promise<LibraryItems> => {
    return new Promise(async (resolve) => {
      try {
        const libraryItems = await (this.getLastUpdateTask() ||
          this.currLibraryItems);
        if (this.updateQueue.length > 0) {
          resolve(this.getLatestLibrary());
        } else {
          resolve(cloneLibraryItems(libraryItems));
        }
      } catch {
        resolve(this.currLibraryItems);
      }
    });
  };

  updateLibrary = async ({
    libraryItems,
    prompt = false,
    merge = false,
    defaultStatus = "unpublished",
  }: {
    libraryItems: LibraryItemsSource;
    merge?: boolean;
    prompt?: boolean;
    openLibraryMenu?: boolean;
    defaultStatus?: "unpublished" | "published";
  }): Promise<LibraryItems> => {
    return this.setLibrary(async () => {
      const source = await (typeof libraryItems === "function" &&
      !(typeof Blob !== "undefined" && libraryItems instanceof Blob)
        ? libraryItems(this.currLibraryItems)
        : libraryItems);

      const nextItems = restoreLibraryItems(
        typeof Blob !== "undefined" && source instanceof Blob
          ? JSON.parse(await source.text()).libraryItems || []
          : source,
        defaultStatus,
      );

      if (
        prompt &&
        typeof window !== "undefined" &&
        !window.confirm(`Add ${nextItems.length} item(s) to the library?`)
      ) {
        const error = new Error("Library update aborted by user");
        error.name = "AbortError";
        throw error;
      }

      if (prompt) {
        this.app?.focusContainer?.();
      }

      return merge ? mergeLibraryItems(this.currLibraryItems, nextItems) : nextItems;
    });
  };

  setLibrary = (
    libraryItems:
      | LibraryItems
      | Promise<LibraryItems>
      | ((
          latestLibraryItems: LibraryItems,
        ) => LibraryItems | Promise<LibraryItems>),
  ): Promise<LibraryItems> => {
    const task = new Promise<LibraryItems>(async (resolve, reject) => {
      try {
        await this.getLastUpdateTask();

        const nextLibraryItems =
          typeof libraryItems === "function"
            ? libraryItems(this.currLibraryItems)
            : libraryItems;

        this.currLibraryItems = cloneLibraryItems(await nextLibraryItems);

        resolve(this.currLibraryItems);
      } catch (error) {
        reject(error);
      }
    })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          console.warn("Library update aborted by user");
          return this.currLibraryItems;
        }
        throw error;
      })
      .finally(() => {
        this.updateQueue = this.updateQueue.filter((_task) => _task !== task);
        this.notifyListeners();
      });

    this.updateQueue.push(task);
    this.notifyListeners();

    return task;
  };
}

export const distributeLibraryItemsOnSquareGrid = (
  libraryItems: LibraryItems,
): ExcalidrawElement[] => {
  const padding = 50;
  const itemsPerRow = Math.ceil(Math.sqrt(libraryItems.length));

  const resElements: ExcalidrawElement[] = [];

  const getMaxHeightPerRow = (row: number) => {
    const maxHeight = libraryItems
      .slice(row * itemsPerRow, row * itemsPerRow + itemsPerRow)
      .reduce((acc, item) => {
        const { height } = getCommonBoundingBox(item.elements);
        return Math.max(acc, height);
      }, 0);
    return maxHeight;
  };

  const getMaxWidthPerCol = (targetCol: number) => {
    let index = 0;
    let currCol = 0;
    let maxWidth = 0;
    for (const item of libraryItems) {
      if (index % itemsPerRow === 0) {
        currCol = 0;
      }
      if (currCol === targetCol) {
        const { width } = getCommonBoundingBox(item.elements);
        maxWidth = Math.max(maxWidth, width);
      }
      index++;
      currCol++;
    }
    return maxWidth;
  };

  let colOffsetX = 0;
  let rowOffsetY = 0;

  let maxHeightCurrRow = 0;
  let maxWidthCurrCol = 0;

  let index = 0;
  let col = 0;
  let row = 0;

  for (const item of libraryItems) {
    if (index && index % itemsPerRow === 0) {
      rowOffsetY += maxHeightCurrRow + padding;
      colOffsetX = 0;
      col = 0;
      row++;
    }

    if (col === 0) {
      maxHeightCurrRow = getMaxHeightPerRow(row);
    }
    maxWidthCurrCol = getMaxWidthPerCol(col);

    const { minX, minY, width, height } = getCommonBoundingBox(item.elements);
    const offsetCenterX = (maxWidthCurrCol - width) / 2;
    const offsetCenterY = (maxHeightCurrRow - height) / 2;
    resElements.push(
      ...item.elements.map((element) => ({
        ...element,
        x: element.x + colOffsetX + offsetCenterX - minX,
        y: element.y + rowOffsetY + offsetCenterY - minY,
      })),
    );
    colOffsetX += maxWidthCurrCol + padding;
    index++;
    col++;
  }

  return resElements;
};

export const validateLibraryUrl = (
  libraryUrl: string,
  validator:
    | ((libraryUrl: string) => boolean)
    | string[] = ALLOWED_LIBRARY_URLS,
) => {
  if (
    typeof validator === "function"
      ? validator(libraryUrl)
      : validator.some((allowedUrlDef) => {
          const allowedUrl = new URL(
            `https://${allowedUrlDef.replace(/^https?:\/\//, "")}`,
          );

          const { hostname, pathname } = new URL(libraryUrl);

          return (
            new RegExp(`(^|\\.)${allowedUrl.hostname}$`).test(hostname) &&
            new RegExp(
              `^${allowedUrl.pathname.replace(/\/+$/, "")}(/+|$)`,
            ).test(pathname)
          );
        })
  ) {
    return true;
  }

  throw new Error(`Invalid or disallowed library URL: "${libraryUrl}"`);
};

export const parseLibraryTokensFromUrl = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const libraryUrl =
    new URLSearchParams(window.location.hash.slice(1)).get(
      URL_HASH_KEYS.addLibrary,
    ) ||
    new URLSearchParams(window.location.search).get(URL_QUERY_KEYS.addLibrary);
  const idToken = libraryUrl
    ? new URLSearchParams(window.location.hash.slice(1)).get("token")
    : null;

  return libraryUrl ? { libraryUrl, idToken } : null;
};

const getLibraryItemHash = (item: LibraryItem) => {
  return `${item.id}:${item.name || ""}:${hashElementsVersion(item.elements)}`;
};

export const getLibraryItemsHash = (items: LibraryItems) => {
  return hashString(
    items
      .map((item) => getLibraryItemHash(item))
      .sort()
      .join(),
  );
};

export default Library;
