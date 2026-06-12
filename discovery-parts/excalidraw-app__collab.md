## Cluster: excalidraw-app__collab

This cluster implements Excalidraw's real-time collaboration layer: the `Collab` controller (socket lifecycle, scene reconciliation, idle/cursor/follow sync, Firebase persistence), the `Portal` wire-protocol broadcaster (encryption + element-version diffing), and the small `CollabError` indicator component. Geometry/coordinate-space details are concentrated in viewport-follow handling (`zoomToFitBounds`, `getVisibleSceneBounds`); the rest is event/state plumbing relevant to parity with any reimplementation.

---

### excalidraw-app/collab/Collab.tsx

Purpose: The collaboration controller — a `PureComponent` class that owns the socket session, decrypts/encrypts and reconciles remote scene updates, tracks collaborators and idle state, throttles cursor/scene broadcasts, and persists the room to Firebase.

Module-level exports / constants:
- `collabAPIAtom = atom<CollabAPI | null>(null)` (L98) — jotai atom holding the imperative collab API surface for the rest of the app.
- `isCollaboratingAtom = atom(false)` (L99) — jotai atom; canonical source of truth for "am I collaborating" (read by `isCollaborating()`).
- `isOfflineAtom = atom(false)` (L100) — jotai atom mirroring `navigator.onLine` (inverted).
- `activeRoomLinkAtom = atom<string | null>(null)` (L110) — jotai atom holding the current shareable room URL.
- Types/interfaces: `CollabState` (L102-L108: `errorMessage`, `dialogNotifiedErrors`, `username`, `activeRoomLink`), `CollabAPI` interface (L114-L126: maps API method names to the corresponding `Collab` instance method types), `CollabProps` (L128-L130: `{ excalidrawAPI }`), `CollabInstance` type alias (L112), and exported `TCollabClass = Collab` (L1051).
- `declare global { interface Window { collab } }` (L1039-L1043) and the test/dev `window.collab` shim (L1045-L1047).

Class fields (L132-L141): `portal: Portal`, `fileManager: FileManager`, `excalidrawAPI`, `activeIntervalId`/`idleTimeoutId` (timer handles), private `socketInitializationTimer`, private `lastBroadcastedOrReceivedSceneVersion = -1` (the dedup watermark used to avoid re-broadcasting received scenes), private `collaborators = new Map<SocketId, Collaborator>()`.

