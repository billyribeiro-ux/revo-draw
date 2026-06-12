## Cluster: excalidraw__components__26

This cluster covers the Text-To-Diagram (TTD) dialog's chat-storage hook, chat history utilities, the Mermaid auto-fix / error-analysis / validation helpers, the SSE streaming fetch client, and the small `UnlockPopup` UI component. With the exception of `UnlockPopup.tsx`, every file is pure, browser-agnostic logic (no Canvas math) — the only coordinate-space code in the cluster lives in `UnlockPopup.tsx`.

---

### packages/excalidraw/components/TTDDialog/useTTDChatStorage.ts

Purpose: A React hook (backed by Jotai atoms) that loads, auto-saves, deletes, and restores up to 10 most-recent TTD chat sessions through a pluggable `TTDPersistenceAdapter`.

- `generateChatTitle(firstMessage: string): string` — L22-L28. Trims the message; returns it verbatim if `<= 50` chars, otherwise the first 47 chars plus `"..."` (yielding a 50-char cap). Pure, no side effects.
- `savedChatsAtom = atom<SavedChats>([])` — L31. Module-level shared Jotai atom; starts empty, populated lazily via `loadChats`. Exported.
- `isLoadingChatsAtom = atom<boolean>(false)` — L32. Tracks in-flight load. Exported.
- `chatsLoadedAtom = atom<boolean>(false)` — L33. One-shot "have we ever loaded" guard. Exported.
- `useTTDChatStorage({ persistenceAdapter }: UseTTDChatStorageProps): UseTTDChatStorageReturn` — L35-L192. The hook. Reads `chatHistoryAtom` (from `TTDContext`) plus the three module atoms; keeps a `savedChatsRef` (L44-L45) mirroring `savedChats` so async callbacks read the latest value without stale closures. Computes `lastMessageInHistory` (L47-L48) as the last element of the history. Returns `{ savedChats, saveCurrentChat, deleteChat, restoreChat, createNewChatId }`.
  - Internal `loadChats = useCallback(async () => ...)` — L51-L75. Idempotent: early-returns if `chatsLoaded || isLoading`. Sets loading flag, awaits `persistenceAdapter.loadChats()`, stores result, marks loaded; on failure logs `console.warn`, sets empty list, still marks loaded (so it does not retry forever); always clears loading in `finally`. Side effect: mutates three atoms + external adapter I/O.
  - INITIAL LOAD `useEffect(() => { loadChats(); }, [])` — L78-L81. Runs once on mount (deps intentionally empty, eslint-disabled).
  - `saveCurrentChat = useCallback(async () => ...)` — L83-L143. No-op if no messages (L84). Finds the first `type === "user"` message and bails unless its content is a string (L88-L93). Builds a title, looks up an existing chat by `chatHistory.id` (L97-L100). Computes `messagesChanged` (L102-L109) — true if no existing chat, length differs, or any message id/content differs by index. Builds `chatToSave` keeping only `user`/`assistant` messages and coercing each `timestamp` to a `Date` (L114-L122); sets `timestamp` to `Date.now()` only when changed, else preserves the prior timestamp (L124-L126). Produces `updatedChats` by removing the same id, appending, sorting **descending by timestamp**, and slicing to the **first 10** (L129-L134) — the 10-chat cap. Optimistically sets the atom (L136) then persists, warning on failure (L138-L142).
  - Auto-save `useEffect` — L146-L155. When the last message is **not** `isGenerating`, calls `saveCurrentChat()`. Deps are message count, last message id, and its `isGenerating` flag (eslint-disabled) — i.e. it saves once generation completes, not on every streamed token.
  - `deleteChat = useCallback(async (chatId) => Promise<SavedChats>)` — L157-L173. Filters the id out of `savedChatsRef.current`, sets the atom optimistically, persists (warn on failure), returns the updated array so the caller can react.
  - `restoreChat = useCallback((chat) => SavedChat)` — L175-L178. Identity passthrough; comment notes the caller persists after state update.
  - `createNewChatId = useCallback(async () => Promise<string>)` — L180-L183. Awaits `saveCurrentChat()` (flushing current chat) then returns a fresh `randomId()`.

  Invariants/notes: stored chats are capped at 10 and always kept newest-first; all persistence failures are swallowed with `console.warn` (non-fatal, optimistic UI); `timestamp` is only bumped when message contents actually change, preventing churn from re-renders.

---

### packages/excalidraw/components/TTDDialog/utils/chat.ts

Purpose: Pure, immutable helper functions for mutating and projecting a `TChat.ChatHistory` message list.

