## Cluster: excalidraw__components__24

This cluster covers the presentational/structural React components of the Text-to-Diagram (TTD) dialog: the top-level dialog shell, the code-input editor wrapper, the rendered-diagram output panel with Mermaid error guidance, the generic two-panel layout primitives, the keyboard-shortcut hint, and the Radix tab content wrapper. There is no canvas math here — the dialog is a DOM/React surface; the only "geometry-adjacent" detail is the lazily-mounted `canvasRef` div that downstream code renders an Excalidraw scene into, and the fixed dialog width.

### packages/excalidraw/components/TTDDialog/TTDDialog.tsx

Top-level Text-to-Diagram dialog component that gates rendering on the open-dialog app state and wires up the two tabs (text-to-diagram and Mermaid) inside a `Dialog`, lazy-loading the `@excalidraw/mermaid-to-excalidraw` library.

- `TTDDialog(props)` — exported React component. Props are a discriminated union: either `{ onTextSubmit, renderWelcomeScreen?, renderWarning?, persistenceAdapter }` (typed against the `TTTDDialog` namespace and `TTDPersistenceAdapter`) or `{ __fallback: true }` (L26-L34). Reads `useUIAppState()` (L36); returns `null` unless `appState.openDialog?.name === "ttd"` (L38-L40) — this is the visibility guard / invariant that the dialog only mounts when the TTD dialog is open. When open, renders `<TTDDialogBase {...props} tab={appState.openDialog.tab} />`, forwarding the active tab from app state (L42). Side effect: none beyond reading context. (L26-L43)
- `TTDDialog.WelcomeMessage = TTDWelcomeMessage` — static property assignment exposing the welcome-message subcomponent on the dialog (L45).
- `TTDDialogBase` — internal component wrapped by `withInternalFallback("TTDDialogBase", ...)` (L50-L135). The HOC ensures only one instance renders even if both host app and library mount it; if it's the fallback instance it receives `{ __fallback: true }`. Props: `{ tab: "text-to-diagram" | "mermaid" }` intersected with the same submit/persistence union as `TTDDialog` (L52-L67).
  - State/refs/effects it owns:
    - `mermaidToExcalidrawLib` via `useState<MermaidToExcalidrawLibProps>({ loaded: false, api: import("@excalidraw/mermaid-to-excalidraw") })` (L70-L74) — kicks off a dynamic import immediately; `api` holds the import promise, `loaded` is the readiness flag. Performance detail: the heavy mermaid library is code-split and only fetched when the dialog mounts.
    - `useEffect` (deps `[mermaidToExcalidrawLib.api]`, L76-L82) — awaits the import promise then sets `loaded: true` via functional update preserving the rest of the object. Invariant: `loaded` flips exactly once per imported `api`.
  - Renders a `Dialog` with `className="ttd-dialog"`, `onCloseRequest` calling `app.setOpenDialog(null)` (L87-L89), fixed `size={1520}` (L90 — fixed dialog pixel width), `title={false}`, spreads `rest`, and `autofocus={false}` (L92-L93). Inside: `TTDDialogTabs` (dialog="ttd", active `tab`). If fallback, shows a plain mermaid title `<p>` (L96-L97); otherwise renders `TTDDialogTabTriggers` with two `TTDDialogTabTrigger`s ("text-to-diagram" with an AI-beta badge, and "mermaid") (L99-L111). The text-to-diagram `TTDDialogTab` (only when not fallback) mounts `TextToDiagram`, forwarding `mermaidToExcalidrawLib`, `onTextSubmit`, `renderWelcomeScreen`, `renderWarning`, `persistenceAdapter` (L114-L124). The mermaid `TTDDialogTab` always mounts `MermaidToExcalidraw` with `isActive={tab === "mermaid"}` (L125-L130). Uses `useApp()` (L68) for the close action and `t()` for i18n labels.

### packages/excalidraw/components/TTDDialog/TTDDialogInput.tsx

Input surface for the TTD dialog that lazily code-splits a CodeMirror editor and degrades to a plain `<textarea>` (with manual Ctrl/Cmd+Enter handling) if the import fails, showing a delayed spinner while loading.

