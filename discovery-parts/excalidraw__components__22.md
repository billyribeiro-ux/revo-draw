## Cluster: excalidraw__components__22

This cluster covers the Text-to-Diagram (TTD) Dialog's chat subsystem: the chat UI (interface, message bubbles, panel), the chat-history mutation hook, the CodeMirror-based Mermaid editor, and the shared Mermaid→Excalidraw conversion helpers (`common.ts`). These are React + jotai components/hooks with no canvas-space math except the export-canvas sizing in `common.ts`.

---

### packages/excalidraw/components/TTDDialog/Chat/ChatInterface.tsx

Renders the scrolling chat message list plus the auto-growing prompt textarea and send/stop button for the TTD chat panel.

- **`ChatInterface(props)` (React FC)** — L17-L191. Props (destructured inline, L17-L54): `chatId: string`, `messages: TChat.ChatMessage[]`, `currentPrompt: string`, `onPromptChange: (prompt: string) => void`, `onGenerate: TTTDDialog.OnGenerate`, `isGenerating: boolean`, optional `rateLimits?: { rateLimit: number; rateLimitRemaining: number } | null`, optional `onViewAsMermaid`, `generatedResponse`, `onAbort`, `onMermaidTabClick`, `onAiRepairClick`, `onDeleteMessage`, `onInsertMessage`, `onRetry`, `renderWelcomeScreen`, `renderWarning`. Renders welcome screen when `messages.length === 0`, else maps `messages` to `<ChatMessage>` keyed by `message.id` (L122-L139).
  - Refs/state: `messagesEndRef: HTMLDivElement` (L55), `textareaRef: HTMLTextAreaElement` (L56). No `useState`.
  - **`useLayoutEffect`** L58-L60: scrolls `messagesEndRef.current` into view whenever `messages` changes (auto-scroll to bottom). Uses `useLayoutEffect` (not `useEffect`) to scroll before paint, avoiding a visible jump.
  - **`useEffect`** L62-L66: focuses the textarea when `chatId` changes (re-focus on chat switch).
  - **`handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>)`** L68-L71: forwards textarea value to `onPromptChange`.
  - **`handleSubmit()`** L73-L86: if `isGenerating && onAbort`, calls `onAbort()` and returns (button doubles as stop). Else trims the prompt, no-ops on empty, calls `onGenerate({ prompt: trimmedPrompt })` and clears the prompt via `onPromptChange("")`.
  - **`handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>)`** L88-L95: Enter without Shift prevents default and submits (only when not generating); Shift+Enter inserts a newline.
  - **`canSend`** (const) L97-L100: `currentPrompt.trim().length > 3 && !isGenerating && (rateLimits?.rateLimitRemaining ?? 1) > 0`. Note the 3-character minimum and the `?? 1` default (treats missing rate-limit info as "allowed").
  - **`canStop`** (const) L102: `isGenerating && !!onAbort`.
  - **`onInput: FormEventHandler<HTMLTextAreaElement>`** L104-L108: auto-resize — sets `target.style.height = "auto"` then `Math.min(target.scrollHeight, 120)px`, capping the textarea at 120px tall. This two-step reset-then-measure is the standard auto-grow trick.
  - Send button (L175-L185) is disabled when `!canSend && !canStop`; icon toggles between `StopIcon` (generating) and `ArrowRightIcon`. Textarea is `disabled` only when `rateLimitRemaining === 0` (L170). Placeholder text branches across generating / rate-limited / has-messages / empty states (L161-L169).

---

### packages/excalidraw/components/TTDDialog/Chat/ChatMessage.tsx

Renders a single chat bubble (user / assistant / warning) with timestamp, error/repair affordances, and per-message action buttons (insert, view-as-mermaid, delete, retry).

