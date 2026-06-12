## Cluster: excalidraw-app__(root)__0

This cluster contains the top-level entry points and shared scaffolding for the **excalidraw.com web application** (the `excalidraw-app/` package, distinct from the reusable `@excalidraw/excalidraw` library). It covers the app bootstrap (`index.tsx`), the root React component / scene-init orchestrator (`App.tsx`), the Jotai store wiring, app-wide constants, the custom stats panel, the Excalidraw+ iframe export bridge, and ambient global typings.

---

### excalidraw-app/app_constants.ts

Purpose: Centralizes app-wide timing, storage-key, WebSocket-event, and feature-flag constants used by the collaboration, persistence, and sync layers.

This file is **constants/enums only** — no functions. Significant exports:

- **Time constants (L1-L9)** — `SAVE_TO_LOCAL_STORAGE_TIMEOUT = 300` (ms debounce for localStorage save), `INITIAL_SCENE_UPDATE_TIMEOUT = 5000`, `FILE_UPLOAD_TIMEOUT = 300`, `LOAD_IMAGES_TIMEOUT = 500`, `SYNC_FULL_SCENE_INTERVAL_MS = 20000` (full-scene collab broadcast cadence), `SYNC_BROWSER_TABS_TIMEOUT = 50` (cross-tab sync debounce), `CURSOR_SYNC_TIMEOUT = 33` (~30fps cursor broadcast — note the `//~30fps` comment matches 1000/33≈30.3), `DELETED_ELEMENT_TIMEOUT = 24*60*60*1000` (1 day — how long tombstoned elements are retained).
- **`FILE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024` (L12)** — 4 MiB cap; comment notes it must align with backend `MAX_ALLOWED_FILE_BYTES`.
- **`FILE_CACHE_MAX_AGE_SEC = 31536000` (L14)** — 1 year cache TTL.
- **`WS_EVENTS` (L16-L21)** — `as const` map of socket channel names: `SERVER_VOLATILE`, `SERVER`, `USER_FOLLOW_CHANGE`, `USER_FOLLOW_ROOM_CHANGE`.
- **`enum WS_SUBTYPES` (L23-L30)** — real TS enum (not `as const`): `INVALID_RESPONSE`, `INIT = "SCENE_INIT"`, `UPDATE = "SCENE_UPDATE"`, `MOUSE_LOCATION`, `IDLE_STATUS`, `USER_VISIBLE_SCENE_BOUNDS`. These are the message subtypes carried inside encrypted collab payloads.
- **`FIREBASE_STORAGE_PREFIXES` (L32-L35)** — `shareLinkFiles: "/files/shareLinks"`, `collabFiles: "/files/rooms"`. Path prefixes for binary file blobs in Firebase storage.
- **`ROOM_ID_BYTES = 10` (L37)** — entropy width for generated collab room IDs.
- **`STORAGE_KEYS` (L39-L53)** — `as const` map of localStorage/IndexedDB keys: `LOCAL_STORAGE_ELEMENTS: "excalidraw"`, `LOCAL_STORAGE_APP_STATE: "excalidraw-state"`, `LOCAL_STORAGE_COLLAB`, `LOCAL_STORAGE_THEME`, `LOCAL_STORAGE_DEBUG`, `VERSION_DATA_STATE: "version-dataState"`, `VERSION_FILES: "version-files"` (the cross-tab version sentinels read by `isBrowserStorageStateNewer`), `IDB_LIBRARY`, `IDB_TTD_CHATS`, and a `__LEGACY_LOCAL_STORAGE_LIBRARY` marked "do not use apart from migrations".
- **`COOKIES = { AUTH_STATE_COOKIE: "excplus-auth" }` (L55-L57)** — `as const`.
- **`isExcalidrawPlusSignedUser` (L59-L61)** — module-load-time boolean: `document.cookie.includes(COOKIES.AUTH_STATE_COOKIE)`. **Side effect / invariant**: evaluated once at import time, so it reflects cookie state at page load, not live.

---

### excalidraw-app/app-jotai.ts

Purpose: Creates the app-scoped Jotai store instance and re-exports Jotai primitives plus a custom initial-value hook, isolating the app's atoms from the editor library's own Jotai store.

