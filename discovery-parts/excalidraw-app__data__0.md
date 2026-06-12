## Cluster: excalidraw-app__data__0

This cluster covers the Excalidraw web app's data-persistence and file-synchronization layer: an abstract file lifecycle manager, a versioned file-status store, the Firebase scene/file backend adapter, the share-link backend codec, the local (localStorage + IndexedDB) data adapter, the localStorage scene/username importer, and a tiny multi-lock primitive.

---

### excalidraw-app/data/FileManager.ts

Abstract, backend-agnostic manager that tracks the lifecycle (fetching / saving / saved / errored) of binary image files, plus two free helpers for encoding files for upload and reconciling stale image-element statuses.

- **`type FileVersion = Required<BinaryFileData>["version"]`** (L20) — local alias for a file's numeric version. Used throughout as the value type in the saving/saved maps so version changes are detected.

- **`class FileManager`** (L22-L226) — owns five `Map`s as bookkeeping state (all keyed by `FileId`):
  - `fetchingFiles: Map<fileId, true>` (L24) — currently being fetched.
  - `erroredFiles_fetch: Map<fileId, true>` (L25-L28) — failed fetches.
  - `savingFiles: Map<fileId, FileVersion>` (L30-L33) — in-flight saves, stores version.
  - `savedFiles: Map<fileId, FileVersion>` (L35) — successfully persisted, stores version.
  - `erroredFiles_save: Map<fileId, FileVersion>` (L36-L39) — failed saves, stores version.
  - Three injected callbacks held privately: `_getFiles`, `_saveFiles`, `_onFileStatusChange` (L41-L43).
  - **`constructor({ getFiles, saveFiles, onFileStatusChange })`** (L45-L65) — dependency injection of the backend I/O functions. `getFiles(fileIds) => Promise<{loadedFiles, erroredFiles}>`, `saveFiles({addedFiles}) => Promise<{savedFiles, erroredFiles}>`, optional `onFileStatusChange(updates: Array<[FileId, "loading"|"loaded"|"error"]>)`. No side effects beyond assignment.
  - **`isFileTracked = (id: FileId) => boolean`** (L70-L78) — true if the id appears in ANY of the five maps; used to avoid re-processing files in any state.
  - **`isFileSavedOrBeingSaved = (file: BinaryFileData) => boolean`** (L80-L86) — true if `savedFiles` or `savingFiles` holds the file's current version. Invariant: version equality, not mere key presence — a version bump makes a previously-saved file eligible for re-save.
  - **`getFileVersion = (file: BinaryFileData) => number`** (L88-L90) — returns `file.version ?? 1`; the default version is 1.
  - **`saveFiles = async ({ elements, files }) => Promise<{savedFiles, erroredFiles}>`** (L92-L137) — Iterates elements; for each initialized image element whose file data exists and is NOT already saved/being-saved, adds it to `addedFiles` and marks `savingFiles` with its version (L101-L113). Awaits `_saveFiles({addedFiles})`, then writes results into `savedFiles` / `erroredFiles_save` (L116-L126). A `finally` block always clears the corresponding `savingFiles` entries (L132-L136). Notable invariant called out in a comment (L107): a file that errored during save will NOT be retried because the `isFileSavedOrBeingSaved` guard short-circuits — but here errored files are tracked in `erroredFiles_save`, not `savingFiles`, so retry suppression actually relies on the caller's loop; the comment flags this subtlety.
  - **`getFiles = async (ids: FileId[]) => Promise<{loadedFiles, erroredFiles}>`** (L139-L180) — Early-returns empty result for empty input (L145-L150). Marks all ids `fetchingFiles` and fires `onFileStatusChange(... "loading")` (L151-L155). Awaits `_getFiles(ids)`; loaded files go into `savedFiles` with their version, errored ids into `erroredFiles_fetch` (L160-L165); fires a combined `onFileStatusChange` with `"loaded"` / `"error"` (L167-L172). `finally` always clears the `fetchingFiles` entries (L175-L179). Side effect: drives the status-store callback.
  - **`shouldPreventUnload = (elements) => boolean`** (L189-L197) — true if any non-deleted initialized image element is currently in `savingFiles`. Documented invariant (L182-L188): unload is prevented only while a save is in flight, regardless of element `status`, so elements never permanently block future-session unloads.
  - **`shouldUpdateImageElementStatus = (element): element is InitializedExcalidrawImageElement`** (L202-L210) — type-guard returning true when an initialized image element's file is in `savedFiles` but the element's `status === "pending"` (i.e. it needs flipping to "saved").
  - **`reset(): void`** (L212-L225) — if files are mid-fetch, fires `onFileStatusChange(... "error")` for them, then clears all five maps. Used to abandon in-flight work cleanly.