- `updateAssistantContent(chatHistory: TChat.ChatHistory, payload: Partial<TChat.ChatMessage>)` — L5-L33. Uses `findLastIndex` to locate the last `type === "assistant"` message; returns `chatHistory` unchanged if none (L16-L18). Otherwise copies the message array and spreads `payload` over the last assistant message (L22-L27), returning a new history object. Immutable; used for streaming partial assistant content into the most recent assistant bubble.
- `getLastAssistantMessage(chatHistory: TChat.ChatHistory)` — L35-L44. Returns the last `assistant` message (or `undefined` if `findLastIndex` returns -1 — note it indexes `messages[-1]` which is `undefined`). Pure.
- `addMessages(chatHistory, messages: Array<Omit<TChat.ChatMessage, "id" | "timestamp">>)` — L46-L60. Maps each input message to a full `ChatMessage` by assigning `randomId()` and `new Date()` timestamp, then returns a new history with them appended. Side effect-free aside from id/clock generation.
- `removeLastAssistantMessage(chatHistory: TChat.ChatHistory)` — L62-L75. Finds the last assistant message; if present, returns a new history with that index filtered out (L68-L72); else returns the input unchanged. Tolerates `messages` being nullish via `?? []`.
- `getMessagesForLLM(chatHistory: TChat.ChatHistory): LLMMessage[]` — L77-L92. Projects history into the LLM wire format: iterates messages, keeping only non-empty `user`/`assistant` content, mapping `type` to `role`. Drops `system`/empty/other messages.

---

### packages/excalidraw/components/TTDDialog/utils/mermaidAutoFix.ts

Purpose: Heuristic generator that, given Mermaid source and an error message, produces an ordered list of candidate auto-fix rewrites for common LLM-generated Mermaid mistakes.

- `getErrorLineIndex(message, sourceText): number | null` — L8-L14. Wraps `getMermaidErrorLineNumber` and converts the 1-based line number to a 0-based index (or `null`).
- `replaceLineAt(lines: string[], index, transform: (line) => string): string | null` — L16-L31. Bounds-checks the index; applies `transform` to that line; returns `null` if out of range **or** if the transform was a no-op (prevents emitting duplicate candidates); otherwise returns the full text with that single line replaced. Pure.
- `stripTrailingTokenAfterShape(line: string): string` — L33-L49. Regex-detects a node shape token (`[...]`, `(...)`, `{...}`, single/double-quoted string) followed by a stray trailing alpha run (L34-L36) or trailing punctuation `, ; :` (L41-L43), and strips that trailing token. Targets the `got 'NODE_STRING'` class of errors. Returns the line unchanged if neither pattern matches.
- `removeExtraArrowheadAfterEdgeLabel(line: string): string` — L51-L55. Replaces `-->|label|> Target` (extra `>` after an edge label) with `-->|label| Target` via a global regex with a lookahead for the next node-start char. Note: operates on a whole line/text and replaces **all** occurrences (`/g`).
- `escapeRegExp(value: string): string` — L57-L58. Escapes regex metacharacters so a participant name can be embedded in a dynamic `RegExp`.
- `removeLastDeactivateForParticipant(sourceText, participant): string | null` — L60-L76. Builds a `^...deactivate <participant>(optional %% comment)$` line pattern; scans **bottom-up** and removes the **last** matching `deactivate` line; returns `null` if none found. Fix for "inactivate an inactive participant".
- `removeAllDeactivateForParticipant(sourceText, participant): string | null` — L78-L96. Same pattern but removes **all** matching `deactivate` lines; returns `null` only if nothing was removed. Fallback for repeated invalid deactivations.
- `appendMissingEnds(sourceText): string | null` — L98-L109. Counts `^subgraph` openers vs `^end$` closers (multiline regex); if openers exceed closers, appends that many `end` lines to a trimmed copy of the text; else `null`.
- `normalizeSmartQuotes(sourceText): string` — L111-L112. Replaces curly double quotes `“ ”` with `"` and curly single quotes `‘ ’` with `'`.
- `getMermaidAutoFixCandidates(sourceText: string, errorMessage: string): string[]` — L114-L175 (exported). Returns `[]` immediately if the error is not auto-fixable or the source is blank (L118-L120). Maintains a de-duped, order-preserving candidate list via a `Set` + `addCandidate` closure that rejects empties, no-op (`=== sourceText`), and already-seen strings (L122-L130). Strategy order: (1) inactive-participant fixes — remove last, then remove all `deactivate` lines (L132-L141); (2) for syntax errors, try `stripTrailingTokenAfterShape` and `removeExtraArrowheadAfterEdgeLabel` on the error line plus its neighbours `errorLine-1`/`+1` (L143-L162), then a whole-text arrowhead pass (L166), then `appendMissingEnds` (L168), then smart-quote normalization (L170-L171). Output ordering encodes fix priority; consumer presumably re-validates each candidate in turn.

  Notes: the line-neighbour probing (error line, one above, one below) hedges against Mermaid's off-by-one error reporting; this ordering matters for parity.