- **`ChatMessage(props)` (React.FC)** — L10-L218. Props: `message: TChat.ChatMessage`, optional callbacks `onMermaidTabClick`, `onAiRepairClick`, `onDeleteMessage`, `onInsertMessage`, `onRetry` (all `(message|messageId) => void`), `rateLimitRemaining?: number`, `isLastMessage?: boolean`, `renderWarning?`, `allowFixingParseError?: boolean`.
  - State: `canRetry: boolean` (L33, `useState(false)`) — gates visibility of the retry button.
  - **`useEffect`** L35-L59 (deps `[message.error, message.lastAttemptAt, isLastMessage]`): retry-cooldown logic. Returns early if no error or not the last message. If there's an error with no `lastAttemptAt`, immediately allows retry. Otherwise computes `timeSinceLastAttempt = Date.now() - lastAttemptAt` and `remainingTime = Math.max(0, 5000 - timeSinceLastAttempt)` — a 5-second cooldown. If cooldown elapsed, allow retry now; else set `canRetry=false` and schedule a `setTimeout` for the remaining ms, cleaned up on unmount/deps-change. Key invariant: hard-coded 5000ms retry backoff.
  - **`formatTime(date: Date)`** L61-L63: returns `date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })`.
  - Warning branch L65-L107: for `message.type === "warning"`, renders a system bubble; uses `renderWarning?.(message)` override if provided; for `warningType === "messageLimitExceeded"` shows an upsell `FilledButton` that opens `${VITE_APP_PLUS_LP}/plus?...#excalidraw-redirect` in a new tab; else generic rate-limit text.
  - Main branch L109-L216: role label from `message.type` (user/assistant). Body shows error block (with `errorType !== "parse"` raw error message, and a parse-error repair UI gated by `allowFixingParseError`) or the message text with a blinking `▋` cursor span when `message.isGenerating` (L161-L163).
  - Action row (L168-L215) only for `type === "assistant" && !isGenerating`: Insert button (when `!message.error && onInsertMessage`), View-as-mermaid (when `onMermaidTabClick && message.content`), Delete (when `onDeleteMessage && errorType !== "network"`), Retry (when `errorType === "network" && onRetry && isLastMessage`, made invisible via `clsx(..., { invisible: !canRetry })`). Icons: `stackPushIcon`, `codeIcon`, `TrashIcon`, `RetryIcon`.

---

### packages/excalidraw/components/TTDDialog/Chat/index.ts

Barrel re-export only — no logic. Re-exports `ChatInterface` (from `./ChatInterface`), `ChatMessage` (from `./ChatMessage`), and `useChatAgent` (from `./useChatAgent`). L1-L3.

---

### packages/excalidraw/components/TTDDialog/Chat/TTDChatPanel.tsx

Composes the chat panel: wraps `ChatInterface` in a `TTDDialogPanel`, wires the `ChatHistoryMenu` header, and derives panel-action chips (rate-limit count, view-as-mermaid link) from the jotai `rateLimitsAtom`.

- **`TTDChatPanel(props)` (React FC)** — L20-L161. Props (L45-L74) are a superset of `ChatInterface`'s plus chat-history menu wiring: `isMenuOpen`, `onMenuToggle`, `onMenuClose`, `onNewChat`, `onRestoreChat: (chat: SavedChat) => void`, `onDeleteChat: (chatId: string, event: React.MouseEvent) => void`, `savedChats: SavedChat[]`, `activeSessionId: string`, plus required `onAbort`, `onMermaidTabClick`, `onAiRepairClick`, `onDeleteMessage`, `onInsertMessage`, optional `onRetry`, `onViewAsMermaid`, and optional `renderWelcomeScreen`/`renderWarning`.
  - State: reads `rateLimits` from `useAtom(rateLimitsAtom)` (L75; read-only, ignores setter).
  - **`getPanelActions(): TTDPanelAction[]`** L77-L102: builds the action chip list. If `rateLimits` present, pushes a `variant: "rateLimit"` chip labeled with `rateLimitRemaining`, adding the `--danger` className when `rateLimitRemaining < 5` (hard-coded threshold). If `generatedResponse` truthy, pushes a `variant: "link"` action `onViewAsMermaid` with `ArrowRightIcon`.
  - **`actions`** (const) L103: result of `getPanelActions()`.
  - **`getPanelActionFlexProp()`** L105-L114: returns flex `justify-content` — `"space-between"` for 2 actions, `"flex-start"` for a single rate-limit chip, else `"flex-end"`.
  - Renders `TTDDialogPanel` (label hosts `ChatHistoryMenu` with `isNewChatBtnVisible={!!messages.length}` and `disabled={isGenerating}`) containing `ChatInterface` with all callbacks forwarded (L116-L160).