- **`encodeFilesForUpload = async ({ files, maxBytes, encryptionKey }) => Promise<{id, buffer}[]>`** (L228-L270) — For each `[id, fileData]`, TextEncodes `fileData.dataURL` to a `Uint8Array`, then `compressData<BinaryFileMetadata>` with the encryption key and metadata `{id, mimeType, created: Date.now(), lastRetrieved: Date.now()}` (L242-L253). Throws `t("errors.fileTooBig")` (with `maxBytes/1024/1024` truncated to MB) if the RAW (pre-compression) byte length exceeds `maxBytes` (L255-L261). Returns the list of `{id, buffer: encodedFile}`. Performance note: the size check is on the uncompressed buffer, and is checked AFTER compression already ran.

- **`updateStaleImageStatuses = (params: {excalidrawAPI, erroredFiles, elements}) => void`** (L272-L296) — No-op if `erroredFiles` is empty (L277-L279). Otherwise calls `excalidrawAPI.updateScene` over `getSceneElementsIncludingDeleted()`, replacing any initialized image element whose `fileId` is in `erroredFiles` with `newElementWith(element, {status: "error"})` (L280-L294). Uses `captureUpdate: CaptureUpdateAction.NEVER` so the change is not recorded in undo history. Note: the `elements` param in the type is unused — it reads from the API instead.

---

### excalidraw-app/data/fileStatusStore.ts

A static, versioned snapshot store mapping `FileId` to its loading status, designed for `useSyncExternalStore`-style consumption.

- **`type FileLoadingStatus = "loading" | "loaded" | "error"`** (L5) — exported status enum.

- **`class FileStatusStore`** (L7-L48) — all-static wrapper around a single `VersionedSnapshotStore<Map<FileId, FileLoadingStatus>>` seeded with an empty `Map` (L8-L10).
  - **`static getSnapshot()`** (L12-L14) — delegates to the underlying store's `getSnapshot()`; returns the current immutable map.
  - **`static pull(sinceVersion?: number)`** (L16-L18) — delegates to `store.pull`; returns the snapshot only if it changed since `sinceVersion` (versioned diffing for external-store subscribers).
  - **`static updateStatuses(updates: Array<[FileId, FileLoadingStatus]>): void`** (L20-L35) — no-op if `updates` is empty (L21-L23). Otherwise calls `store.update(prev => ...)`, building a `next = new Map(prev)` and applying only entries whose status actually changed; returns `next` if anything changed else `prev` (L24-L34). Invariant: identity-stable when nothing changed, so subscribers don't re-render needlessly. This is the function `FileManager.onFileStatusChange` is bound to (see LocalData).
  - **`static getPendingCount(statuses: Map<FileId, FileLoadingStatus>) => {pending, total}`** (L37-L47) — counts entries with status `"loading"` as `pending` and counts `total`; pure derivation used for progress UI.

---

### excalidraw-app/data/firebase.ts

Firebase (Firestore + Storage) backend adapter: lazily initializes the Firebase app, encrypts/decrypts scene element arrays, and saves/loads scenes and binary files with a per-socket scene-version cache to avoid redundant writes.

- **Module config** (L44-L58) — parses `VITE_APP_FIREBASE_CONFIG` env JSON into `FIREBASE_CONFIG` (falls back to `{}` with a console.warn on parse error). Three module-level lazily-initialized singletons: `firebaseApp`, `firestore`, `firebaseStorage`.