---

### packages/excalidraw/components/TTDDialog/utils/mermaidError.ts

Purpose: Parses Mermaid parser error strings to classify them, extract the offending line number / participant, and produce human-readable syntax-error guidance.

- `MERMAID_SYNTAX_ERROR_LINE = /(?:Parse|Lexical) error on line (\d+)[.:]/i` — L1. Captures the 1-based error line.
- `MERMAID_INACTIVE_PARTICIPANT_ERROR = /Trying to inactivate an inactive participant \((.+)\)/i` — L2-L3. Captures the participant name.
- `MERMAID_CARET_LINE = /^\s*-+\^\s*$/` — L4. Matches the `----^` caret pointer line Mermaid emits under the offending token.
- `isMermaidParseSyntaxError(message): boolean` — L6-L7. True if the message matches the parse/lexical-error pattern.
- `isMermaidAutoFixableError(message): boolean` — L9-L11. True for parse syntax errors OR inactive-participant errors. Gatekeeper for `getMermaidAutoFixCandidates`.
- `isMermaidCaretLine(line): boolean` — L13-L14. True if the line is the caret pointer.
- `getMermaidInactiveParticipant(message): string | null` — L16-L24. Extracts and trims the participant name from the inactive-participant error, else `null`.
- `escapeRegExp(value): string` — L26-L27. Regex-metachar escaper (duplicated from mermaidAutoFix.ts, file-local).
- `getInactiveParticipantLineNumber(message, sourceText): number | null` — L29-L48. For inactive-participant errors only: builds a `deactivate <participant>` line regex, scans **bottom-up**, returns the **1-based** index of the last matching line, else `null`.
- `getMermaidErrorLineNumber(message: string, sourceText?: string): number | null` — L50-L62 (exported). If the syntax-error regex matches, returns the parsed line number; otherwise falls back to `getInactiveParticipantLineNumber` when `sourceText` is provided, else `null`.
- `countMatches(text, re): number` — L64-L65. Returns the count of regex matches (`text.match(re) || []).length`).
- `getMermaidSyntaxErrorGuidance(message: string, sourceText?: string): { summary: string; likelyCauses: string[] } | null` — L67-L125 (exported). Returns `null` for non-syntax errors. Builds a `summary` naming the error line if known (L75-L78). Accumulates `likelyCauses`: unbalanced `[]`, `()`, `{}` (L83-L99), more `subgraph` than `end` (L101-L105), extra-token hints for `got 'NODE_STRING'`/`got 'PS'` (L108-L112). If no specific cause found, pushes two generic causes (L114-L119). De-duplicates causes via `new Set` (L123).
- `formatMermaidParseErrorMessage(message: string): string` — L127-L133 (exported). For syntax errors, strips the verbose `Expecting ...` tail (everything from a `\n Expecting` onward) and trims trailing whitespace; returns the message unchanged for non-syntax errors.

  Notes: all line numbers here are **1-based** (Mermaid's convention); the auto-fix module converts to 0-based via `getErrorLineIndex`.

---

### packages/excalidraw/components/TTDDialog/utils/mermaidValidation.ts

Purpose: A fast, parser-free heuristic to reject obviously-incomplete Mermaid source before attempting a real render.

- `isValidMermaidSyntax(content: string): boolean` — L1-L41 (sole export). Returns `false` for blank/whitespace-only input (L3-L5). Counts and compares opening vs closing `[]`, `{}`, `()` — any imbalance fails (L7-L19). Then checks that the **last non-blank-trimmed line** does not end with a dangling connector/delimiter via a list of `incompletePatterns` — `-->`, `--`, `-.`, `==>`, `==`, `~~`, `::`, `:`, `|`, `&` (L22-L38). Returns `true` only if all checks pass.

  Notes: purely structural/string-based — does not validate Mermaid semantics, only bracket balance and trailing-token completeness; used to suppress render attempts mid-typing/mid-stream.

---

### packages/excalidraw/components/TTDDialog/utils/TTDStreamFetch.ts

Purpose: A streaming (Server-Sent-Events) fetch client that POSTs LLM messages, parses the SSE stream incrementally, surfaces per-chunk deltas, and returns the full response plus rate-limit info and structured errors.

- `interface RateLimitInfo` — L5-L8. `{ rateLimit?: number; rateLimitRemaining?: number }`.
- `interface StreamingOptions` — L10-L17. `{ url; messages: readonly LLMMessage[]; onChunk?; extractRateLimits?; signal?: AbortSignal; onStreamCreated? }`.
- `type StreamChunk` — L19-L34 (exported). Discriminated union on `type`: `"content"` (`delta: string`), `"done"` (`finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null`), `"error"` (`error: { message; status? }`).
- `extractRateLimitHeaders(headers: Headers): RateLimitInfo` — L36-L46. Reads `X-Ratelimit-Limit` / `X-Ratelimit-Remaining` headers, `parseInt`-ing them (radix 10) or leaving `undefined`.
- `async function* parseSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string, void, unknown>` — L48-L82. Decodes chunks with a streaming `TextDecoder`, maintains a `buffer`, splits on `\n`, keeps the trailing partial line in the buffer (L64-L65), and for each complete non-empty line that begins with `"data: "` yields the post-prefix payload (`slice(6)`). Releases the reader lock in `finally` (L79-L81). Performance/correctness detail: line-buffering across reads prevents splitting a `data:` line that straddles two network chunks.
- `async function TTDStreamFetch(options: StreamingOptions): Promise<TTTDDialog.OnTextSubmitRetValue>` — L84-L225 (exported). Flow:
  - POSTs JSON `{ messages }` with `Accept: text/event-stream`, forwarding the abort `signal` (L101-L109).
  - Optionally extracts rate-limit headers (L111-L113).
  - On `!response.ok`: returns a structured `RequestError` for HTTP 429 ("Rate limit exceeded") with the rate-limit info (L115-L124); otherwise reads the body text and **throws** a `RequestError` with that status (L126-L131).
  - Guards against a missing body reader (throws status 500, L133-L140).
  - Calls `onStreamCreated?.()` once the stream is live (L142).
  - Iterates `parseSSEStream`: breaks on `"[DONE]"` sentinel (L146-L148); `JSON.parse`s each datum into a `StreamChunk`; for `content` accumulates `fullResponse` and fires `onChunk?.(delta)` (L158-L165); for `error` captures a `RequestError` (status 500) (L166-L171); `done` is a no-op break (L172-L173); malformed JSON is logged via `console.warn` and skipped (L175-L177).
  - Inner stream errors: maps `AbortError` to status 499 ("Request aborted"), else status 500 (L179-L188).
  - Returns the captured error if any (L190-L195); returns a "Generation failed..." error if the response was empty (L197-L205); otherwise returns `{ generatedResponse, error: null, ...rateLimitInfo }` (L207-L211).
  - Outer `catch`: `AbortError` -> status 499, else status 500 with `err.message` (L212-L224).

  Invariants/notes: two abort-handling layers (stream loop and outer try); HTTP 429 is returned (not thrown) so the caller can surface rate limiting gracefully; all returns conform to `TTTDDialog.OnTextSubmitRetValue`.

---

### packages/excalidraw/components/UnlockPopup.tsx

Purpose: A small floating "click to unlock" popup positioned over the bounding box of a locked element (or locked group), which on click selects the element(s)/group and toggles the lock off.

- `UnlockPopup({ app, activeLockedId }: { app: App; activeLockedId: NonNullable<AppState["activeLockedId"]> })` — L21-L73 (default export). A stateless functional React component (no `useState`/`useRef`/`useEffect`; reads directly from the `app` controller instance).
  - Resolves the target element via `app.scene.getElement(activeLockedId)`; if not a single element, falls back to `getElementsInGroup(...)` to treat `activeLockedId` as a group id (L29-L33). Renders `null` when no elements resolve (L34-L36) — the early-return guard.
  - Geometry/coordinate-space (parity-relevant): computes the scene-space common bounds top-left `[x, y]` via `getCommonBounds(elements)` (L38), then converts to viewport coords with `sceneCoordsToViewportCoords({ sceneX: x, sceneY: y }, app.state)` (L39-L42). Positions the popup with CSS: `bottom = app.state.height + 12 - viewY + app.state.offsetTop` and `left = viewX - app.state.offsetLeft` (L46-L50) — i.e. anchored above the element's top edge (+12px gap) using a bottom-based offset relative to canvas height, and horizontally offset by the canvas left margin.
  - Props: `app` (the `App` controller, source of scene/state/actionManager) and `activeLockedId` (non-null element or group id).
  - Key event handler — `onClick` (L51-L67): wraps state mutation in `flushSync` to apply synchronously before the action runs. Computes group ids via `selectGroupsFromGivenElements(elements, app.state)`, then `app.setState` setting `selectedElementIds` (reduce over elements to a `{ [id]: true }` map), `selectedGroupIds`, and clearing `activeLockedId` to `null`. After the flush, calls `app.actionManager.executeAction(actionToggleElementLock)` to unlock the now-selected element(s).
  - Renders the `LockedIconFilled` icon inside the `.UnlockPopup` div; `title` uses `t("labels.elementLock.unlock")` for i18n. Styling from `./UnlockPopup.scss`.

  Notes: this is the only file in the cluster touching coordinate spaces; the `flushSync`-then-`executeAction` ordering is deliberate so the lock-toggle action sees the freshly-selected elements rather than the stale selection.