- **`appJotaiStore` (L13)** — `createStore()`. The single app-level Jotai store; passed to the `<Provider store={appJotaiStore}>` in `App.tsx` (L1278). Invariant: app atoms (collab, share dialog, etc.) live here, separate from the editor library's internal store, preventing cross-contamination.
- **Re-exports (L15)** — `atom`, `Provider`, `useAtom`, `useAtomValue`, `useSetAtom` are re-exported from `jotai` (the file uses an eslint `no-restricted-imports` override at L1, since direct jotai imports are otherwise forbidden to force routing through this module).
- **`useAtomWithInitialValue<T, A extends PrimitiveAtom<T>>(atom: A, initialValue: T | (() => T)) => readonly [value, setValue]` (L17-L37)** — React hook. Wraps `useAtom(atom)`, then in a `useLayoutEffect([])` (runs once before paint) sets the atom's value from `initialValue` (calling it if it's a function). Used in `App.tsx` to seed `isCollaboratingAtom` from `isCollaborationLink(window.location.href)` synchronously before first paint. **Notable**: uses `// @ts-ignore` (L28) on the function-form branch; the empty dep array is intentional (eslint-disabled at L33).

---

### excalidraw-app/global.d.ts

Purpose: Ambient module/global declarations for the app entry bundle. **Types/side-effect-import only — no functions.**

- **L1-L2** — side-effect imports `@excalidraw/excalidraw/global` and `@excalidraw/excalidraw/css` to pull in the library's ambient globals and CSS typing into the app's TS scope.
- **`interface Window` augmentation (L4-L6)** — adds `__EXCALIDRAW_SHA__: string | undefined`, the build-time git SHA written in `index.tsx` (L9) and used by the version/stats display.

---

### excalidraw-app/index.tsx

Purpose: The application bootstrap — registers the service worker, mounts the React root, and stamps the git SHA onto `window`.

No exported functions; this is the imperative entry script (module body executes on import).

- **Side-effect import (L5)** — `import "../excalidraw-app/sentry"` initializes Sentry error reporting before anything renders.
- **`window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA` (L9)** — records build SHA for diagnostics/version display.
- **`rootElement` / `createRoot` (L10-L11)** — grabs `#root` (non-null asserted) and creates the React 18 concurrent root.
- **`registerSW()` (L12)** — registers the PWA service worker via `virtual:pwa-register` (vite-plugin-pwa virtual module).
- **`root.render(<StrictMode><ExcalidrawApp /></StrictMode>)` (L13-L17)** — mounts the app under `StrictMode`. Invariant: StrictMode double-invokes effects in dev, which is why `ExcalidrawPlusIframeExport` and the PWA-ready postMessage guard against double-fire with a `readyRef`.

---

### excalidraw-app/CustomStats.tsx

Purpose: A React component injected into the editor's Stats panel that displays the app build version (timestamp + hash, click-to-copy) and live localStorage usage (scene size and total size).

