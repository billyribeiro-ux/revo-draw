## Cluster: excalidraw-app__components__1

This cluster contains three small React/TSX modules from the Excalidraw web app: a promo banner link, the Excalidraw+ export card (plus its async upload routine), and the top-level error boundary. None contain canvas/geometry math; they are presentation and integration glue.

### excalidraw-app/components/ExcalidrawPlusPromoBanner.tsx

Purpose: A single anchor-link banner pointing the user to Excalidraw+ (the paid product), routing to either the app or the landing page depending on sign-in state.

- `ExcalidrawPlusPromoBanner({ isSignedIn }: { isSignedIn: boolean })` — L1-L22
  - A function component (arrow function, default-styled `<a className="plus-banner">`). Renders a link whose `href` branches on `isSignedIn`: if signed in, links to `import.meta.env.VITE_APP_PLUS_APP`; otherwise links to `${VITE_APP_PLUS_LP}/plus?utm_source=excalidraw&utm_medium=app&utm_content=guestBanner#excalidraw-redirect` (L8-L14). Opens in a new tab with `target="_blank"` and `rel="noopener"` (L15-L16). Link text is the literal `Excalidraw+`.
  - Props: `isSignedIn: boolean`. No state, refs, effects, or event handlers. Purely environment-variable-driven URL construction; the UTM query string and `#excalidraw-redirect` hash are load-bearing for the guest path only.

### excalidraw-app/components/ExportToExcalidrawPlus.tsx

Purpose: Provides the async routine that encrypts the current scene and uploads it to Firebase for migration into Excalidraw+, plus a `Card`-based UI button that triggers it.

- `exportToExcalidrawPlus(elements: readonly NonDeletedExcalidrawElement[], appState: Partial<AppState>, files: BinaryFiles, name: string) => Promise<void>` — L32-L88 (exported async)
  - End-to-end "export to Excalidraw+" pipeline. Steps: (1) lazy-loads Firebase storage via `loadFirebaseStorage()` (L38); (2) generates a 12-char `nanoid` scene id (L40); (3) generates an encryption key via `generateEncryptionKey()` (non-null-asserted, L42); (4) serializes the scene with `serializeAsJSON(elements, appState, files, "database")` and encrypts it with `encryptData(encryptionKey, ...)` (L43-L46); (5) packs the IV + encrypted buffer into a `Blob` with `MIME_TYPES.binary` (L48-L53); (6) uploads to Firebase at `/migrations/scenes/${id}` with `customMetadata` carrying `{version:2,name}` JSON and a `created` timestamp string (L55-L61); (7) builds a `Map<FileId, BinaryFileData>` of only initialized image elements whose binary is present in `files` (L63-L68); (8) if any files, `encodeFilesForUpload` with `FILE_UPLOAD_MAX_BYTES` cap and `saveFilesToFirebase` under `/migrations/files/scenes/${id}` (L70-L81); (9) `window.open` to `${VITE_APP_PLUS_APP}/import?excalidraw=${id},${encryptionKey}` (L83-L87).
  - Notable: encryption key and scene id are concatenated comma-separated into the import URL — the key is the decryption secret passed in the URL fragment-equivalent query. Side effects: network uploads, opens a new window. Invariant: only image elements passing `isInitializedImageElement` AND present in `files` are uploaded (avoids uploading deleted/uninitialized image bodies). `customMetadata.version` is hardcoded to 2.
  - Notable inputs/outputs: consumes the editor's `elements`/`appState`/`files`/`name`; produces remote Firebase objects and a redirect. No return value.