- **`_initializeFirebase = () => FirebaseApp`** (L60-L65) — memoized `initializeApp(FIREBASE_CONFIG)`.
- **`_getFirestore = () => Firestore`** (L67-L72) — memoized `getFirestore(_initializeFirebase())`.
- **`_getStorage = () => FirebaseStorage`** (L74-L79) — memoized `getStorage(_initializeFirebase())`.
- **`loadFirebaseStorage = async ()`** (L83-L85) — public async accessor returning `_getStorage()`.

- **`type FirebaseStoredScene = {sceneVersion: number; iv: Bytes; ciphertext: Bytes}`** (L87-L91) — Firestore document shape; `Bytes` is Firestore's binary wrapper.

- **`encryptElements = async (key, elements) => {ciphertext: ArrayBuffer, iv: Uint8Array}`** (L93-L102) — `JSON.stringify(elements)` → TextEncode → `encryptData(key, encoded)`; returns the encrypted buffer + IV. AES-GCM via the encryption module.
- **`decryptElements = async (data: FirebaseStoredScene, roomKey) => readonly ExcalidrawElement[]`** (L104-L116) — converts the Firestore `Bytes` `ciphertext`/`iv` to `Uint8Array`, `decryptData(iv, ciphertext, roomKey)`, TextDecode (utf-8), `JSON.parse`. Inverse of `encryptElements`.

- **`class FirebaseSceneVersionCache`** (L118-L129) — static `WeakMap<Socket, number>` mapping a collab socket to the last scene version it persisted.
  - **`static get = (socket) => number | undefined`** (L120-L122).
  - **`static set = (socket, elements) => void`** (L123-L128) — stores `getSceneVersion(elements)` for that socket. WeakMap keying means cache entries are GC'd with their sockets. Performance: this cache is what makes `isSavedToFirebase` O(1) and prevents redundant Firestore transactions.

