## Cluster: excalidraw__components__23

This cluster covers the **Text-To-Diagram (TTD) Dialog** subsystem of Excalidraw: the hooks that drive chat-based mermaid generation, the mermaid → Excalidraw rendering throttle, the LLM text-generation/streaming flow, a lightweight CodeMirror mermaid syntax highlighter, the standalone Mermaid-to-Excalidraw conversion dialog (with auto-fix search), the chat-based Text-To-Diagram dialog container, and the Jotai atoms that hold TTD UI state.

There is no significant non-obvious geometry here; the "math" lives downstream in `convertMermaidToExcalidraw` (in `../common`) and in `@excalidraw/mermaid-to-excalidraw`. The notable engineering is the **adaptive throttle scheduler** for live-streaming rendering and the **breadth-first auto-fix search** over mermaid candidate texts.

---

### packages/excalidraw/components/TTDDialog/hooks/useChatManagement.ts

Purpose: React hook that owns chat-session lifecycle operations (restore, delete, new-chat, menu open/close) on top of the persistence adapter and the shared `chatHistoryAtom`.

- **`useChatManagement({ persistenceAdapter }: UseChatManagementProps)`** — exported hook (L17-L114). Wires `errorAtom` (set-only), `chatHistoryAtom` (read/write), and a local `isMenuOpen` boolean state (L20-L22). Delegates storage to `useTTDChatStorage` to obtain `restoreChat`, `deleteChat`, `createNewChatId` (L24-L26). Returns `{ isMenuOpen, onRestoreChat, handleDeleteChat, handleNewChat, handleMenuToggle, handleMenuClose }` (L106-L113).
  - **`applyChatToState(chat: SavedChat) => void`** — `useCallback` (L28-L52). Normalizes each message `timestamp` to a `Date` (handles both `Date` instances and serialized values, L30-L36), builds a `history` object `{ id, messages, currentPrompt: "" }`, derives the last assistant message via `getLastAssistantMessage`, sets `errorAtom` to a `new Error(lastAssistantMsg.error)` if present else `null` (L46-L48), then writes `chatHistoryAtom`. Side effect: mutates two atoms. Invariant: restored prompt is always reset to empty string.
  - **`resetChatState() => Promise<void>`** — `useCallback`, async (L54-L62). Awaits `createNewChatId()`, resets `chatHistoryAtom` to an empty session with that id, clears `errorAtom`. Side effect: allocates a new persistent chat id.
  - **`onRestoreChat(chat: SavedChat) => void`** — `useCallback` (L64-L72). Calls `restoreChat(chat)` (persistence-layer normalization) then `applyChatToState`, then closes the menu. Note dependency array omits `setIsMenuOpen` (stable) and `resetChatState`.
  - **`handleDeleteChat(chatId: string, event: React.MouseEvent) => Promise<void>`** — `useCallback`, async (L74-L91). Calls `event.stopPropagation()` (prevents the row click from also restoring), checks whether the deleted chat is the active one (`chatId === chatHistory.id`), awaits `deleteChat(chatId)` which returns the remaining chats; if the active chat was deleted it applies the first remaining chat or, if none remain, calls `resetChatState()`. Invariant: deleting a non-active chat leaves current state untouched.
  - **`handleNewChat() => Promise<void>`** — `useCallback`, async (L93-L96). `resetChatState()` then close menu.
  - **`handleMenuToggle() => void`** — `useCallback` (L98-L100). Toggles `isMenuOpen` via functional updater.
  - **`handleMenuClose() => void`** — `useCallback` (L102-L104). Forces `isMenuOpen=false`.

---

### packages/excalidraw/components/TTDDialog/hooks/useMermaidRenderer.ts

Purpose: React hook that converts the latest assistant mermaid text into Excalidraw elements and lives-renders it into a canvas DIV, using an **adaptive self-tuning throttle** so streaming output renders smoothly without thrashing on invalid intermediate syntax.

Module constants (L18-L21): `FAST_THROTTLE_DELAY = 300` ms, `SLOW_THROTTLE_DELAY = 3000` ms, `RENDER_SPEED_THRESHOLD = 100` ms (renders slower than this downgrade to the slow throttle), `PARSE_FAIL_DELAY = 100` ms (back-off window used after a parse failure).