- `ExportToExcalidrawPlus: React.FC<{...}>` — L90-L135
  - The UI card. Props (L90-L97): `elements: readonly NonDeletedExcalidrawElement[]`, `appState: Partial<AppState>`, `files: BinaryFiles`, `name: string`, `onError: (error: Error) => void`, `onSuccess: () => void`.
  - Uses `useI18n()` to get `t` (L98). Renders a `<Card color="primary">` with the `ExcalidrawLogo` (forced white via the `--color-logo-icon` CSS custom property cast to `any`, sized 2.8rem, L102-L108), an `<h2>Excalidraw+</h2>`, a translated description (`exportDialog.excalidrawplus_description`), and a `ToolButton`.
  - Key event handler — the `ToolButton.onClick` (L120-L131): fires `trackEvent("export","eplus",`ui (${getFrame()})`)` analytics, awaits `exportToExcalidrawPlus(...)`, then calls `onSuccess()`. On error it `console.error`s and, unless the error is an `AbortError`, calls `onError(new Error(t("exportDialog.excalidrawplus_exportError")))` (swallows abort/cancel quietly). No internal state/refs/effects.

### excalidraw-app/components/TopErrorBoundary.tsx

Purpose: A React class error boundary that catches uncaught render errors app-wide, reports them to Sentry, and renders a recovery "error splash" UI with localStorage dump and a GitHub-issue link.

- `interface TopErrorBoundaryState` — L6-L10: `{ hasError: boolean; sentryEventId: string; localStorage: string }` (types-only declaration consumed by the class).

- `class TopErrorBoundary extends React.Component<any, TopErrorBoundaryState>` — L12-L146
  - Initial state (L16-L20): `hasError:false`, `sentryEventId:""`, `localStorage:""`. Props typed loosely as `any` (it only consumes `this.props.children`).

  - `render()` — L22-L24: returns `this.errorSplash()` when `hasError`, otherwise `this.props.children`. Standard error-boundary gate.

  - `componentDidCatch(error: Error, errorInfo: any)` — L26-L46: Builds a snapshot `_localStorage` object by iterating `Object.entries({ ...localStorage })`, attempting `JSON.parse` of each value and falling back to the raw string on parse failure (L27-L34). Then `Sentry.withScope`: attaches `errorInfo` as extras, captures the exception to get `eventId`, and `setState` to `{hasError:true, sentryEventId:eventId, localStorage: JSON.stringify(_localStorage)}` (L36-L45). Side effects: Sentry capture, state mutation. Note: `setState` is called inside the Sentry scope callback so `sentryEventId` is the captured id.

  - `private selectTextArea(event: React.MouseEvent<HTMLTextAreaElement>)` — L48-L53: If the textarea is not already the active element, `preventDefault()` then programmatically `.select()`s it. Used as the `onPointerDown` handler so a pointer-down selects all scene-content text without losing focus on re-press.

  - `private async createGithubIssue()` — L55-L73: Dynamically imports `../bug-issue-template` (webpackChunkName `bug-issue-template`), calls its default export with `this.state.sentryEventId` to build a body string, `encodeURIComponent`s it (L57-L63; `console.error` and empty body on import failure), then `window.open`s `https://github.com/excalidraw/excalidraw/issues/new?body=${body}` in a new tab with `noopener noreferrer` (L68-L72). Side effects: dynamic import, opens window.

  - `private errorSplash()` — L75-L145: Renders the recovery UI (`<div className="ErrorSplash excalidraw">`). Contains: a `Trans` headingMain with a reload button (`window.location.reload()`, L80-L85); a `Trans` clearCanvasMessage whose button does `localStorage.clear()` then reloads (wrapped in try/catch logging errors, L88-L104) plus a warning caveat line with ⚠️ emoji spans (L105-L114); a Sentry event-id paragraph via `t("errorSplash.trackedToSentry",{eventId})` (L117-L121); a `Trans` openIssueMessage button calling `this.createGithubIssue()` (L122-L129); and a read-only `<textarea rows={5}>` showing `this.state.localStorage` with `onPointerDown={this.selectTextArea}` (L130-L140). All copy is i18n-driven via `t` / `Trans`.

  - No effects/refs beyond class state. Invariants: this is the outermost boundary — a thrown render error flips to the splash and only a reload or localStorage-clear recovers; the localStorage textarea is the user's "scene content" backup for recovery.