---

### packages/excalidraw/components/TTDDialog/Chat/useChatAgent.ts

Hook exposing chat-history mutation helpers backed by the jotai `chatHistoryAtom`, delegating to pure `addMessages`/`updateAssistantContent` reducers.

- **`useChatAgent()`** — L8-L76. Reads/writes `[chatHistory, setChatHistory] = useAtom(chatHistoryAtom)` (L9). Returns `{ addUserMessage, addAssistantMessage, setAssistantError, chatHistory, setChatHistory, setLastRetryAttempt }` (L68-L75). All mutators use the functional `setChatHistory((prev) => ...)` form (immutable updates).
  - **`addUserMessage(content: string)`** L11-L20: appends a `{ type: "user", content }` message via `addMessages`.
  - **`addAssistantMessage()`** L22-L32: appends a placeholder `{ type: "assistant", content: "", isGenerating: true }` message (the bubble that streaming text fills in).
  - **`setLastRetryAttempt()`** L34-L40: stamps `lastAttemptAt: Date.now()` on the last assistant message via `updateAssistantContent` (drives the 5s retry cooldown in `ChatMessage`).
  - **`setAssistantError(errorMessage: string, errorType: "parse" | "network" | "other" = "other", errorDetails?: Error | unknown)`** L42-L66: serializes `errorDetails` to a JSON string of `{ name, message, stack }` (guarding for non-`Error` values via `instanceof`), then patches the last assistant message with `isGenerating: false, error, errorType, errorDetails`. Note: error details are stored serialized so they survive persistence.

---

### packages/excalidraw/components/TTDDialog/CodeMirrorEditor.tsx

A CodeMirror 6 editor component for editing Mermaid source, with light/dark themes, a lite Mermaid syntax mode, error-line highlighting, and Mod-Enter submit; manages the imperative `EditorView` lifecycle through refs and compartments.

- **`CodeMirrorEditorProps` (interface)** L24-L31: `value: string`, `onChange: (value: string) => void`, `onKeyboardSubmit?: () => void`, `placeholder?: string`, `theme: Theme`, `errorLine?: number | null`.
- **`darkTheme`** (const) L35-L53: `EditorView.theme({...}, { dark: true })` — VS-Code-dark colors incl. `.cm-errorLine` red-tint background `rgba(255,0,0,0.15)`.
- **`darkHighlight`** (const) L55-L64: `HighlightStyle.define([...])` mapping lezer `tags` (keyword/string/comment/number/operator/punctuation/variableName/bracket) to dark colors.
- **`lightTheme`** (const) L68-L83 and **`lightHighlight`** (const) L85-L94: light-theme equivalents; error line tint `rgba(255,0,0,0.1)`.
- **`errorLineDeco`** (const) L98: `Decoration.line({ class: "cm-errorLine" })`.
- **`getErrorLineExtension(errorLine: number|null|undefined, doc: { line(n): {from:number}; lines:number }): Extension`** L100-L111: returns an empty decoration set when `errorLine` is falsy, `< 1`, or `> doc.lines` (1-based line indexing, bounds-checked); otherwise resolves `doc.line(errorLine).from` and returns a single-line decoration. Coordinate detail: lines are 1-indexed per CodeMirror's API.
- **`getThemeExtensions(theme: Theme)`** L115-L120: returns `[darkTheme, syntaxHighlighting(darkHighlight)]` for `"dark"`, else light equivalents.
- **`CodeMirrorEditor(props)` (component, default export)** L122-L239.
  - Refs: `containerRef` (mount node), `viewRef` (the `EditorView`), `onChangeRef`/`onKeyboardSubmitRef` (latest-callback refs, updated every render at L137-L138 to avoid stale closures), `themeCompartmentRef`/`errorLineCompartmentRef` (CodeMirror `Compartment`s for reconfigurable extensions). L130-L135.
  - **Mount `useEffect`** L140-L189 (empty deps, exhaustive-deps disabled): creates the `EditorView` once with `doc: value` and an extension stack: a keymap binding `Mod-Enter` → `onKeyboardSubmitRef.current?.()` and `Mod-Shift-z` → `redo` (explicitly added for all platforms since `historyKeymap` only binds it on Mac, L159-L160); an `updateListener` that fires `onChangeRef.current(doc)` on `docChanged` (L162-L166); `history()`, default+history keymaps, `lineNumbers()`, `EditorView.lineWrapping`, the theme compartment, the error-line compartment (initially `[]`), `mermaidLite()` language mode, `drawSelection({ drawRangeCursor: true })`, and optional placeholder. Focuses the view, and on cleanup destroys it and nulls `viewRef`.
  - **Theme `useEffect`** L192-L202 (dep `[theme]`): dispatches `themeCompartment.reconfigure(getThemeExtensions(theme))` to hot-swap theme without recreating the view.
  - **Error-line `useEffect`** L205-L215 (dep `[errorLine]`): reconfigures the error-line compartment from `getErrorLineExtension(errorLine, view.state.doc)`.
  - **Value-sync `useEffect`** L218-L229 (dep `[value]`): if external `value` differs from `view.state.doc.toString()`, dispatches a full-document replace `{ from: 0, to: currentDoc.length, insert: value }`. Guard against the differ avoids feedback loops with the `onChange` listener.
  - Renders a single `<div ref={containerRef} className="ttd-dialog-input ttd-dialog-input--codemirror" />`.