- **`useMermaidRenderer({ mermaidToExcalidrawLib, canvasRef }: UseMermaidRendererProps)`** — exported hook (L28-L213). Reads `chatHistoryAtom`, `errorAtom` (write), `showPreviewAtom` (read/write), and theme from `useUIAppState`. Returns `{ data }` — a ref holding the most recent `{ elements, files }` conversion result (L49-L55, L210-L212), which the consuming component reads when inserting into the editor.

  Refs/state owned:
  - `isRenderingRef` (L36) — re-entrancy guard so only one conversion runs at a time.
  - `lastAssistantMessage` — `useMemo` over `getLastAssistantMessage(chatHistory)` (L38-L41), mirrored into `lastAssistantMessageRef` via an effect (L44-L47) so navigation effects can read it without re-subscribing.
  - `data` ref — `{ elements: readonly NonDeletedExcalidrawElement[]; files: BinaryFiles | null }` (L49-L55).
  - `lastRenderTimeRef`, `pendingContentRef`, `hasErrorOffsetRef`, `currentThrottleDelayRef` — throttle bookkeeping (L57-L60).

  Functions:
  - **`renderMermaid(mermaidDefinition: string) => Promise<boolean>`** — `useCallback` (L64-L99). Early-returns `false` if the definition is blank or the lib isn't loaded, or if a render is already in flight. Sets the re-entrancy guard, times the `convertMermaidToExcalidraw(...)` call with `performance.now()`, and **adaptively sets the throttle**: if render duration `< RENDER_SPEED_THRESHOLD` (100ms) use `FAST_THROTTLE_DELAY`, else `SLOW_THROTTLE_DELAY` (L87-L93). Clears the guard and returns `result.success`. Side effect: mutates the `data` ref via `convertMermaidToExcalidraw` and may set `errorAtom`.
  - **`throttledRenderMermaid`** — `useMemo`-built throttled function with attached `.flush()` and `.cancel()` methods (L101-L151). Algorithm in `fn(content)`:
    - Computes `timeSinceLastRender = now - lastRenderTimeRef` and the current adaptive `throttleDelay` (L103-L105).
    - If `!isValidMermaidSyntax(content)` (cheap pre-check), it does **not** render; instead, the first time it sees invalid syntax it nudges `lastRenderTimeRef` forward to `now - throttleDelay + PARSE_FAIL_DELAY` so the next valid content renders after only ~100ms, sets `hasErrorOffsetRef`, and stashes the content as pending (L107-L117). Invariant: the back-off offset is applied at most once per error streak.
    - Otherwise clears the error offset (L119); if still inside the throttle window, stash as pending and return (L121-L124).
    - On a real render it clears pending, awaits `renderMermaid`, stamps `lastRenderTimeRef = Date.now()`, and **on failure rewinds** `lastRenderTimeRef` by `throttleDelay - PARSE_FAIL_DELAY` to retry quickly (L126-L134).
    - **`.flush()`** (L137-L144): if there is pending content, render it immediately and stamp the time. Used to force the final frame when streaming ends.
    - **`.cancel()`** (L146-L148): drops pending content without rendering.
  - **`resetThrottleState() => void`** — `useCallback` (L153-L158). Resets all four throttle refs to initial (delay back to FAST). 

  Effects:
  - **Streaming render effect** (L161-L176): while the last assistant message `isGenerating` and has content, feed it through the throttle; when generation stops, `flush()`, `resetThrottleState()`, then render the final content once. Deps include `isGenerating` and `content`.
  - **Chat-navigation render effect** (L179-L190): keyed on `chatHistory.id`; reads `lastAssistantMessageRef` (not the memo) and renders the last message directly when the user switches chats, but only if there's content, no message error, and the preview is visible.
  - **Preview-visibility effect** (L192-L208): if there are no assistant messages it clears the canvas DOM (`parent.style.background = ""`, `canvasNode.replaceChildren()`) and hides preview; otherwise shows preview. Direct DOM mutation of the canvas container.

  Performance/coordinate note: the throttle is deliberately self-tuning to keep streaming responsive when conversions are fast (<100ms) but avoid layout thrash when they're slow; a Svelte/Canvas reimplementation must replicate the `now - throttleDelay + PARSE_FAIL_DELAY` rewind trick to match retry latency exactly.

---

### packages/excalidraw/components/TTDDialog/hooks/useTextGeneration.ts

Purpose: React hook that drives the LLM call for text-to-mermaid generation — prompt validation, streaming consumption into chat history, rate-limit/abort handling, and post-generation mermaid parse validation.

Module constants (L23-L24): `MIN_PROMPT_LENGTH = 3`, `MAX_PROMPT_LENGTH = 10000`.

