/**
 * localStorage persistence for the editor.
 *
 * Mirrors excalidraw-app/data/localStorage.ts: elements are written to the
 * "excalidraw" key and a storage-filtered appState to "excalidraw-state".
 * The theme is persisted separately under "excalidraw-theme".
 *
 * All access is guarded for SSR / headless environments where `localStorage`
 * is undefined, and tolerant of malformed JSON (parse failures degrade to
 * empty / null rather than throwing).
 */

import {
	clearAppStateForLocalStorage,
	getDefaultAppState,
} from "@excalidraw/excalidraw/appState";
import { getNonDeletedElements } from "@excalidraw/element";
import { THEME } from "@excalidraw/common";

import type {
	OrderedExcalidrawElement,
	Theme,
} from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

const STORAGE_KEYS = {
	ELEMENTS: "excalidraw",
	APP_STATE: "excalidraw-state",
	THEME: "excalidraw-theme",
} as const;

const hasLocalStorage = (): boolean => typeof localStorage !== "undefined";

/**
 * Persist the current scene (non-deleted elements) and a filtered appState.
 * Non-persistent fields (e.g. `collaborators`) are stripped by
 * `clearAppStateForLocalStorage`; persistent defaults such as
 * `viewBackgroundColor`, `theme`, `zoom`, `scroll*` and `currentItem*` are kept.
 */
export const saveToLocalStorage = (
	elements: readonly OrderedExcalidrawElement[],
	appState: AppState,
): void => {
	if (!hasLocalStorage()) {
		return;
	}

	try {
		localStorage.setItem(
			STORAGE_KEYS.ELEMENTS,
			JSON.stringify(getNonDeletedElements(elements)),
		);
		localStorage.setItem(
			STORAGE_KEYS.APP_STATE,
			JSON.stringify(clearAppStateForLocalStorage(appState)),
		);
	} catch (error) {
		// Unable to access localStorage (quota exceeded / disabled) — skip.
		console.error(error);
	}
};

/**
 * Restore the persisted scene + partial appState.
 *
 * Returns `null` when neither key is present. Malformed JSON in either key is
 * tolerated: a corrupt elements blob yields an empty array, a corrupt appState
 * blob yields the default storage-filtered appState.
 */
export const restoreFromLocalStorage = (): {
	elements: OrderedExcalidrawElement[];
	appState: Partial<AppState>;
} | null => {
	if (!hasLocalStorage()) {
		return null;
	}

	let savedElements: string | null = null;
	let savedState: string | null = null;

	try {
		savedElements = localStorage.getItem(STORAGE_KEYS.ELEMENTS);
		savedState = localStorage.getItem(STORAGE_KEYS.APP_STATE);
	} catch (error) {
		// Unable to access localStorage.
		console.error(error);
		return null;
	}

	if (savedElements === null && savedState === null) {
		return null;
	}

	let elements: OrderedExcalidrawElement[] = [];
	if (savedElements) {
		try {
			elements = JSON.parse(savedElements) as OrderedExcalidrawElement[];
		} catch (error) {
			console.error(error);
			// Leave `elements` as the empty array on malformed JSON.
		}
	}

	let appState: Partial<AppState> = {};
	if (savedState) {
		try {
			appState = {
				...getDefaultAppState(),
				...clearAppStateForLocalStorage(
					JSON.parse(savedState) as Partial<AppState>,
				),
			};
		} catch (error) {
			console.error(error);
			// Leave `appState` as `{}` on malformed JSON.
		}
	}

	return { elements, appState };
};

/** Read the persisted theme, or `null` if unset / unavailable / invalid. */
export const getStoredTheme = (): Theme | null => {
	if (!hasLocalStorage()) {
		return null;
	}

	try {
		const value = localStorage.getItem(STORAGE_KEYS.THEME);
		if (value === THEME.LIGHT || value === THEME.DARK) {
			return value;
		}
	} catch (error) {
		console.error(error);
	}

	return null;
};

/** Persist the theme under the dedicated theme key. */
export const setStoredTheme = (theme: Theme): void => {
	if (!hasLocalStorage()) {
		return;
	}

	try {
		localStorage.setItem(STORAGE_KEYS.THEME, theme);
	} catch (error) {
		console.error(error);
	}
};
