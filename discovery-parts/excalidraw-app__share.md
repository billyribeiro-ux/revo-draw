## Cluster: excalidraw-app__share

This cluster implements the "Share" UX surface of the Excalidraw web app: a modal dialog for starting/managing a live-collaboration session, copying/sharing the room link, exporting a shareable backend link, and rendering a lazy-loaded QR code for the collaboration URL.

### excalidraw-app/share/qrcode.chunk.ts

Purpose: A deliberately tiny code-split chunk that wraps the `uqr` library's SVG QR-code renderer so the QR dependency is only pulled in on demand (dynamic `import("./qrcode.chunk")`).

- `generateQRCodeSVG(text: string): string` — L3-L5
  - Behavior: Calls `renderSVG(text)` from the `uqr` package and returns the resulting QR-code SVG markup as a raw string.
  - Inputs/outputs: Input is the arbitrary string to encode (in practice the active room link URL); output is an SVG document string (not a DOM node).
  - Side effects: None (pure delegation).
  - Invariant / performance note: This file exists purely as a dynamic-import boundary. The whole point is that `uqr` lives in its own bundle chunk (filename literally `qrcode.chunk.ts`) and is never loaded until a QR code is actually needed, keeping it out of the main bundle. The returned string is injected via `dangerouslySetInnerHTML` downstream (see `QRCode.tsx`), so the SVG is rendered as trusted HTML.

### excalidraw-app/share/QRCode.tsx

Purpose: A React component that lazily loads the QR chunk and renders the collaboration link as an inline SVG QR code, with a spinner while loading and a graceful (render-nothing) failure mode.

- Component `QRCode` — `({ value }: QRCodeProps) => JSX` — L8-L56
  - Props (`QRCodeProps`, L4-L6): `value: string` — the text/URL to encode into the QR code.
  - State (L9-L10):
    - `svgData: string | null` (`useState`, initial `null`) — holds the generated QR SVG markup once produced.
    - `error: boolean` (`useState`, initial `false`) — set when the chunk import or generation throws.
  - Effect (L12-L34, deps `[value]`): On mount and whenever `value` changes, it dynamically `import("./qrcode.chunk")`, then calls `generateQRCodeSVG(value)` and stores the result in `svgData`. A local `mounted` boolean (L13) guards all state writes so a stale async resolution after unmount cannot call `setState` (cleanup at L31-L33 sets `mounted = false`). Two failure paths both set `error = true`: an inner `try/catch` around generation (L18-L22) and a `.catch` on the dynamic import (L25-L29).
  - Render logic:
    - L36-L38: if `error`, render `null` (component silently disappears — no error UI).
    - L40-L46: if `svgData` is still `null` (loading), render a `<div className="ShareDialog__active__qrcode ShareDialog__active__qrcode--loading">` containing a `<Spinner />`.
    - L48-L55: otherwise render a `<div className="ShareDialog__active__qrcode" role="img" aria-label="QR code for collaboration link">` whose contents come from `dangerouslySetInnerHTML={{ __html: svgData }}`.
  - Side effects / invariants: The dynamic import is the lazy-load trigger for the QR dependency. The `mounted` flag is the key correctness invariant (prevents post-unmount setState). Accessibility: the rendered container is given `role="img"` with a fixed English `aria-label` (note: this label is hardcoded, not i18n-translated, unlike the surrounding dialog). The loading state uses the same `--loading` modifier class so the spinner occupies the QR-code slot.
  - Imports: `Spinner` from `@excalidraw/excalidraw/components/Spinner` (L2).

### excalidraw-app/share/ShareDialog.tsx

Purpose: The Share modal itself — a jotai-atom-driven dialog that either offers to start a collaboration session / export a backend share link (picker mode), or, when a room is already active, shows the live room link with copy / native-share / QR / stop-session controls.

Module-level exports and constants:

- `shareDialogStateAtom` — `atom<{ isOpen: false } | { isOpen: true; type: ShareDialogType }>({ isOpen: false })` — L32-L34
  - Behavior: A jotai atom holding the dialog's open/closed state plus, when open, the `ShareDialogType` (`"share" | "collaborationOnly"`, L30). This is the single source of truth for whether the Share dialog is shown and in which mode; external code opens the dialog by writing `{ isOpen: true, type }`.
- Type `OnExportToBackend` = `() => void` (L29); type `ShareDialogType` = `"share" | "collaborationOnly"` (L30).
- Type `ShareDialogProps` — L50-L55: `{ collabAPI: CollabAPI | null; handleClose: () => void; onExportToBackend: OnExportToBackend; type: ShareDialogType }`.

- `getShareIcon(): icon` — L36-L48
  - Behavior: User-agent sniffs to choose the platform-appropriate "share" glyph. Reads `window.navigator` (cast to `any`), tests `navigator.vendor` against `/Apple/` to detect Apple browsers, and checks `navigator.appVersion.indexOf("Win") !== -1` for Windows. Returns `shareIOS` for Apple, `shareWindows` for Windows, else the generic `share` icon.
  - Side effects: None beyond reading `window.navigator`. Invariant/parity note: this is UA-string heuristics, not feature detection; the actual share *capability* is gated separately by `"share" in navigator` in `ActiveRoomDialog`.

Components:

- `ActiveRoomDialog` — `({ collabAPI, activeRoomLink, handleClose }: { collabAPI: CollabAPI; activeRoomLink: string; handleClose: () => void }) => JSX` — L57-L179
  - Props: `collabAPI` (non-null `CollabAPI`), `activeRoomLink` (the room URL), `handleClose` (closes the dialog).
  - Hooks/state/refs:
    - `t` from `useI18n()` (L66) — translation function.
    - `[, setJustCopied]` (`useState(false)`, L67) — the boolean value is intentionally discarded (only the setter is used; the visual "copied" feedback is driven by `copyStatus` instead). `setJustCopied` toggles a 3-second timer state.
    - `timerRef = useRef<number>(0)` (L68) — stores the `setTimeout` handle so a previous "just copied" timer can be cleared before starting a new one.
    - `ref = useRef<HTMLInputElement>(null)` (L69) — points at the link `TextField` input so it can be programmatically `.select()`ed after copy.
    - `isShareSupported = "share" in navigator` (L70) — feature detection gating the native-share button.
    - `{ onCopy, copyStatus } = useCopyStatus()` (L71) — drives the copy-button's transient "copied" indicator.
  - `copyRoomLink = async () => {...}` (L73-L91): `await copyTextToSystemClipboard(activeRoomLink)`; on failure calls `collabAPI.setCollabError(t("errors.copyToSystemClipboardFailed"))`. Then sets `justCopied = true`, clears any existing `timerRef.current` timeout, schedules a new 3000 ms timeout to reset `justCopied` to `false`, and selects the input text (`ref.current?.select()`). Side effects: clipboard write, timer scheduling, DOM selection.
  - `shareRoomLink = async () => {...}` (L93-L103): Invokes the Web Share API `navigator.share({ title, text, url: activeRoomLink })` with `title`/`text` from `t("roomDialog.shareTitle")`. Any error is swallowed (`// Just ignore.`) — typically a user-cancelled share dialog.
  - Render (L105-L177): Header `t("labels.liveCollaboration")` with all `.` stripped via `.replace(/\./g, "")` (L108); a "Your name" `TextField` whose `defaultValue` is `collabAPI.getUsername()`, `onChange={collabAPI.setUsername}`, and `onKeyDown` closes the dialog on `KEYS.ENTER` (L110-L116); a link row (L117-L145) with a read-only full-width `TextField` bound to `ref` showing `activeRoomLink`, a conditional native-share `FilledButton` (only when `isShareSupported`, icon from `getShareIcon()`) calling `shareRoomLink`, and a copy `FilledButton` whose `status={copyStatus}` and whose `onClick` calls both `copyRoomLink()` and `onCopy()`; the `<QRCode value={activeRoomLink} />` (L146); a privacy/exit description block with a lock emoji marked `aria-hidden` (L147-L159); and a danger-styled "stop session" `FilledButton` (L161-L176) that on click fires `trackEvent("share", "room closed")`, calls `collabAPI.stopCollaboration()`, and closes the dialog only if `!collabAPI.isCollaborating()`.
  - Notable detail: the "copied" UI is driven by `copyStatus`/`onCopy` (from `useCopyStatus`), while the separate `justCopied`/`timerRef` machinery exists but its value is unused for rendering — a redundancy worth noting for a faithful reimplementation.