- **`useTextGeneration({ onTextSubmit })`** — exported hook (L26-L225). `onTextSubmit` is the caller-supplied async LLM transport `(TTTDDialog.OnTextSubmitProps) => Promise<TTTDDialog.OnTextSubmitRetValue>`. Reads/writes `errorAtom`, `rateLimitsAtom`, `chatHistoryAtom`; pulls `addUserMessage`, `addAssistantMessage`, `setAssistantError` from `useChatAgent`. Owns `streamingAbortControllerRef` (L40). Returns `{ onGenerate, handleAbort }` (L221-L224).
  - **`validatePrompt(prompt: string) => boolean`** — internal (L42-L64). Returns `false` if length is out of `[MIN, MAX]` bounds or `rateLimitRemaining === 0`; sets a localized `errorAtom` message for too-short/too-long. Note: the rate-limit-exhausted case returns false without setting an error here.
  - **`onGenerate: TTTDDialog.OnGenerate = async ({ prompt, isRepairFlow = false }) => Promise<void>`** — internal (L66-L213). Core flow:
    - Validate; abort any in-flight stream; clear error; create a fresh `AbortController` (L70-L81).
    - For a normal flow, push a user message + an empty assistant message; for a **repair flow**, instead reset the existing assistant message content/error and mark `isGenerating` (L83-L96).
    - Builds the LLM message list as **the last 3 prior messages + the new user prompt** (`previousMessages.slice(-3)`) — a hard context-window cap (L101-L106).
    - Calls `onTextSubmit({ messages, onStreamCreated, onChunk, signal })`:
      - `onStreamCreated` (L111-L121): for repair flow, clears assistant content and re-marks generating.
      - `onChunk(chunk)` (L122-L129): appends the chunk to the last assistant message's content via `updateAssistantContent` — this is what feeds the live mermaid renderer.
    - After completion sets `isGenerating: false` (L133-L137).
    - Updates `rateLimitsAtom` when both `rateLimit` and `rateLimitRemaining` are finite (`isFiniteNumber` from `@excalidraw/math`) (L139-L141).
    - On HTTP 429 or `rateLimitRemaining === 0`, removes the last assistant message (429 only), dedupes existing warning messages, and appends a `warning` message of type `messageLimitExceeded` (limit hit) or `rateLimitExceeded` (L143-L169).
    - Error handling (L171-L191): treats `AbortError` / message `"Aborted"` / `signal.aborted` as silent (returns); otherwise builds a localized `Error`, sets assistant error type `"network"` (unless 429) and the global error atom.
    - Post-success validation (L193-L203): tries `parseMermaidToExcalidraw(generatedResponse ?? "")`; tracks `ai/mermaid parse success` or on throw sets assistant error type `"parse"` and tracks failure. Outer catch sets error type `"other"` (L204-L209). `finally` clears the abort ref (L210-L212).
    - Analytics: `trackEvent("ai", "generate", "ttd")` and the parse-result events.
  - **`handleAbort() => void`** — internal (L215-L219). Aborts the current streaming controller if present.

  Invariant worth noting for parity: the chat is capped to the **last 3 messages** of context plus the prompt; the abort controller is single-slot (a new generate aborts the previous).

---

### packages/excalidraw/components/TTDDialog/mermaid-lang-lite.ts

Purpose: A minimal, dependency-light CodeMirror `StreamLanguage` tokenizer for mermaid syntax highlighting (used by the TTD CodeMirror editor) — not a real parser, just regex token classification.

- **`mermaidStreamParser`** — module const built via `StreamLanguage.define({ token(stream) {...} })` (L3-L78). The `token` function matches, in priority order: `%%` comments → `"comment"` (L5-L7); double-quoted strings → `"string"` (L10-L12); diagram-type keywords (`flowchart|graph|sequenceDiagram|...`, case-insensitive) → `"keyword"` (L16-L21); direction keywords `TB|TD|BT|RL|LR` → `"keyword"` (L25-L27); general mermaid keywords (`subgraph|end|participant|...`) → `"keyword"` (L30-L35); arrow operators (`-->`, `<--`, `--`, `..`, `==`) → `"operator"` (L39-L47); brackets/braces/pipes → `"bracket"` (L50-L52); node IDs `[A-Za-z_][A-Za-z0-9_]*` → `"variableName"` (L55-L57); numbers → `"number"` (L60-L62); punctuation `,:;` → `"punctuation"` (L65-L67); whitespace skipped (L70-L72); any other char consumed and untyped (L75-L76). Ordering is load-bearing: keyword/arrow rules must precede the generic identifier rule.
- **`mermaidLite() => StreamLanguage`** — exported factory (L80-L82). Returns the singleton `mermaidStreamParser` for use as a CodeMirror language extension.