- `TTDDialogInputProps` (interface, L12-L18) — `input: string`, `placeholder: string`, `onChange: (value: string) => void`, `onKeyboardSubmit?: () => void`, `errorLine?: number | null`.
- `EditorState` (type, L20-L23) — discriminated union `{ type: "loading" } | { type: "ready"; component: ComponentType<CodeMirrorEditorProps> } | { type: "fallback" }`.
- `SPINNER_DELAY_MS = 300` (L25) — constant; delay before the loading spinner is shown to avoid a flash on fast loads.
- `TTDDialogInput({ input, placeholder, onChange, onKeyboardSubmit, errorLine })` — exported React component (L27-L137).
  - Refs/state:
    - `ref = useRef<HTMLTextAreaElement>(null)` (L34) — the fallback textarea element.
    - `callbackRef = useRef(onKeyboardSubmit)` with `callbackRef.current = onKeyboardSubmit` on every render (L36-L37) — keeps the latest submit callback addressable inside the long-lived event listener without re-subscribing. (Notable pattern: stable-listener / latest-ref to avoid stale closures.)
    - `editorState` via `useState<EditorState>({ type: "loading" })` (L39-L41); `showSpinner` boolean (L42).
    - `theme` from `useUIAppState()` (L44) — passed to the CodeMirror editor.
  - Effects:
    - Lazy-load effect (deps `[]`, L47-L75): sets a `setTimeout` of `SPINNER_DELAY_MS` to flip `showSpinner` true (guarded by a `cancelled` flag), dynamically imports `./CodeMirrorEditor`; on success sets `{ type: "ready", component: mod.default }`, on failure sets `{ type: "fallback" }`, and in `finally` clears the spinner timer. Cleanup sets `cancelled = true` and clears the timer. Invariant: state transitions only fire if not cancelled (prevents setState-after-unmount).
    - Fallback keyboard effect (deps `[editorState.type]`, L78-L99): only active when `editorState.type === "fallback"` and a callback exists. Focuses the textarea, attaches a native `keydown` listener (via `EVENT.KEYDOWN`) that, on `event[KEYS.CTRL_OR_CMD] && event.key === KEYS.ENTER`, prevents default and invokes `callbackRef.current?.()`; cleanup removes the listener. Side effect: programmatic focus + native DOM listener.
  - Render branches: `ready` → renders the dynamically-loaded `CodeMirrorEditor` with `value/onChange/onKeyboardSubmit/placeholder/theme/errorLine` (L101-L113); `fallback` → plain `<textarea className="ttd-dialog-input">` controlled by `input`/`onChange` (L115-L125); `loading` + `showSpinner` → spinner wrapper (L128-L134); otherwise returns `null` (no flash during the 300ms window) (L136).

### packages/excalidraw/components/TTDDialog/TTDDialogOutput.tsx

Output panel that displays the rendered diagram (into a passed `canvasRef` div) or a structured Mermaid parse-error block with summary, likely-causes, the formatted error message (with caret-line highlighting), and an optional auto-fix button; shows a spinner until `loaded`.

- `TTDDialogOutputProps` (interface, L14-L22) — `error: Error | null`, `canvasRef: React.RefObject<HTMLDivElement | null>`, `loaded: boolean`, `hideErrorDetails?: boolean`, `sourceText?: string`, `autoFixAvailable?: boolean`, `onApplyAutoFix?: () => void`.
- `TTDDialogOutput({ error, canvasRef, loaded, hideErrorDetails, sourceText, autoFixAvailable, onApplyAutoFix })` — exported React component (L24-L122). Stateless (pure render from props); owns no refs/effects — the `canvasRef` is owned by the parent.
  - Derived values: `errorMessage` — when an error exists, either a generic i18n string if `hideErrorDetails`, else `formatMermaidParseErrorMessage(error.message)` (L33-L37); `syntaxGuidance` — `getMermaidSyntaxErrorGuidance(error.message, sourceText)` only when error and not hiding details (L38-L41); `showAutoFixButton` — `autoFixAvailable && onApplyAutoFix && !hideErrorDetails` (L42-L43); `errorMessageLines` — `errorMessage?.split(/\r?\n/) ?? []` splitting on CRLF/LF (L45).
  - Render: outer wrapper toggles an `--error` modifier class (L48-L52). Error block (L53-L107): alert-triangle icon, optional `syntaxGuidance` summary with a "Likely causes:" `<ul>` mapping `likelyCauses` (keyed by cause string, L71-L75), then the error message rendered line-by-line as `<span>`s — each line gets a caret modifier class when `isMermaidCaretLine(line)` is true, and a `"\n"` is appended between lines (L78-L92). Auto-fix slot renders a `Button` (`onSelect={onApplyAutoFix}`) when `showAutoFixButton` (L93-L104). Canvas block (L108-L116): when `loaded`, renders `<div ref={canvasRef} className="ttd-dialog-output-canvas-content" />` inside a container that gets an `invisible` class while an error is present (so the canvas stays mounted but hidden); otherwise a `<Spinner size="2rem" />` (L118). Notable detail: the canvas div is kept mounted-but-invisible on error rather than unmounted, preserving the render target.