- **`isSavedToFirebase = (portal: Portal, elements) => boolean`** (L131-L143) — if portal has socket+roomId+roomKey, returns `cache.get(socket) === getSceneVersion(elements)`. If no room exists, returns `true` (documented: nothing to save, so don't block unload).

- **`saveFilesToFirebase = async ({prefix, files}) => {savedFiles, erroredFiles}`** (L145-L172) — `Promise.all` uploads each `{id, buffer}` to Storage path `${prefix}/${id}` via `uploadBytes` with `cacheControl: public, max-age=${FILE_CACHE_MAX_AGE_SEC}` (L160-L163). Per-file try/catch sorts ids into `savedFiles` / `erroredFiles` arrays. Note: failures are swallowed per-file (no throw).

- **`createFirebaseSceneDocument = async (elements, roomKey) => FirebaseStoredScene`** (L174-L185) — computes `sceneVersion`, encrypts elements, wraps ciphertext + iv as Firestore `Bytes.fromUint8Array`.

- **`saveToFirebase = async (portal: Portal, elements: SyncableExcalidrawElement[], appState) => RemoteExcalidrawElement[] | null`** (L187-L247) — Bails returning `null` if no roomId/roomKey/socket OR already saved (L193-L201). Runs a Firestore `runTransaction` on `doc("scenes", roomId)` (L206-L238): if the doc doesn't exist, creates and `transaction.set`s a fresh scene document; otherwise decrypts the previous stored scene, restores+filters to syncable elements, `reconcileElements(local, remote, appState)`, re-filters to syncable, builds a new scene doc and `transaction.update`s it. The transaction returns the STORED scene (comment L236: returns stored data because in-memory reconciled elements may have mutated). After commit, decrypts the stored scene again, updates `FirebaseSceneVersionCache.set(socket, storedElements)`, and returns the elements branded as `RemoteExcalidrawElement[]` (L240-L246). This is the core conflict-resolution / merge path for collaboration.

- **`loadFromFirebase = async (roomId, roomKey, socket: Socket | null) => readonly SyncableExcalidrawElement[] | null`** (L249-L272) — `getDoc(doc("scenes", roomId))`; returns `null` if absent. Decrypts + `restoreElements(..., {deleteInvisibleElements: true})` + `getSyncableElements` (L260-L265). If a socket is provided, seeds the version cache (L267-L269).

- **`loadFilesFromFirebase = async (prefix, decryptionKey, filesIds) => {loadedFiles, erroredFiles}`** (L274-L319) — `Promise.all` over the de-duped (`new Set`) file ids. Builds a direct Storage REST URL `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(prefix without leading slash)}%2F${id}` and fetches `?alt=media` (L285-L288). On `status < 400`: `arrayBuffer` → `decompressData<BinaryFileMetadata>(..., {decryptionKey})` → TextDecode dataURL → push `BinaryFileData` (mimeType defaults to `MIME_TYPES.binary`, created/lastRetrieved default to `Date.now()`) (L289-L307). On `>= 400` or thrown error, marks the id in `erroredFiles` (L308-L313). Note: `lastRetrieved` is set from `metadata.created`, not the actual retrieval time (L306).

---

### excalidraw-app/data/index.ts

Share-link and collaboration data layer: defines the syncable-element brand and filter, room/encryption-link helpers, socket message type unions, and the encrypted share-link import/export codec (with legacy fallback).

- **`type SyncableExcalidrawElement = OrderedExcalidrawElement & MakeBrand<"SyncableExcalidrawElement">`** (L43-L44) — branded element type for elements eligible to sync.

- **`isSyncableElement = (element: OrderedExcalidrawElement) => element is SyncableExcalidrawElement`** (L46-L56) — deleted elements are syncable only if updated within `DELETED_ELEMENT_TIMEOUT` of now (so tombstones propagate then expire); non-deleted elements are syncable unless `isInvisiblySmallElement`. Time-window invariant prevents resurrecting old deletes.
- **`getSyncableElements = (elements) => SyncableExcalidrawElement[]`** (L58-L63) — filters via `isSyncableElement` and casts.

- **Backend URL consts** `BACKEND_V2_GET` / `BACKEND_V2_POST` (L65-L66) from env.

- **`generateRoomId = async () => string`** (L68-L72) — `ROOM_ID_BYTES` of `crypto.getRandomValues` → `bytesToHexString`.

- **`type EncryptedData`** (L74-L77), **`type SocketUpdateDataSource`** (L79-L121) — the discriminated union of all websocket message payloads keyed by `WS_SUBTYPES`: `INVALID_RESPONSE`, `SCENE_INIT`, `SCENE_UPDATE` (element arrays), `MOUSE_LOCATION` (socketId, pointer {x,y,tool}, button, selectedElementIds, username), `USER_VISIBLE_SCENE_BOUNDS` (sceneBounds), `IDLE_STATUS` (userState). **`SocketUpdateDataIncoming`** (L123-L124) and **`SocketUpdateData`** (L126-L129, with `_brand`) are derived unions.

- **`RE_COLLAB_LINK = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/`** (L131) — parses `#room=<roomId>,<roomKey>` URL hash.
- **`isCollaborationLink = (link: string) => boolean`** (L133-L136) — tests the hash against `RE_COLLAB_LINK`.
- **`getCollaborationLinkData = (link) => {roomId, roomKey} | null`** (L138-L146) — matches the hash; if the key (group 2) length is not exactly 22 chars, `window.alert`s an invalid-key warning and returns `null` (22 = base64-ish length of a 128-bit key). Returns `{roomId, roomKey}` or `null`.
- **`generateCollaborationLinkData = async () => {roomId, roomKey}`** (L148-L157) — generates a room id and `generateEncryptionKey()`; throws if no key.
- **`getCollaborationLink = (data: {roomId, roomKey}) => string`** (L159-L164) — builds `origin+pathname#room=roomId,roomKey`. The key lives in the hash so it's never sent to the server.

- **`legacy_decodeFromBackend = async ({buffer, decryptionKey})` (@deprecated)** (L170-L200) — old share-link format. Tries to split `buffer` into IV (`IV_LENGTH_BYTES`) + ciphertext and `decryptData`; on failure falls back to a fixed all-zero IV (backward compat). Decodes utf-8, `JSON.parse`, returns `{elements, appState}`.

- **`importFromBackend = async (id: string, decryptionKey: string) => Promise<ImportedDataState>`** (L202-L242) — fetches `${BACKEND_V2_GET}${id}`; on non-ok, alerts and returns `{}`. Tries the NEW format first (`decompressData` then `JSON.parse`), returning `{elements, appState}`; on decode error falls back to `legacy_decodeFromBackend` (L230-L235). Outer catch alerts + logs and returns `{}`.

- **`type ExportToBackendResult = {url: null; errorMessage: string} | {url: string; errorMessage: null}`** (L244-L246).
- **`exportToBackend = async (elements, appState: Partial<AppState>, files) => Promise<ExportToBackendResult>`** (L248-L307) — Generates a string encryption key, `compressData(serializeAsJSON(elements, appState, files, "database"))` into a payload (L253-L260). Collects initialized image files into a `filesMap`, `encodeFilesForUpload({files, encryptionKey, maxBytes: FILE_UPLOAD_MAX_BYTES})` (L263-L274). POSTs `payload.buffer` to `BACKEND_V2_POST`; on `json.id`, builds a share URL with `hash = json=<id>,<encryptionKey>` (key in hash, never query param — comment L283-L284), uploads files to Firebase under `/files/shareLinks/${json.id}`, returns `{url, errorMessage: null}` (L281-L293). Returns size-limit error on `RequestTooLargeError`, generic error otherwise, and on catch (L294-L306).

---

### excalidraw-app/data/LocalData.ts

Local persistence: saves scene/appState to localStorage (debounced), binary files to IndexedDB (idb-keyval), and provides the library IndexedDB adapter plus a legacy localStorage-to-IDB migration adapter.

- **`filesStore = createStore("files-db", "files-store")`** (L49) — module-level idb-keyval store for binary files.
- **`localStorageQuotaExceededAtom = atom(false)`** (L51) — jotai atom flagging localStorage quota errors for UI.

- **`class LocalFileManager extends FileManager`** (L53-L71):
  - **`clearObsoleteFiles = async ({currentFileIds}) => void`** (L54-L70) — iterates all `entries(filesStore)`; deletes any file whose `lastRetrieved` is missing OR older than 24h (`24*3600*1000`) AND is not in `currentFileIds` (not on canvas). GC for orphaned images. Note: uses `lastRetrieved` (last use), not `created`.

- **`saveDataStateToLocalStorage = (elements, appState) => void`** (L73-L109) — Reads `localStorageQuotaExceededAtom`. `clearAppStateForLocalStorage(appState)`; if the open sidebar is the default sidebar's search tab, nulls it (so search state isn't persisted) (L83-L88). Writes `JSON.stringify(getNonDeletedElements(elements))` and the cleaned appState to the LS keys, then `updateBrowserStateVersion(VERSION_DATA_STATE)` for cross-tab sync (L90-L98). Resets the quota atom to false on success; on `QuotaExceededError`, sets it true (L99-L108).
- **`isQuotaExceededError = (error) => boolean`** (L111-L113) — `error instanceof DOMException && error.name === "QuotaExceededError"`.