- **`type StorageSizes = { scene: number; total: number }` (L20)** — byte counts for the current scene vs. all stored data.
- **`STORAGE_SIZE_TIMEOUT = 500` (L22)** — debounce window for recomputing sizes.
- **`getStorageSizes = debounce((cb) => {...}, 500)` (L24-L29)** — module-level debounced fn that computes `getElementsStorageSize()` and `getTotalStorageSize()` and passes them to a callback. **Side effect/invariant**: module-level singleton with a `.cancel()` method; cancelled on unmount (L47). Being module-level means all CustomStats instances share one debounce timer.
- **`type Props (L31-L35)** — `setToast: (message: string) => void`, `elements: readonly NonDeletedExcalidrawElement[]`, `appState: UIAppState`.
- **`CustomStats(props: Props)` component (L36-L89)**:
  - **State**: `storageSizes` via `useState<StorageSizes>({scene:0, total:0})` (L37-L40).
  - **Effect 1 (L42-L46)**: recomputes storage sizes (debounced) whenever `props.elements` or `props.appState` changes.
  - **Effect 2 (L47)**: cleanup-only effect that calls `getStorageSizes.cancel()` on unmount.
  - **Version parsing (L49-L58)**: `getVersion()`; if not `DEFAULT_VERSION`, splits the ISO-like version string into `timestamp = version.slice(0,16).replace("T"," ")` and `hash = version.slice(21)`; otherwise shows a localized "not available" string. **Non-obvious**: hard-coded slice offsets (0-16 for timestamp, 21+ for hash) assume a fixed version-string layout.
  - **Render (L60-L88)**: emits `Stats.StatsRows order={-1}` with a version heading, a click-to-copy row (calls `copyTextToSystemClipboard(getVersion())` then `props.setToast(...)`, swallowing errors with empty `catch {}`), and two two-column storage rows formatted via `nFormatter(value, 1)`.
- Default export is the component (L91).

---

### excalidraw-app/ExcalidrawPlusIframeExport.tsx

Purpose: A headless (renders `null`) component that runs inside a hidden iframe on the Excalidraw+ origin, acting as a secure postMessage bridge that hands the locally-stored scene to the parent window after verifying a JWT.

Constants:
- **`EVENT_REQUEST_SCENE = "REQUEST_SCENE"` (L14)** — the inbound message type it answers.
- **`EXCALIDRAW_PLUS_ORIGIN = import.meta.env.VITE_APP_PLUS_APP` (L16)** — the only trusted origin for both validating `event.origin` and as `targetOrigin` on replies.

Message protocol types (L21-L39): outbound `MESSAGE_REQUEST_SCENE` (`{type:"REQUEST_SCENE"; jwt:string}`); inbound `MESSAGE_READY`, `MESSAGE_ERROR` (`{type:"ERROR"; message}`), and `MESSAGE_SCENE_DATA` (`{type:"SCENE_DATA"; elements; appState: Pick<AppState,"viewBackgroundColor">; files:{loadedFiles; erroredFiles: Map<FileId,true>}}`).

- **`parseSceneData({ rawElementsString, rawAppStateString }: {string|null; string|null}) => Promise<MESSAGE_SCENE_DATA>` (L42-L87)** — Validates both raw strings are present (else throws `ExcalidrawError`), `JSON.parse`s elements and appState, rejects empty scenes, reduces elements to their `fileId`s (only those with a truthy `fileId`, L67-L72), fetches the binary files via `LocalData.fileStorage.getFiles(fileIds)`, and assembles the `SCENE_DATA` payload. **Invariant**: re-throws as `ExcalidrawError` unless already one (L82-L86). Reads from localStorage are passed in by the caller, not done here.
- **`verifyJWT({ token, publicKey }: {string; string}) => Promise<void>` (L89-L151)** — Manual RS256 JWT verification using WebCrypto. Splits the token into `header.payload.signature` (L101, rejects if any part missing), Base64URL-decodes payload and signature via `base64urlToString`, reconstructs signing input `data = "${header}.${payload}"`, converts the decoded signature to a `Uint8Array` by char code (L112-L114), strips PEM armor from `publicKey` and `atob`-decodes it to a key buffer (L116-L119), imports it as an `spki` `RSASSA-PKCS1-v1_5` / `SHA-256` verify key (L121-L127), and `crypto.subtle.verify`s the signature (L129-L134). Then checks `exp` against `Math.floor(Date.now()/1000)` and throws if expired (L143-L145). **Security invariant**: throws on any failure; logs and rethrows a sanitized `"Invalid JWT"`/message (L147-L150). **Non-obvious**: signature bytes are obtained via `Uint8Array.from(decodedSignature, c => c.charCodeAt(0))` — relies on the binary string from `base64urlToString` having one byte per char.
- **`ExcalidrawPlusIframeExport()` component (L153-L224)**:
  - **Ref**: `readyRef = useRef(false)` (L154) — guards against StrictMode double-send of the READY ping.
  - **Effect (`useLayoutEffect([])`, L156-L217)**: installs a `message` listener (`handleMessage`). The handler **throws if `event.origin !== EXCALIDRAW_PLUS_ORIGIN`** (L158-L160, origin allowlist), and on a `REQUEST_SCENE` with a present `jwt`: verifies the JWT against `VITE_APP_PLUS_EXPORT_PUBLIC_KEY` (L169-L172, wrapping failures into a generic `"Failed to verify JWT"`), builds scene data from `localStorage` keys `LOCAL_STORAGE_APP_STATE` and `LOCAL_STORAGE_ELEMENTS` (L178-L185), and posts `SCENE_DATA` back to `event.source` with `targetOrigin: EXCALIDRAW_PLUS_ORIGIN` (L187-L189). On any error it posts a `MESSAGE_ERROR` (L191-L200). After installing the listener, if `!readyRef.current` it flips the ref and posts a `READY` message to `window.parent` (L208-L212). Cleanup removes the listener (L214-L216).
  - **Render**: returns `null` (L223) — purely a messaging shim; all data lives in localStorage/IndexedDB.

---

### excalidraw-app/App.tsx

Purpose: The root application component — wires the `<Excalidraw>` editor, orchestrates initial scene loading (local / shared-link / collab / external-URL), drives autosave + cross-tab sync + image-file loading, and assembles all app-level UI (menus, footer, dialogs, command palette, AI, debug canvas).

Module-level setup:
- **`polyfill()` (L153)** — runs the library polyfill at import time.
- **`window.EXCALIDRAW_THROTTLE_RENDER = true` (L155)** — global flag enabling render throttling in the editor.
- **`declare global` (L157-L170)** — augments DOM types with `BeforeInstallPromptEvent`, its `prompt()`/`userChoice`, and the `beforeinstallprompt` `WindowEventMap` entry (PWA install support).
- **`pwaEvent` (L172)** plus a module-level `beforeinstallprompt` listener (L179-L187) that `preventDefault()`s and caches the event so the install can be triggered later from the command palette. **Invariant/comment (L174-L177)**: listener is registered outside the component so it can catch the event early.
- **`isSelfEmbedding` (L189-L201)** — module-load check: if `window.self !== window.top` and the referrer origin equals the current origin, mark self-embedding (used to render an "I'm not a pretzel!" guard screen). Wrapped in try/catch since cross-origin referrer access can throw.
- **`shareableLinkConfirmDialog` (L203-L214)** — `as const` config (title/description/`actionLabel`/`color:"danger"`) for the "override current scene?" modal, with a `Trans`-based description.

Functions / components:

- **`initializeScene(opts: { collabAPI: CollabAPI | null; excalidrawAPI: ExcalidrawImperativeAPI }) => Promise<{scene: ExcalidrawInitialDataState | null} & ({isExternalScene:true; id:string; key:string} | {isExternalScene:false; id?:null; key?:null})>` (L216-L372)** — The core scene-loading state machine. Reads URL `?id=`, hash `#json=<id>,<key>` (regex L227-L229), and `#url=` (regex L230); imports local storage via `importFromLocalStorage()` and restores it through `restoreElements`/`restoreAppState` (with `repairBindings` + `deleteInvisibleElements`, L242-L247). Determines `isExternalScene` from id/jsonBackend/roomLink (L250). For external scenes it prompts via `openConfirmModal(shareableLinkConfirmDialog)` unless the scene is empty or it's a collab room (L252-L259); for `#json=` it fetches via `importFromBackend` and **bumps element versions** over local elements via `bumpElementVersions` (L266-L280) so remote elements win reconciliation. Sets `scrollToContent = true` and `history.replaceState`s the URL clean (L282-L285). Has a `document.hidden` branch (L288-L298) that **defers re-init until window `focus`** (a one-shot listener) to avoid prompting on a hidden tab (cites excalidraw issue #1919). For `#url=` it fetches the blob and `loadFromBlob` (L303-L325), erroring to `alerts.invalidSceneUrl`. For collab (`roomLinkData && collabAPI`) it `startCollaboration`, then **reconciles** server elements against the API's current elements via `reconcileElements` and merges appState preferring local `theme`, forcing `isLoading:false` (L328-L360). Returns the assembled scene with `id`/`key` when external. **Coordinate/geometry note**: none directly, but the reconciliation + version-bump ordering is the load-time merge-conflict resolution that a reimplementation must mirror.