### packages/excalidraw/components/TTDDialog/TTDDialogPanel.tsx

Generic single panel (header label + children + a footer action row) used for both the input and output sides of the TTD dialog, supporting three action variants (button, link, rateLimit), in-progress spinner state, and a configurable footer justification.

- `TTDPanelAction` (exported type, L10-L17) — `{ label: string; action?: () => void; icon?: ReactNode; variant: "button" | "link" | "rateLimit"; disabled?: boolean; className?: string }`.
- `TTDDialogPanelProps` (interface, L19-L34) — `label?`, `children`, `panelActions?`, `onTextSubmitInProgess?` (note the misspelling "Progess" is the real prop name), `renderTopRight?`, `renderSubmitShortcut?`, `className?`, `panelActionJustifyContent?` (CSS justify-content union, default `"flex-start"`).
- `TTDDialogPanel({ ... })` — exported React component (L36-L124). Stateless; owns no refs/effects.
  - `renderPanelAction(panelAction: TTDPanelAction)` — internal closure (L46-L96) returning markup per `variant`:
    - `"link"` → a `<button type="button">` with `onClick={panelAction.action}`, disabled when `panelAction.disabled || onTextSubmitInProgess`, optional trailing icon span (L47-L65).
    - `"button"` → the shared `Button` with `onSelect` (defaulting to a no-op when no action), same disabled logic; while `onTextSubmitInProgess` the label/icon get an `invisible` class and a `Spinner` is overlaid (L68-L82). Notable: the label is hidden (not removed) so the button keeps its width while showing the spinner — avoids layout shift.
    - `"rateLimit"` → a non-interactive `<div>` showing the label (L84-L95).
  - Render: optional header (`<label>` if `label` is a string, else the node) plus `renderTopRight?.()` (L100-L105); then `children`; then a button container whose `invisible` class toggles on empty `panelActions`, with inline `justifyContent` style (L107-L114). Maps `panelActions.filter(Boolean)` into `Fragment`s keyed by `panelAction.label` (L115-L119), and renders `renderSubmitShortcut?.()` only when not in progress (L120).

### packages/excalidraw/components/TTDDialog/TTDDialogPanels.tsx

Trivial flex/grid layout wrapper that holds the two `TTDDialogPanel`s side by side.

- `TTDDialogPanels({ children }: { children: ReactNode })` — exported React component; renders `<div className="ttd-dialog-panels">{children}</div>` (L3-L5). No logic, props, state, or effects.

### packages/excalidraw/components/TTDDialog/TTDDialogSubmitShortcut.tsx

Static visual hint showing the "Ctrl/Cmd + Enter" submit keyboard shortcut.

- `TTDDialogSubmitShortcut()` — exported React component (L3-L14). Renders two key chips using `getShortcutKey("CtrlOrCmd")` and `getShortcutKey("Enter")` (imported from `../../shortcut`), which platform-localizes the modifier symbol (⌘ on macOS vs Ctrl elsewhere). No props/state/effects.

### packages/excalidraw/components/TTDDialog/TTDDialogTab.tsx

Thin wrapper over Radix UI `Tabs.Content` that maps a `tab` string to the Radix `value`, used as the content region for each TTD tab.

- `TTDDialogTab({ tab, children, ...rest })` — exported React component (L3-L16). Props: `{ tab: string; children: React.ReactNode }` intersected with `React.HTMLAttributes<HTMLDivElement>` (L4-L10); spreads `rest` onto `RadixTabs.Content` and sets `value={tab}` (L12). `TTDDialogTab.displayName = "TTDDialogTab"` (L17) — set so the parent `TTDDialogTabs` can identify these children by display name. No state/effects.
