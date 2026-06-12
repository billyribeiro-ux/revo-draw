## Cluster: excalidraw__components__25

This cluster contains the tab-trigger/preview/welcome wrapper components and the shared type definitions for the Text-To-Diagram (TTD) dialog. All files are thin React presentational wrappers over Radix UI primitives or composition of sibling TTD components, plus one types-only module. No non-trivial geometry or coordinate-space math is present in this cluster; the only DOM-measurement logic is a `min-height` lock in `TTDDialogTabs`.

### packages/excalidraw/components/TTDDialog/TTDDialogTabs.tsx

Purpose: wraps Radix `Tabs.Root` for the TTD dialog, syncing the active tab into editor app-state and pinning the modal's minimum height so the dialog does not shrink when switching tabs.

- `TTDDialogTabs(props: { children: ReactNode } & { dialog: "ttd"; tab: "text-to-diagram" | "mermaid" }) => JSX.Element` — L10-L54. Default-exported React component (L58).
  - Props: `children` (tab content), `dialog` (literal `"ttd"`), `tab` (current active tab, `"text-to-diagram"` or `"mermaid"`).
  - State/refs it owns: `rootRef` (`useRef<HTMLDivElement>(null)`, L17) attached to `RadixTabs.Root`; `minHeightRef` (`useRef<number>(0)`, L18) — a mutable high-water-mark of the tallest modal height seen so far. No `useState` / `useEffect`.
  - Hooks: `useExcalidrawSetAppState()` (L15) to push tab changes into editor app-state.
  - Key handler — `onValueChange(tab: string | undefined)` (L25-L49): if `tab` is falsy (can be `undefined` in test envs, per L26 comment) it bails (L29-L31). Otherwise it walks up from `rootRef` via `closest<HTMLElement>(".Modal__content")` (L32-L33); if found, reads `offsetHeight` (L35) and, when the current height exceeds the stored max, raises `minHeightRef.current` and sets the modal's inline style to `min(${minHeightRef.current}px, 100%)` (L36-L39) — a monotonic "grow but never shrink" min-height lock that prevents layout jitter between tabs. Then, if `props.dialog === "ttd"` and `isMemberOf(["text-to-diagram", "mermaid"], tab)` (a `@excalidraw/common` type-guard narrowing, L42-L43), it calls `setAppState({ openDialog: { name: props.dialog, tab } })` (L45-L47).
  - Side effect / invariant: mutates a live DOM node's inline `minHeight`; `minHeightRef` only ever increases (monotonic), so the modal height ratchets up across tab switches and never collapses.
  - `TTDDialogTabs.displayName = "TTDDialogTabs"` (L56).

### packages/excalidraw/components/TTDDialog/TTDDialogTabTrigger.tsx

Purpose: a single TTD dialog tab button, wrapping Radix `Tabs.Trigger` (via `asChild`) around a native `<button>`.

- `TTDDialogTabTrigger({ children, tab, onSelect, ...rest }) => JSX.Element` — L3-L20. Named export.
  - Props (L8-L12): `children` (`React.ReactNode`), `tab` (`string`, the Radix tab value), `onSelect` (`React.ReactEventHandler<HTMLButtonElement> | undefined`), plus the rest of `React.HTMLAttributes<HTMLButtonElement>` with `"onSelect"` omitted (so the custom `onSelect` typing wins).
  - Renders `RadixTabs.Trigger value={tab} asChild onSelect={onSelect}` wrapping `<button type="button" className="ttd-dialog-tab-trigger" {...rest}>{children}</button>` (L14-L18). `asChild` makes Radix delegate trigger behavior onto the inner button rather than rendering its own element.
  - No state/refs/effects. `displayName = "TTDDialogTabTrigger"` (L21).

### packages/excalidraw/components/TTDDialog/TTDDialogTabTriggers.tsx

Purpose: the tab-strip container, wrapping Radix `Tabs.List` for the TTD dialog triggers.

- `TTDDialogTabTriggers({ children, ...rest }) => JSX.Element` — L3-L12. Named export.
  - Props (L6): `children` (`React.ReactNode`) plus all of `React.HTMLAttributes<HTMLDivElement>` spread through.
  - Renders `RadixTabs.List className="ttd-dialog-triggers" {...rest}` containing `children` (L8-L10).
  - No state/refs/effects. `displayName = "TTDDialogTabTriggers"` (L13).

### packages/excalidraw/components/TTDDialog/TTDDialogTrigger.tsx

Purpose: the main-menu / dropdown entry point that opens the TTD ("Text to diagram") dialog, rendered into a tunnel so it can appear inside the app's menu.

- `TTDDialogTrigger({ children, icon }) => JSX.Element` — L10-L35. Named export.
  - Props (L13-L16): `children` (optional `ReactNode`, defaults to the i18n label `t("labels.textToDiagram")`), `icon` (optional `JSX.Element`, defaults to `brainIcon`).
  - Hooks: `useI18n()` for `t` (L17); `useTunnels()` to obtain `TTDDialogTriggerTunnel` (L18); `useExcalidrawSetAppState()` (L19). No local state/refs/effects.
  - Renders into `TTDDialogTriggerTunnel.In` (L22) a `DropdownMenu.Item` whose `onSelect` (L24-L27) fires `trackEvent("ai", "dialog open", "ttd")` analytics and then `setAppState({ openDialog: { name: "ttd", tab: "text-to-diagram" } })` to open the dialog on the text-to-diagram tab. Item `icon` is `icon ?? brainIcon` (L28) and carries an `"AI"` badge via `DropdownMenu.Item.Badge` (L29).
  - `displayName = "TTDDialogTrigger"` (L36). Tunnel pattern (react-tunnels) lets this component be declared anywhere but render its DOM at the tunnel's `Out` location in the menu.