---

### packages/excalidraw/components/TTDDialog/common.ts

Shared helpers for the Mermaid-to-Excalidraw flow: reset the preview, run the Mermaid parse + canvas render, persist the Mermaid source, and insert converted elements into the editor.

- **`resetPreview({ canvasRef, setError })`** L22-L41: clears the preview DOM. No-ops if `canvasRef.current` or its `parentElement` is missing; otherwise clears the parent's background, calls `setError(null)`, and `canvasNode.replaceChildren()` (removes any rendered `<canvas>`).
- **`convertMermaidToExcalidraw({ canvasRef, mermaidToExcalidrawLib, mermaidDefinition, setError, data, theme }): Promise<{success:true} | {success:false; error?:Error}>`** L43-L131: the core conversion+render pipeline.
  - Returns `{success:false}` early if canvas node/parent missing, or resets preview and returns `{success:false}` if `mermaidDefinition` is empty (L61-L71).
  - Awaits `mermaidToExcalidrawLib.api`, then `api.parseMermaidToExcalidraw(mermaidDefinition)`. On parse failure: if the definition contains no `"`, returns the original error; if it does, retries once with all `"` replaced by `'` (a common Mermaid-quoting fix), and on second failure deliberately returns the *original* error to keep line/column references aligned with the user's unmodified input (L77-L95) — a notable UX-correctness invariant.
  - On success: `convertToExcalidrawElements(elements, { regenerateIds: true })` and stores `{ elements, files }` into the `data` mutable ref (L100-L105).
  - Renders via `exportToCanvas` with `exportPadding: DEFAULT_EXPORT_PADDING` and `maxWidthOrHeight: Math.max(parent.offsetWidth, parent.offsetHeight) * window.devicePixelRatio` (L107-L117) — DPR-aware sizing so the preview is crisp on retina; uses the longest parent dimension as the bound. Sets parent background to `var(--default-bg-color)`, swaps in the canvas via `replaceChildren(canvas)`, returns `{success:true}`. Outer catch (L122-L130) sets background, calls `setError(err)` only if a definition existed, and returns `{success:false, error:err}`.
- **`saveMermaidDataToStorage(mermaidDefinition: string)`** L132-L137: persists the source to `EditorLocalStorage.set(EDITOR_LS_KEYS.MERMAID_TO_EXCALIDRAW, mermaidDefinition)`.
- **`insertToEditor({ app, data, text?, shouldSaveMermaidDataToStorage? })`** L139-L170: no-ops if `data.current.elements` is empty; otherwise calls `app.addElementsFromPasteOrLibrary({ elements, files, position: "center", fitToContent: true })`, closes the dialog via `app.setOpenDialog(null)`, and optionally persists the source via `saveMermaidDataToStorage(text)` when `shouldSaveMermaidDataToStorage && text`.