---

### packages/excalidraw/components/TTDDialog/MermaidToExcalidraw.tsx

Purpose: The standalone "Mermaid → Excalidraw" tab component — a two-panel editor where the user types raw mermaid, it live-renders to a preview canvas with debounced persistence, surfaces parse errors with a line number, and offers a **breadth-first auto-fix search** that probes candidate corrections.

Module-level (L37-L43): `MERMAID_EXAMPLE` default flowchart text; `debouncedSaveMermaidDefinition = debounce(saveMermaidDataToStorage, 300)`; auto-fix tuning `AUTO_FIX_DEBOUNCE_MS = 500`, `AUTO_FIX_MAX_DEPTH = 4`, `AUTO_FIX_MAX_CANDIDATES = 30`.

- **`getErrorMessage(error: unknown) => string`** — internal helper (L45-L61). Normalizes any thrown value to a message string: handles `Error`, raw string, and `{ message: string }` shapes; else `""`. Used to extract the next error for the auto-fix loop.

- **`MermaidToExcalidraw({ mermaidToExcalidrawLib, isActive }: { mermaidToExcalidrawLib: MermaidToExcalidrawLibProps; isActive?: boolean })`** — default-exported React component (L63-L314).
  - **Props**: `mermaidToExcalidrawLib` (loaded flag + `api` promise + `parseMermaidToExcalidraw`); `isActive` (whether this tab is the visible one — gates rendering and auto-fix work).
  - **State**: `text` (the mermaid source, initialized from `EditorLocalStorage[MERMAID_TO_EXCALIDRAW]` or `MERMAID_EXAMPLE`, L70-L74); `error: Error | null` (L76); `autoFixCandidate: string | null` (L77). `deferredText = useDeferredValue(text)` (L75) so heavy re-render/parse follows React's lower-priority lane.
  - **Derived**: `errorLine` — IIFE computing `getMermaidErrorLineNumber(error.message, deferredText)` or `null` (L79-L84).
  - **Refs**: `canvasRef` (preview DIV, L86); `data` ref `{ elements, files }` holding the latest conversion for insertion (L87-L90).
  - **Context**: `app = useApp()` (L92), `theme` from `useUIAppState` (L93).
  - **Effects**:
    - **Render effect** (L95-L126): when `isActive`, runs `doRender()` — if `deferredText` is blank it `resetPreview`; else `convertMermaidToExcalidraw(...)` and on failure sets `error`. Also fires the 300ms debounced storage save. Deps: `deferredText, mermaidToExcalidrawLib, isActive, theme`.
    - **Cleanup effect** (L128-L133): on unmount, `debouncedSaveMermaidDefinition.flush()` to persist any pending save.
    - **Auto-fix effect** (L135-L215): only runs when active, error is an auto-fixable mermaid error (`isMermaidAutoFixableError`), there is source text, and the lib is loaded. Generates initial `getMermaidAutoFixCandidates(sourceText, errorMessage)`; if none, clears candidate. Otherwise after `AUTO_FIX_DEBOUNCE_MS` runs a **BFS over candidate fixes**: a `queue` of `{ text, depth }` seeded at depth 1, a `seen` set (initialized with the original source to avoid re-probing it), bounded by `AUTO_FIX_MAX_CANDIDATES` (30) total tries; for each candidate it calls `api.parseMermaidToExcalidraw(text)` — first success sets `autoFixCandidate` and stops; on failure, if `depth < AUTO_FIX_MAX_DEPTH` (4) it derives new candidates from the candidate's own error and enqueues unseen ones at `depth+1` (L156-L202). A `cancelled` flag + `clearTimeout` in the cleanup prevents stale state writes when text/error changes. This is the most algorithmically notable code in the cluster.
  - **Handlers**:
    - **`onInsertToEditor() => void`** (L217-L224): `insertToEditor({ app, data, text, shouldSaveMermaidDataToStorage: true })` — pushes the converted elements into the canvas.
    - **`onApplyAutoFix() => void`** (L226-L231): if a candidate exists, set `text` to it (triggers re-render through deferred value).
  - **Render** (L233-L312): a description block with `Trans`-localized links to mermaid docs; `TTDDialogPanels` containing the input `TTDDialogInput` (with `errorLine` highlight and Enter-to-insert) and the output `TTDDialogOutput` (preview canvas, error, `autoFixAvailable`/`onApplyAutoFix`). The "insert" panel action is wired to `onInsertToEditor` with `ArrowRightIcon`.

  Parity note: the auto-fix is a bounded BFS (depth ≤4, ≤30 candidate parses) with dedup; a reimplementation must keep the seed-with-original-text invariant and the candidate-expansion-on-error behavior to reproduce identical fix suggestions.