- **`type SavingLockTypes = "collaboration"`** (L115) — the only lock kind for save-pausing.

- **`class LocalData`** (L117-L228) — all-static save orchestrator:
  - **`private static _save = debounce(async (elements, appState, files, onFilesSaved) => ..., SAVE_TO_LOCAL_STORAGE_TIMEOUT)`** (L118-L134) — debounced: writes data state to LS, awaits `fileStorage.saveFiles({elements, files})`, then calls `onFilesSaved()`.
  - **`static save = (elements, appState, files, onFilesSaved) => void`** (L137-L147) — synchronously checks `isSavePaused()` (undebounced — comment L143) and only then invokes the debounced `_save`. Invariant: the pause check must be synchronous so it isn't bypassed by the debounce window.
  - **`static flushSave = () => void`** (L149-L151) — flushes the debounced save immediately (used on unload).
  - **`private static locker = new Locker<SavingLockTypes>()`** (L153).
  - **`static pauseSave / resumeSave (lockType) => void`** (L155-L161) — lock/unlock the locker.
  - **`static isSavePaused = () => boolean`** (L163-L165) — `document.hidden || locker.isLocked()`. Note: saving is paused when the tab is hidden, which is why `flushSave` exists for the unload path.
  - **`static fileStorage = new LocalFileManager({...})`** (L169-L227) — wires the FileManager's injected callbacks to IndexedDB:
    - `onFileStatusChange` bound to `FileStatusStore.updateStatuses` (L170).
    - `getFiles(ids)` (L171-L203): `getMany(ids, filesStore)`; for each present file, clones it with refreshed `lastRetrieved: Date.now()` into `loadedFiles` and queues it for re-save; missing files go to `erroredFiles`. Then `setMany(filesToSave)` writes the refreshed timestamps back (errors only warned). Side effect: reading a file updates its `lastRetrieved`, which feeds `clearObsoleteFiles`.
    - `saveFiles({addedFiles})` (L204-L226): optimistically bumps `updateBrowserStateVersion(VERSION_FILES)` BEFORE writing (comment L208-L210: optimistic cross-tab flag so a concurrent IDB read sees fresh data), then `Promise.all` `set(id, fileData, filesStore)` each, sorting into `savedFiles` / `erroredFiles`.