- `ShareDialogPicker` — `(props: ShareDialogProps) => JSX` — L181-L245
  - Behavior: The "nothing active yet" view. Builds `startCollabJSX` only when `props.collabAPI` is truthy (L186-L215): a header (`.`-stripped live-collaboration label), an intro+privacy description, and a "start session" `FilledButton` whose `onClick` fires `trackEvent("share", "room creation", \`ui (${getFrame()})\`)` then `collabAPI.startCollaboration(null)`. When `props.type === "share"` it also appends an "or" separator (L209-L213). The component returns `startCollabJSX` followed by, again only when `type === "share"`, an export-link section (L221-L242): header/description from `exportDialog.*` i18n keys and a `FilledButton` (LinkIcon) whose async `onClick` does `await props.onExportToBackend()` then `props.handleClose()`.
  - Inputs/side effects: `trackEvent` analytics calls; `getFrame()` (from `@excalidraw/common`) annotates the analytics with the embedding context (e.g. iframe vs top); collaboration start and backend export are delegated to props.
  - Invariant: In `"collaborationOnly"` mode, the export-link section and the "or" separator are both suppressed, leaving only the start-collaboration block.

- `ShareDialogInner` — `(props: ShareDialogProps) => JSX` — L247-L265
  - Behavior: Reads `activeRoomLink = useAtomValue(activeRoomLinkAtom)` (L248, atom imported from `../collab/Collab`). Renders a `Dialog size="small" title={false}` whose `onCloseRequest` is `props.handleClose`. Inside a `.ShareDialog` wrapper it conditionally renders `ActiveRoomDialog` when both `props.collabAPI` and `activeRoomLink` are truthy, otherwise `ShareDialogPicker`. This is the branch point between "active room" and "picker" views.

- `ShareDialog` (default exported component) — `(props: { collabAPI: CollabAPI | null; onExportToBackend: OnExportToBackend }) => JSX` — L267-L293
  - Behavior: The public entry point. Reads `[shareDialogState, setShareDialogState] = useAtom(shareDialogStateAtom)` (L271) and `{ openDialog } = useUIAppState()` (L273).
  - Effect (L275-L279, deps `[openDialog, setShareDialogState]`): if any other editor `openDialog` is set, it force-closes the share dialog by writing `{ isOpen: false }` — i.e. the share dialog is mutually exclusive with other editor dialogs.
  - Early return `null` when `!shareDialogState.isOpen` (L281-L283).
  - Otherwise renders `ShareDialogInner`, wiring `handleClose` to set `{ isOpen: false }`, passing through `collabAPI` and `onExportToBackend`, and forwarding `type={shareDialogState.type}` (the type read off the open-state atom) — L285-L292.
  - Side effects/invariants: Owns no local React state (state lives entirely in the jotai atom). The "close on other dialog open" effect is the key cross-dialog invariant.

Imports of significance: `trackEvent` (analytics), `copyTextToSystemClipboard` (clipboard), `Dialog`/`FilledButton`/`TextField`/icon set/`Spinner` (editor UI primitives), `useUIAppState`, `useCopyStatus`, `useI18n`, `KEYS`/`getFrame` from `@excalidraw/common`, the jotai helpers (`atom`/`useAtom`/`useAtomValue`) from `../app-jotai`, `activeRoomLinkAtom` and the `CollabAPI` type from `../collab/Collab`, and the local `QRCode` component plus `./ShareDialog.scss`. No non-trivial math, geometry, or coordinate-space logic exists anywhere in this cluster — it is purely UI/state plumbing plus a UA-sniff and a lazy QR generation.