- **`ExcalidrawWrapper()` component (L374-L1267)** — The main editor wrapper. Owns:
  - **Hooks/state**: `excalidrawAPI = useExcalidrawAPI()` (L375); `errorMessage` state (L377); `isCollabDisabled = isRunningInIframe()` (L378); `useHandleAppTheme()` → `{editorTheme, appTheme, setAppTheme}` (L380); `useAppLangCode()` → `[langCode, setLangCode]` (L382); `editorInterface = useEditorInterface()` (L384); `latestShareableLink` state (L730).
  - **Refs**: `initialStatePromiseRef` (L389-L395) — a lazily-created `resolvablePromise<ExcalidrawInitialDataState|null>()` fed as `initialData` to `<Excalidraw>` and resolved once `initializeScene` completes (the editor renders against a pending promise until then). `debugCanvasRef` (L397) for the visual debugger overlay canvas.
  - **Atoms**: `setShareDialogState` (L407), `collabAPI` (L408), `isCollaborating` seeded via `useAtomWithInitialValue(isCollaboratingAtom, () => isCollaborationLink(...))` (L409-L411), `collabError` (L412), `isOffline` (L787), `localStorageQuotaExceeded` (L789).
  - **`useHandleLibrary({excalidrawAPI, adapter: LibraryIndexedDBAdapter, migrationAdapter: LibraryLocalStorageMigrationAdapter})` (L414-L419)** — wires library persistence + a legacy-localStorage→IDB migration.
  - **`forceRefresh` (L421)** — `useState(false)` toggled to force re-render (passed to menu/footer refresh).
  - **Effect: analytics (L399-L405)** — `trackEvent("load","frame",...)` immediately and `trackEvent("load","version",...)` after `VERSION_TIMEOUT`.
  - **Effect: debug state (L423-L436)** — in dev, loads saved debug state and toggles `window.visualDebug`, then `forceRefresh`.
  - **`loadImages = useCallback((data: ResolutionType<typeof initializeScene>, isInitialLoad=false) => void, [collabAPI, excalidrawAPI])` (L441-L521)** — Loads binary image files for a scene. If collaborating, fetches from Firebase via `collabAPI.fetchImageFilesFromFirebase` then `addFiles` + `updateStaleImageStatuses` (L447-L462). Otherwise reduces elements to `fileId`s of `isInitializedImageElement`s (L464-L470); for external scenes it marks them "loading" in `FileStatusStore`, calls `loadFilesFromFirebase(<shareLinkFiles>/<id>, key, fileIds)`, adds files, updates stale statuses, and records loaded/errored statuses (L472-L496); for an initial local load it pulls from `LocalData.fileStorage.getFiles` and **clears obsolete IDB files** for fileIds no longer referenced (L497-L517). **Performance/invariant**: `FileStatusStore` tracks per-file load progress and is what `onExport` later awaits.
  - **Effect: scene init + listeners (L523-L651)** — gated on `excalidrawAPI` and collab availability. Calls `initializeScene(...)`, then `loadImages(data, true)` and resolves `initialStatePromiseRef`. Defines `onHashChange` (re-inits scene on hash change unless it's a library URL; stops collab if navigating away from a collab link; restores elements/appState with `CaptureUpdateAction.IMMEDIATELY`, L533-L558). Defines `syncData = debounce(..., SYNC_BROWSER_TABS_TIMEOUT)` (L560-L617): when not hidden and not collaborating, if `isBrowserStorageStateNewer(VERSION_DATA_STATE)` it reloads local data/username/lang and updates the scene with `CaptureUpdateAction.NEVER` (no history entry), reloads the library, sets collab username; if `isBrowserStorageStateNewer(VERSION_FILES)` it loads only not-already-present image files. Defines `onUnload` → `LocalData.flushSave()` (L619-L621) and `visibilityChange` (L623-L633): flushes save on BLUR/hidden, syncs on visibilitychange/focus. Registers `hashchange`/`unload`/`blur`/`visibilitychange`/`focus` listeners and returns a cleanup that removes them all (L635-L650). **Invariant**: `CaptureUpdateAction.NEVER` for cross-tab syncs avoids polluting undo history; `IMMEDIATELY` for hash-driven loads creates one.
  - **Effect: beforeunload guard (L653-L676)** — flushes save and, if `LocalData.fileStorage.shouldPreventUnload(elements)` (pending file uploads), calls `preventUnload(event)` unless `VITE_APP_DISABLE_PREVENT_UNLOAD === "true"`.
  - **`onChange(elements, appState, files) => void` (L678-L728)** — the editor's change callback (hot path). Syncs elements to collab if collaborating; if `!LocalData.isSavePaused()`, calls `LocalData.save(...)` whose callback re-walks elements and flips finished-upload image statuses to `"saved"` via `newElementWith`, updating the scene with `CaptureUpdateAction.NEVER` only if something changed (`didChange` guard avoids needless updates, L692-L714). Finally renders the debug overlay via `debugRenderer(canvas, appState, elements, window.devicePixelRatio)` if the debug canvas is mounted (L720-L727). **Performance note**: the `didChange` flag and the redundant-but-cheap `isSavePaused()` check (commented at L687-L688) are deliberate hot-path optimizations; `devicePixelRatio` is passed to the debug renderer for DPR-correct scaling.
  - **`onExportToBackend(exportedElements, appState: Partial<AppState>, files) => Promise<void>` (L734-L772)** — throws on empty canvas; calls `exportToBackend` forcing `viewBackgroundColor` to either the chosen background or `getDefaultAppState().viewBackgroundColor` when `exportBackground` is off; sets `latestShareableLink` on success; swallows `AbortError`, otherwise logs width/height/DPR and rethrows.
  - **`renderCustomStats(elements, appState: UIAppState) => JSX` (L774-L785)** — renders `<CustomStats>` wiring `setToast` to `excalidrawAPI.setToast`.
  - **`onCollabDialogOpen = useCallback(() => setShareDialogState({isOpen:true, type:"collaborationOnly"}), [...])` (L791-L794)**.
  - **`onExport: Required<ExcalidrawProps>["onExport"]` — an **async generator** `useCallback` (L799-L839)** — Before an image export, inspects `FileStatusStore` pending count; if zero, returns immediately. Otherwise `yield`s `{type:"progress", progress:(total-pending)/total, message}` and then loops awaiting `FileStatusStore.pull(version)` (a version-cursor blocking read) re-yielding progress until `pending===0`, then waits 500ms, yields a final "Preparing export..." and returns. **Invariant**: gates export on all pending image loads; the `progress` fraction is `(total-pending)/total`.
  - **Self-embed guard (L849-L863)**: if `isSelfEmbedding`, renders a centered "I'm not a pretzel!" screen instead of the editor.
  - **`ExcalidrawPlusCommand` / `ExcalidrawPlusAppCommand` (L865-L902)** — command-palette entries opening Excalidraw+ marketing/app URLs with UTM params.
  - **Render (L904-L1266)**: outer `div.excalidraw-app` (class `is-collaborating` toggled by `clsx`). Renders `<Excalidraw>` with `onChange`, `onExport`, `initialData` (the pending promise), `isCollaborating`, `onPointerUpdate={collabAPI?.onPointerUpdate}`, a `UIOptions.canvasActions.export` block wiring `onExportToBackend` and a `renderCustomUI` that mounts `<ExportToExcalidrawPlus>` (L917-L948), `langCode`, `renderCustomStats`, `detectScroll={false}`, `handleKeyboardGlobally`, `autoFocus`, `theme={editorTheme}`, a `renderTopRightUI` that (on desktop, non-iframe) shows the Plus promo banner, collab error indicator, and `LiveCollaborationTrigger` (L955-L978), and `onLinkOpen` that intercepts internal element links via `excalidrawAPI.scrollToContent(..., {animate:true})` (L979-L984). Children include `AppMainMenu`, `AppWelcomeScreen`, `OverwriteConfirmDialog` (with Export-to-Image / Save-to-Disk / Excalidraw+ actions), `AppFooter`, `AIComponents`, `TTDDialogTrigger`, offline/quota alert banners, `ShareableLinkDialog`, `Collab`, `ShareDialog`, `AppSidebar`, `ErrorDialog`, a large `CommandPalette` `customCommandPaletteItems` array (live-collab, stop-session, share, GitHub/X/Discord/YouTube links, Excalidraw+ sign-in, export-to-Plus, toggle-theme, install-PWA — L1068-L1255), and the `DebugCanvas` when `isVisualDebuggerEnabled()` (L1257-L1263).

- **`ExcalidrawApp()` component (L1269-L1285)** — top-level export. If `window.location.pathname === "/excalidraw-plus-export"` it renders only `<ExcalidrawPlusIframeExport/>` (the headless bridge). Otherwise wraps `<ExcalidrawWrapper/>` in `<TopErrorBoundary>` → `<Provider store={appJotaiStore}>` → `<ExcalidrawAPIProvider>`. Default export (L1287).