Methods / handlers:
- `constructor(props)` (L143-L204) — initializes `CollabState` (username pulled from localStorage), constructs `Portal(this)` and a `FileManager` whose `getFiles`/`saveFiles` close over `this.portal.{roomId,roomKey}` and throw `AbortError` if no room; `saveFiles` encrypts via `encodeFilesForUpload` (cap `FILE_UPLOAD_MAX_BYTES`), uploads to `files/rooms/<roomId>` prefix, and reduces returned saved/errored ids back into `Map<FileId,BinaryFileData>`. Invariant: file blobs go to Firebase Storage, never the realtime socket.
- `componentDidMount()` (L208-L254) — registers window listeners (BEFORE_UNLOAD, online, offline, UNLOAD), subscribes to `onUserFollow` (re-broadcasts follow payload) and `onScrollChange` (throttled via `throttleRAF` → `relayVisibleSceneBounds`), publishes the `collabAPI` object into `collabAPIAtom`, and in test/dev exposes `this` as `window.collab`. Side effect: stores teardown closure in `this.onUmmount`.
- `onOfflineStatusToggle = ()` (L256-L258) — sets `isOfflineAtom` to `!navigator.onLine`.
- `componentWillUnmount()` (L260-L279) — removes all listeners (including POINTER_MOVE / VISIBILITY_CHANGE idle listeners), clears active/idle timers, calls `onUmmount`.
- `isCollaborating = ()` (L281) — returns `appJotaiStore.get(isCollaboratingAtom)!`; exposed as a function so stale closures read the latest value (noted in `CollabAPI` comment L115).
- `setIsCollaborating(boolean)` (L283-L285) — writes `isCollaboratingAtom`.
- `onUnload = ()` (L287-L289) — calls `destroySocketClient({ isUnload: true })`.
- `beforeUnload = withBatchedUpdates((event: BeforeUnloadEvent))` (L291-L313) — if collaborating and either files would be lost or scene isn't saved to Firebase, fires `saveCollabRoomToFirebase` and (unless `VITE_APP_DISABLE_PREVENT_UNLOAD==="true"`) calls `preventUnload(event)`. Invariant noted in comment: the save won't complete if the user actually leaves; it's there for the "stay" path.
- `saveCollabRoomToFirebase = async (syncableElements)` (L315-L355) — deep-clones via `cloneJSON`, calls `saveToFirebase(portal, elements, appState)`; on success resets the error indicator and, if still collaborating and the server returned stored elements, feeds them through `_reconcileElements` → `handleRemoteSceneUpdate`. On error it picks a localized message (`/is longer than.*?bytes/` → size-exceeded vs generic), de-dupes dialog notifications via `dialogNotifiedErrors`, and sets the error indicator. Side effects: network, dialog state, error-indicator atom.
- `stopCollaboration = (keepRemoteState = true)` (L357-L403) — cancels throttled queues (`queueBroadcastAllElements`, `queueSaveToFirebase`, `loadImageFiles`), resets error indicator, does a final Firebase save, detaches the `connect_error` fallback handler. If `!keepRemoteState`: resets file storage and destroys the socket. If `keepRemoteState` and the user confirms `window.confirm(collabStopOverridePrompt)`: resets browser-state versions, pushes a clean URL, destroys socket, resets file storage, and re-marks every saved image element as `"pending"` (so it re-uploads locally), updating the scene with `CaptureUpdateAction.NEVER`. Notable: uses raw `window.confirm` (un-themed) — relevant if porting.
- `destroySocketClient = (opts?: { isUnload })` (L405-L418) — resets the version watermark to `-1`, closes the portal, resets file manager; unless unloading, flips `isCollaborating` false, clears the room link, empties the collaborators map and pushes it to the scene, and resumes local autosave (`LocalData.resumeSave("collaboration")`).
- `fetchImageFilesFromFirebase = async (opts: { elements, forceFetchFiles? })` (L420-L446) — filters initialized, untracked, non-deleted image elements; if `forceFetchFiles`, also re-pulls files whose status !== "pending" OR that are pending older than 10s (`Date.now() - element.updated > 10000`), else only `status === "saved"`. Returns `fileManager.getFiles(unfetchedImages)`.
- `decryptPayload = async (iv, encryptedData, decryptionKey)` (L448-L467) — `decryptData` → UTF-8 decode → `JSON.parse`. On failure alerts the user (`alerts.decryptFailed`) and returns `{ type: WS_SUBTYPES.INVALID_RESPONSE }` so the broadcast switch can no-op. Output type `ValueOf<SocketUpdateDataSource>`.
- `startCollaboration = async (existingRoomLinkData)` (L471-L706) — the core session bootstrap. (1) If no username, lazy-imports `@excalidraw/random-username` and assigns one. (2) No-op if a socket already exists. (3) Resolves `roomId`/`roomKey` from passed link or `generateCollaborationLinkData()` (pushing a new URL in the latter case). (4) Creates a `resolvablePromise` for the scene, flips collaborating true, pauses local save. (5) Lazy-imports `socket.io-client`, defines `fallbackInitializationHandler` (re-runs `initializeRoom({fetchScene:true})`), opens the portal socket against `VITE_APP_WS_SERVER_URL` (transports websocket+polling), and registers `connect_error` → fallback. (6) When joining an existing room calls `resetScene()`; otherwise strips deleted elements and marks saved images pending, updates the scene (`NEVER`), and saves to Firebase. (7) Sets `socketInitializationTimer` (`INITIAL_SCENE_UPDATE_TIMEOUT`) as a fallback. (8) Registers the big `client-broadcast` handler (see below), plus `first-in-room`, `USER_FOLLOW_ROOM_CHANGE`, then starts the idle detector and sets the active room link. Returns the scene promise.
  - `client-broadcast` handler (L568-L677): decrypts each payload, then switches on `decryptedData.type`: `INVALID_RESPONSE` → return; `INIT` (only if `!socketInitialized`) → `initializeRoom({fetchScene:false})`, brand remote elements, reconcile, `handleRemoteSceneUpdate`, resolve scene promise with `scrollToContent:true`; `UPDATE` → reconcile + apply; `MOUSE_LOCATION` → reads `socketId || legacy socketID` (#2094/#2097) and calls `updateCollaborator` with pointer/button/selection/username; `USER_VISIBLE_SCENE_BOUNDS` → guards that the sender is the user we follow and we're not in a cross-follow loop, then `updateScene` with `zoomToFitBounds(...)` (fitToViewport, viewportZoomFactor 1) — the key coordinate-space op for follow mode; `IDLE_STATUS` → `updateCollaborator` with userState; default → `assertNever`.
  - `first-in-room` (L679-L688): unsubscribes itself, runs `initializeRoom({fetchScene:true})`, resolves scene promise.
  - `USER_FOLLOW_ROOM_CHANGE` (L690-L699): updates `appState.followedBy` set, then force-relays viewport bounds.
- `initializeRoom = async ({ fetchScene, roomLinkData })` (L708-L753) — clears the init timer and detaches the `connect_error` fallback. If `fetchScene && roomLinkData && socket`: resets the scene, `loadFromFirebase(roomId, roomKey, socket)`; on success seeds `lastBroadcastedOrReceivedSceneVersion` from `getSceneVersion(elements)` and returns `{elements, scrollToContent:true}`. `finally` (and the else branch) set `portal.socketInitialized = true`. Returns null when nothing fetched.
- `_reconcileElements = (remoteElements): ReconciledExcalidrawElement[]` (L755-L787) — restores remote elements against existing (comment L762-L764 explains restore happens before reconciliation deliberately, to avoid regenerating in-flight elements like `appState.newElement`), calls `reconcileElements(existing, remote, appState)`, then `bumpElementVersions`. Critically sets `lastBroadcastedOrReceivedSceneVersion` to the reconciled scene version BEFORE the scene render (comment L778-L781) so we don't echo back what we just received. This dedup invariant is central to the protocol.
- `loadImageFiles = throttle(async () => {...}, LOAD_IMAGES_TIMEOUT)` (L789-L802) — fetches image files for the current scene, `addFiles(loadedFiles)`, and `updateStaleImageStatuses` for errored files.
- `handleRemoteSceneUpdate = (elements)` (L804-L813) — `updateScene({elements, captureUpdate: NEVER})` then triggers `loadImageFiles()`. Invariant: remote updates never enter undo history (NEVER).
- `onPointerMove = ()` (L815-L829) — resets the idle timeout (`IDLE_THRESHOLD`) and ensures an active-report interval (`ACTIVE_THRESHOLD`) is running.
- `onVisibilityChange = ()` (L831-L850) — on `document.hidden` clears timers and reports `AWAY`; otherwise restarts timers and reports `ACTIVE`.
- `reportIdle = ()` (L852-L858) — emits `IDLE` and clears the active interval.
- `reportActive = ()` (L860-L862) — emits `ACTIVE`.
- `initializeIdleDetector = ()` (L864-L867) — adds POINTER_MOVE and VISIBILITY_CHANGE listeners.
- `setCollaborators(sockets: SocketId[])` (L869-L882) — rebuilds the collaborators map preserving prior per-socket data and stamping `isCurrentUser` (compares to `portal.socket?.id`); pushes to scene. Note: drops collaborators not present in the new socket list.
- `updateCollaborator = (socketId, updates: Partial<Collaborator>)` (L884-L900) — merges updates into a copied map (immutable update pattern) with `isCurrentUser` recomputed, then `updateScene({collaborators})`.
- `setLastBroadcastedOrReceivedSceneVersion = (version)` (L902-L904) / `getLastBroadcastedOrReceivedSceneVersion = ()` (L906-L908) — accessors for the dedup watermark.
- `getSceneElementsIncludingDeleted = ()` (L910-L912) — passthrough to the imperative API.
- `onPointerUpdate = throttle((payload), CURSOR_SYNC_TIMEOUT)` (L914-L925) — broadcasts mouse location only when fewer than 2 active pointers (`payload.pointersMap.size < 2`, i.e. not mid-gesture/pinch) and a socket exists. Throttled at cursor cadence.
- `relayVisibleSceneBounds = (props?: { force })` (L927-L938) — if socket open and someone is following (or `force`), broadcasts `getVisibleSceneBounds(appState)` tagged with room `follow@<socketId>`. Coordinate-space note: viewport bounds are in scene/world space (the receiver `zoomToFitBounds` into them).
- `onIdleStateChange = (userState)` (L940-L942) — delegates to `portal.broadcastIdleChange`.
- `broadcastElements = (elements)` (L944-L953) — only broadcasts if `getSceneVersion(elements)` exceeds the watermark; on broadcast, bumps the watermark and schedules a full-scene resync via `queueBroadcastAllElements`. This is the local→remote diff gate.
- `syncElements = (elements)` (L955-L958) — `broadcastElements` + `queueSaveToFirebase`. Public entry point used by the editor on local change.
- `queueBroadcastAllElements = throttle(() => {...}, SYNC_FULL_SCENE_INTERVAL_MS)` (L960-L972) — periodic full resync (`syncAll=true`) to recover from dropped messages; advances watermark to `max(current, currentSceneVersion)`.
- `queueSaveToFirebase = throttle(() => {...}, SYNC_FULL_SCENE_INTERVAL_MS, { leading: false })` (L974-L986) — periodic Firebase save once the socket is initialized; `leading:false` so it doesn't fire immediately.
- `setUsername` (L988-L991), `getUsername` (L993), `setActiveRoomLink` (L995-L998, also writes `activeRoomLinkAtom`), `getActiveRoomLink` (L1000) — username/room-link accessors with localStorage + atom side effects.
- `setErrorIndicator = (message)` (L1002-L1007) — writes `collabErrorIndicatorAtom` with `nonce: Date.now()` (nonce forces the indicator's shake animation to re-run).
- `resetErrorIndicator = (resetDialogNotifiedErrors = false)` (L1009-L1016) — clears the indicator atom; optionally clears `dialogNotifiedErrors`.
- `setErrorDialog = (errorMessage)` (L1018-L1022) — sets `state.errorMessage` (drives the rendered `ErrorDialog`).
- `render()` (L1024-L1036) — renders only an `ErrorDialog` when `errorMessage != null`; otherwise nothing. The component is otherwise headless (all UI lives elsewhere). State owned: `errorMessage`, `dialogNotifiedErrors`, `username`, `activeRoomLink`.

---

### excalidraw-app/collab/CollabError.tsx

Purpose: A small headless-ish indicator component that renders a warning icon (with tooltip) and replays a one-second "shake" animation whenever a collab/save error is reported.

- `collabErrorIndicatorAtom = atom<ErrorIndicator>({ message: null, nonce: 0 })` (L16-L19) — exported jotai atom; written by `Collab.setErrorIndicator`/`resetErrorIndicator`. Type `ErrorIndicator = { message: string | null; nonce: number }` (L10-L14); `nonce` exists solely to re-trigger the animation effect.
- `CollabError = ({ collabError }: { collabError: ErrorIndicator })` (L21-L51) — React FC.
  - Props: `collabError: ErrorIndicator`.
  - State/refs: `isAnimating` (`useState(false)`, L22) and `clearAnimationRef` (`useRef<string|number>(0)`, L23) holding the pending timeout id.
  - Effect (L25-L34): on change of `collabError.message` OR `collabError.nonce`, sets `isAnimating=true`, schedules `setIsAnimating(false)` after 1000ms, and clears that timeout on cleanup. Depending on `nonce` is what lets an identical repeated message still re-animate.
  - Render: returns `null` if no message (L36-L38); otherwise a `Tooltip` (long) wrapping a `div.collab-errors-button` that toggles `collab-errors-button-shake` while animating and renders the `warning` icon (L40-L50).
  - `CollabError.displayName = "CollabError"` (L53). Imports `./CollabError.scss` for styling (animation defined in SCSS).

---

### excalidraw-app/collab/Portal.tsx

Purpose: The wire-protocol layer — owns the socket.io connection, encrypts/diffs/broadcasts scene and presence messages, and tracks which element versions have already been sent.

Class `Portal` fields (L25-L31): `collab: TCollabClass`, `socket: Socket | null = null`, `socketInitialized = false` (gate: no emits until init complete — comment L28), `roomId`/`roomKey` (null until open), `broadcastedElementVersions: Map<string, number>` (per-element-id last-sent version, the diff state).

- `constructor(collab)` (L33-L35) — stores back-reference to the `Collab` instance.
- `open(socket, id, key): Socket` (L37-L61) — assigns socket/room, then wires server listeners: `init-room` → emit `join-room` + `trackEvent("share","room joined")`; `new-user` → broadcast a full INIT scene (`syncAll=true`) so the newcomer gets everything; `room-user-change` → `collab.setCollaborators(clients)`. Returns the socket.
- `close()` (L63-L74) — no-op if no socket; flushes `queueFileUpload`, closes the socket, nulls socket/room, resets `socketInitialized` and the `broadcastedElementVersions` map. Invariant: clearing the version map means the next broadcast re-sends everything.
- `isOpen(): boolean` (L76-L83) — true only when `socketInitialized && socket && roomId && roomKey`. Gate used by all data broadcasts.
- `_broadcastSocketData = async (data, volatile = false, roomId?)` (L85-L102) — the single encrypt+emit chokepoint: JSON-stringify → `TextEncoder` → `encryptData(roomKey!, encoded)` → emit `SERVER_VOLATILE` (volatile) or `SERVER` with `(roomId ?? this.roomId, encryptedBuffer, iv)`. Only runs when `isOpen()`. Security invariant: all realtime payloads are end-to-end encrypted with the room key.
- `queueFileUpload = throttle(async () => {...}, FILE_UPLOAD_TIMEOUT)` (L104-L140) — saves files via `fileManager.saveFiles`; on non-Abort errors surfaces `appState.errorMessage`. Then scans elements and, for any whose image status should advance, marks them `"saved"` via `newElementWith` (comment L126-L128: uses `newElementWith` not direct mutation here, but the prior INIT-time code uses mutation to avoid breaking in-progress drags) and applies the change with `CaptureUpdateAction.NEVER` only if something changed. Throttled at file-upload cadence.
- `broadcastScene = async (updateType: INIT | UPDATE, elements, syncAll)` (L142-L183) — throws if `INIT && !syncAll` (L147-L149: INIT must be a full sync). Diff step (L154-L164): reduces to elements that are syncable AND (syncAll, OR not yet broadcast, OR have a higher `version` than last broadcast). Builds `{type, payload:{elements: syncableElements}}`, records each sent element's version into `broadcastedElementVersions` (L173-L178), kicks `queueFileUpload`, then `_broadcastSocketData`. This is the bandwidth-saving incremental-sync core; performance-relevant for parity.
- `broadcastIdleChange = (userState)` (L185-L200) — if `socket.id`, sends `IDLE_STATUS` (socketId, userState, username) volatile.
- `broadcastMouseLocation = (payload: { pointer, button })` (L202-L224) — if `socket.id`, sends `MOUSE_LOCATION` with socketId, pointer, `button || "up"`, the current `selectedElementIds`, and username; volatile. Pointer is in scene coordinates as supplied by the editor.
- `broadcastVisibleSceneBounds = (payload: { sceneBounds }, roomId)` (L226-L248) — if `socket.id`, sends `USER_VISIBLE_SCENE_BOUNDS` (socketId, username, sceneBounds) volatile to the follow-specific `roomId` (`follow@<socketId>`). Used by follow mode; bounds are scene/world-space.
- `broadcastUserFollowed = (payload: OnUserFollowedPayload)` (L250-L254) — if `socket.id`, emits raw `USER_FOLLOW_CHANGE` event (not encrypted — it's routing metadata, not scene data).

Protocol/perf notes for parity: presence messages (idle, mouse, viewport bounds) are sent as VOLATILE (droppable, latest-wins); scene INIT/UPDATE are sent as reliable SERVER messages. Incremental sync is driven by `broadcastedElementVersions` vs `element.version`; periodic full resync (from `Collab.queueBroadcastAllElements`) repairs divergence from dropped messages. All scene/presence payloads are AES-encrypted with the room key before hitting the socket.