### packages/excalidraw/components/TTDDialog/TTDPreviewPanel.tsx

Purpose: composes the right-hand "preview" pane of the TTD dialog — a `TTDDialogPanel` whose only action is "Insert", wrapping a `TTDDialogOutput` that shows the rendered diagram or an error.

- `TTDPreviewPanel({ canvasRef, error, loaded, onInsert, hideErrorDetails }) => JSX.Element` — L17-L47. Named export.
  - Props interface `TTDPreviewPanelProps` (L9-L15): `canvasRef` (`React.RefObject<HTMLDivElement | null>`, the container the diagram canvas mounts into), `error` (`Error | null`), `loaded` (`boolean`, whether the diagram finished rendering), `onInsert` (`() => void` callback to insert the diagram onto the scene), `hideErrorDetails` (optional `boolean`).
  - Builds a single-element `actions: TTDPanelAction[]` (L24-L31): one action `{ action: onInsert, label: t("chat.insert"), icon: ArrowRightIcon, variant: "button" }`.
  - Renders `TTDDialogPanel` with `panelActionJustifyContent="flex-end"`, the `panelActions`, and `className="ttd-dialog-preview-panel"` (L34-L37), wrapping `TTDDialogOutput` forwarding `canvasRef`, `error`, `loaded`, `hideErrorDetails` (L39-L44).
  - No state/refs/effects of its own (pure composition; `canvasRef` is owned by the parent).

### packages/excalidraw/components/TTDDialog/TTDWelcomeMessage.tsx

Purpose: a static, i18n-driven welcome/placeholder message shown in the chat interface before any TTD conversation exists.

- `TTDWelcomeMessage() => JSX.Element` — L3-L11. Named export, no props.
  - Renders a `div.chat-interface__welcome-screen__welcome-message` containing an `<h3>` of `t("chat.placeholder.title")` and two `<p>` paragraphs `t("chat.placeholder.description")` and `t("chat.placeholder.hint")` (L4-L9).
  - No state/refs/effects/handlers. Pure presentational, fully static aside from i18n lookups.

### packages/excalidraw/components/TTDDialog/types.ts

Purpose: types-only module defining the shared data shapes for TTD chat/LLM messages, persistence, mermaid rendering, and the public `TTDDialog` callback contracts. No runtime code.

Exported types / interfaces / namespaces:
- `LLMMessage` (type, L11-L14): `{ role: "user" | "assistant"; content: string }` — a single message in an LLM conversation.
- `MermaidData` (type, L16-L19): `{ elements: readonly NonDeletedExcalidrawElement[]; files: BinaryFiles | null }` — the parsed result of converting a mermaid definition into Excalidraw elements + binary files.
- `RateLimits` (interface, L21-L24): `{ rateLimit: number; rateLimitRemaining: number }`.
- `namespace TChat` (L26-L46):
  - `TChat.ChatMessage` (type, L27-L39): `{ id: string; timestamp: Date; isGenerating?: boolean; error?: string; errorDetails?: string; errorType?: "parse" | "network" | "other"; lastAttemptAt?: number; type: "user" | "assistant" | "warning"; warningType?: "messageLimitExceeded" | "rateLimitExceeded"; content?: string }`. `warningType` distinguishes a daily message-limit hit from a general 429 rate-limit (comments L36-L37).
  - `TChat.ChatHistory` (type, L41-L45): `{ id: string; messages: ChatMessage[]; currentPrompt: string }`.
- `SavedChat` (interface, L48-L54): `{ id: string; title: string; messages: TChat.ChatMessage[]; currentPrompt: string; timestamp: number }`.
- `SavedChats` (type alias, L56): `SavedChat[]`.
- `TTDPersistenceAdapter` (interface, L62-L72): persistence contract with `loadChats(): Promise<SavedChats>` and `saveChats(chats: SavedChats): Promise<void>`; doc comment (L58-L61) notes it should preferably be stable (static class / singleton).
- `MermaidToExcalidrawLibProps` (interface, L74-L82): `{ loaded: boolean; api: Promise<{ parseMermaidToExcalidraw: (definition: string, config?: MermaidConfig) => Promise<MermaidToExcalidrawResult> }> }` — lazy-loaded mermaid library handle.
- `namespace TTTDDialog` (L84-L124) — public dialog callback contracts:
  - `TTTDDialog.OnGenerate` (type, L85-L88): `(opts: { prompt: string; isRepairFlow?: boolean }) => Promise<void>`.
  - `TTTDDialog.OnTextSubmitProps` (type, L90-L95): `{ messages: LLMMessage[]; onChunk?: (chunk: string) => void; onStreamCreated?: () => void; signal?: AbortSignal }`.
  - `TTTDDialog.OnTextSubmitRetValue` (type, L97-L106): `{ rateLimit?: number | null; rateLimitRemaining?: number | null }` intersected with a discriminated union of `{ generatedResponse: string; error: null }` or `{ error: RequestError; generatedResponse?: null }`.
  - `TTTDDialog.onTextSubmit` (type, L109-L111): `(props: OnTextSubmitProps) => Promise<OnTextSubmitRetValue>`.
  - `TTTDDialog.renderWarning` (type, L116-L118): `(chatMessage: TChat.ChatMessage) => React.ReactNode | undefined` (return `undefined` to use default rendering, per L113-L115).
  - `TTTDDialog.renderWelcomeScreen` (type, L120-L123): `(props: { rateLimits: RateLimits | null }) => React.ReactNode | undefined` (`rateLimits` is `null` when not yet available, L121).
- Imports are all `import type` (RequestError, NonDeletedExcalidrawElement, MermaidConfig, MermaidToExcalidrawResult, BinaryFiles) — confirming this is a pure type module.