- **`class LibraryIndexedDBAdapter`** (L229-L256) — IDB persistence for library data.
  - Static `idb_name = STORAGE_KEYS.IDB_LIBRARY`, `key = "libraryData"`, and a dedicated `store` (L230-L238).
  - **`static async load() => LibraryPersistedData | null`** (L240-L247) — `get` the key from the store, return it or `null`.
  - **`static save(data) => MaybePromise<void>`** (L249-L255) — `set` the key.

- **`class LibraryLocalStorageMigrationAdapter`** (L258-L277) — one-shot migrator of legacy LS library data.
  - **`static load() => {libraryItems} | null`** (L261-L273) — reads `__LEGACY_LOCAL_STORAGE_LIBRARY`, `JSON.parse`s to `libraryItems`, returns wrapped or `null`.
  - **`static clear() => void`** (L274-L276) — removes the legacy LS key after migration.

---

### excalidraw-app/data/localStorage.ts

Synchronous localStorage import/export of collab username and the scene (elements + appState), plus storage-size accessors for stats.

- **`saveUsernameToLocalStorage = (username: string) => void`** (L11-L21) — `localStorage.setItem(LOCAL_STORAGE_COLLAB, JSON.stringify({username}))`, try/catch logging.
- **`importUsernameFromLocalStorage = () => string | null`** (L23-L35) — reads + parses the collab key, returns `.username` or `null` (catch returns null).
- **`importFromLocalStorage = () => {elements, appState}`** (L37-L74) — reads `LOCAL_STORAGE_ELEMENTS` and `LOCAL_STORAGE_APP_STATE` (L42-L43). Parses elements into an array (defaults to `[]` on error). Parses appState as `{...getDefaultAppState(), ...clearAppStateForLocalStorage(parsed)}` so defaults backfill missing keys (L62-L67); on error appState stays `null`. Each parse is independently guarded so one corrupt key doesn't lose the other.
- **`getElementsStorageSize = () => number`** (L76-L85) — length (chars) of the elements LS string, or 0.
- **`getTotalStorageSize = () => number`** (L87-L100) — sum of appState + collab + elements string lengths; approximate byte/char footprint for stats UI.

---

### excalidraw-app/data/Locker.ts

A minimal generic multi-key lock used to pause saving while named operations (e.g. collaboration) hold a lock.

- **`class Locker<T extends string>`** (L1-L18) — wraps a `Map<T, true>`.
  - **`lock = (lockType: T) => void`** (L4-L6) — adds the lock.
  - **`unlock = (lockType: T) => boolean`** (L9-L12) — deletes the lock; returns whether NO locks remain (i.e. fully unlocked).
  - **`isLocked(lockType?: T) => boolean`** (L15-L17) — with an arg, whether that specific lock is held; without, whether ANY lock is held (`!!this.locks.size`).