---

### packages/excalidraw/components/TTDDialog/TextToDiagram.tsx

Purpose: The chat-based Text-To-Diagram dialog container — composes the chat panel and the live mermaid preview panel, and wires all chat/generation/rendering hooks plus the many message-level action handlers.

- **`TextToDiagramContent({ mermaidToExcalidrawLib, onTextSubmit, renderWelcomeScreen, renderWarning, persistenceAdapter })`** — internal component (L35-L238).
  - **Props**: the mermaid lib props; `onTextSubmit` LLM transport; optional `renderWelcomeScreen`/`renderWarning` render-props; `persistenceAdapter` for chat storage.
  - **State/refs/context**: `app`, `setAppState`; `canvasRef` preview DIV (L53); atoms `errorAtom` (r/w), `chatHistoryAtom` (r/w), `showPreviewAtom` (read). `savedChats` from `useTTDChatStorage`. `lastAssistantMessage = getLastAssistantMessage(chatHistory)`. `setLastRetryAttempt` from `useChatAgent`.
  - **Composed hooks**: `useMermaidRenderer` (provides `data` ref for inserts), `useTextGeneration` (`onGenerate`, `handleAbort`), `useChatManagement` (menu + restore/delete/new chat) (L64-L80).
  - **Handlers**:
    - **`onViewAsMermaid() => void`** (L82-L89): saves the last assistant content to storage and opens the `ttd` dialog on the `mermaid` tab.
    - **`handleMermaidTabClick(message) => void`** (L91-L99): same as above but for a specific message's content.
    - **`handleInsertMessage(message) => Promise<void>`** (L101-L131): builds a temporary `data` ref, converts that message's mermaid via `convertMermaidToExcalidraw` (using `app.state.theme`), and on success `insertToEditor`. Uses a local temp ref rather than the shared `data` so it can insert any message, not just the live-rendered one.
    - **`handleAiRepairClick(message) => Promise<void>`** (L133-L144): constructs a repair prompt embedding the broken mermaid (in a fenced ```mermaid block) and its error, then calls `onGenerate({ prompt, isRepairFlow: true })`.
    - **`handleRetry(message) => Promise<void>`** (L146-L164): finds the assistant message index, and if the preceding message is a user message, calls `setLastRetryAttempt()` then re-generates with that user prompt as a repair flow.
    - **`handleInsertToEditor() => void`** (L166-L168): inserts the live `data` ref into the editor.
    - **`handleDeleteMessage(messageId) => void`** (L170-L184): truncates `chatHistory.messages` to before the user message that preceded the targeted assistant message (`slice(0, assistantMessageIndex - 1)`), removing the user+assistant pair. Note: if the id isn't an assistant message, `findIndex` returns -1 and `slice(0, -2)` would drop the last two messages — a caller-contract assumption that ids passed are assistant ids.
    - **`handlePromptChange(newPrompt) => void`** (L186-L191): updates `chatHistory.currentPrompt`.
  - **Render** (L193-L237): a layout DIV whose class toggles `--split` vs `--chat-only` on `showPreview`; renders `TTDChatPanel` (passing all chat data + every handler above) and conditionally `TTDPreviewPanel` (passing `canvasRef`, error, `hideErrorDetails` when `errorType === "parse"`, `onInsert`).
- **`TextToDiagram({ ... })`** — exported component (L240-L264). Thin wrapper that forwards all props to `TextToDiagramContent`. Also default-exported (L266).

---

### packages/excalidraw/components/TTDDialog/TTDContext.tsx

Purpose: Defines the shared editor-Jotai atoms backing the entire TTD dialog state. Effectively a state-module (no functions/components).

- **`rateLimitsAtom`** — `atom<RateLimits | null>(null)` (L7). Current rate-limit info from the LLM backend.
- **`showPreviewAtom`** — `atom<boolean>(false)` (L9). Whether the live mermaid preview panel is shown.
- **`errorAtom`** — `atom<Error | null>(null)` (L11). Current dialog-level error.
- **`chatHistoryAtom`** — `atom<TChat.ChatHistory>({ id: randomId(), messages: [], currentPrompt: "" })` (L13-L17). The active chat session; `id` seeded via `randomId()` from `@excalidraw/common`. This is the central state consumed by all the hooks above.

Note: atoms are created with the editor-scoped `atom` from `../../editor-jotai`, so they are per-editor-instance, not global module singletons.
