## Cluster: excalidraw__components__21

This cluster covers seven UI primitives/components from the Excalidraw editor package: a text input field, a toast notification, the canonical tool button, a tool-selection popover, the DOM-based tooltip system, the JSX i18n interpolation component, and the TTD chat-history dropdown menu.

---

### packages/excalidraw/components/TextField.tsx

A `forwardRef` text/search input wrapper with optional label, leading icon, and a redaction (show/hide secret) toggle.

- **Type `TextFieldProps`** (L17-L32): Props union — base props (`onChange`, `onClick`, `onKeyDown`, `readonly`, `fullWidth`, `selectOnRender`, `icon`, `label`, `className`, `placeholder`, `isRedacted`, `type: "text" | "search"`) intersected with an XOR of `{ value: string }` (controlled) or `{ defaultValue: string }` (uncontrolled). The discriminated union enforces controlled-vs-uncontrolled at the type level.
- **`TextField = forwardRef<HTMLInputElement, TextFieldProps>(({...}, ref) => …)`** (L34-L117): The component.
  - Refs/state: `innerRef` (`useRef<HTMLInputElement | null>`, L52) is the real DOM input; `useImperativeHandle(ref, () => innerRef.current!)` (L54) exposes the inner input to parent refs (non-null assertion — assumes mounted). `isTemporarilyUnredacted` state (L64-L65) toggles secret visibility.
  - Effect `useLayoutEffect` (L56-L62): when `selectOnRender` is truthy, focuses then selects the input (`.focus()` then `.select()`); comment notes focus-first is needed for vitest/jsdom. Dependency `[selectOnRender]`.
  - Render (L67-L114): outer `div.ExcTextField` with conditional classes `--fullWidth` and `--hasIcon`; clicking the wrapper focuses the input (L73-L75). Renders `icon`, optional `label`, then an input. Redaction class `is-redacted` applies only when controlled (`"value" in rest`), value truthy, `isRedacted`, and not temporarily unredacted (L85-L91). The input's `value`/`defaultValue` is chosen by `"value" in rest` check (L93-L96). When `isRedacted`, renders a borderless `Button` (L103-L112) toggling `isTemporarilyUnredacted`, swapping `eyeClosedIcon`/`eyeIcon`.
  - Side effects: directly manipulates focus/selection on the DOM input.

---

### packages/excalidraw/components/Toast.tsx

A self-dismissing toast notification with optional close button, hover-pause, and a sub-component progress bar.

- **Constant `DEFAULT_TOAST_TIMEOUT = 5000`** (L10): default auto-close delay in ms.
- **`ProgressBar = ({ progress }: { progress: number }) => …`** (L12-L21): Renders a fill bar whose width is `${Math.min(5, Math.round(progress * 100))}%`. Note the cap is `5`, so this width never exceeds 5% — likely a bug or intentional sliver indicator; relevant for parity. `progress` is expected 0..1.
- **`ToastComponent = ({ message, onClose, closable = false, duration = DEFAULT_TOAST_TIMEOUT, style }) => …`** (L23-L78): The toast.
  - Props: `message: ReactNode`, `onClose: () => void`, `closable?: boolean`, `duration?: number` (pass `Infinity` to disable autoclose, L27), `style?: CSSProperties`.
  - Ref/derived: `timerRef = useRef<number>(0)` (L37) holds the `setTimeout` id; `shouldAutoClose = duration !== Infinity` (L38).
  - **`scheduleTimeout = useCallback(...)`** (L39-L44): if `shouldAutoClose`, sets `timerRef.current = window.setTimeout(() => onClose(), duration)`. Deps `[onClose, duration, shouldAutoClose]`.
  - Effect (L46-L52): on mount / dep change, schedules the timeout and returns a cleanup `clearTimeout(timerRef.current)`. Deps include `message` and `duration`, so the timer resets when the message changes.
  - Handlers: `onMouseEnter` clears the timer (pause on hover) and `onMouseLeave` re-schedules it — both only defined when `shouldAutoClose` (L54-L57).
  - Render (L58-L77): `div.Toast` with `role="status"`; message div; conditional close `ToolButton` (icon `CloseIcon`, `type="icon"`) calling `onClose`.
- **`Toast = Object.assign(ToastComponent, { ProgressBar })`** (L80): Exported toast with `Toast.ProgressBar` attached as a static.

---

### packages/excalidraw/components/ToolButton.tsx

The canonical Excalidraw tool button — renders either a `<button>` (button/submit/icon variants) or a radio `<label><input type="radio">`, with built-in async-click loading state.

- **Type `ToolButtonSize = "small" | "medium"`** (L17).
- **Type `ToolButtonBaseProps`** (L19-L38): shared props — `icon`, `aria-label` (required), `aria-keyshortcuts`, `data-testid`, `label`, `title`, `name`, `id`, `size`, `keyBindingLabel`, `showAriaLabel`, `hidden`, `visible`, `selected`, `disabled`, `className`, `style`, `isLoading`.
- **Type `ToolButtonProps`** (L40-L61): discriminated union over `type`: `"button"`/`"submit"`/`"icon"` (each with `children` + `onClick`) and `"radio"` (with `checked`, `onChange({pointerType})`, `onPointerDown({pointerType})`). Note `icon`'s `onClick` takes no args while button/submit's takes a `React.MouseEvent`.
- **`ToolButton = React.forwardRef((props, ref) => …)`** (L63-L209): The component. `displayName = "ToolButton"` (L211).
  - Context/refs: `useExcalidrawContainer()` for `id: excalId` (L73) used to namespace the radio input id; `innerRef` + `useImperativeHandle` exposes the inner element (L74-L75). `sizeCn = ToolIcon_size_${size}` (L76).
  - State/ref: `isLoading` state (L78) for async clicks; `isMountedRef` (L80) guards post-unmount `setState`. `lastPointerTypeRef` (L110) records pointer type across the radio pointerdown→change sequence.
  - **`onClick = async (event) => …`** (L82-L101): invokes `props.onClick?.(event)`; if the return is promise-like (`isPromiseLike`), sets `isLoading=true`, awaits it, swallows `AbortError` (logging via `console.warn`) but rethrows all other errors, and in `finally` resets `isLoading=false` only if still mounted (L96). This is the key behavior: click handlers may be async and the button auto-shows a spinner.
  - Mount effect (L103-L108): sets `isMountedRef.current = true`, cleanup sets it false.
  - Button branch (L112-L168): for `button`/`icon`/`submit`, maps `icon`→`button` HTML type (L117-L119). Class composition via `clsx` includes show/hide based on `visible && !hidden`, plus `ToolIcon`, `--selected`, `--plain` (for icon type). `disabled` is `isLoading || props.isLoading || !!props.disabled`. Renders icon/label, optional keybinding span, inline `Spinner` when `props.isLoading`, optional aria-label text block (with its own spinner when local `isLoading`), and `children`.
  - Radio branch (L170-L207): renders `<label><input type="radio">`. `onPointerDown` captures `event.pointerType` into `lastPointerTypeRef` and forwards to `props.onPointerDown`; `onPointerUp` clears the ref on next `requestAnimationFrame` (L178-L182) — defers reset so the subsequent `onChange` still sees the pointer type. The input id is `${excalId}-${props.id}` for cross-instance uniqueness; `onChange` calls `props.onChange?.({ pointerType: lastPointerTypeRef.current })`.
  - Performance/invariant note: the async-click + `isMountedRef` pattern prevents the classic "setState after unmount" warning; pointer-type capture is the mechanism by which the editor distinguishes pen/touch/mouse tool activation.

---

### packages/excalidraw/components/ToolPopover.tsx

A Radix-popover-backed tool group: a single `ToolButton` trigger that opens a popover of related tool options (e.g. shape variants).

- **Type `ToolOption = { type: string; icon: React.ReactNode; title?: string }`** (L18-L22).
- **Type `ToolPopoverProps`** (L24-L36): `app: AppClassProperties`, `options: readonly ToolOption[]`, `activeTool: { type: string }`, `defaultOption: string`, `className?` (default `"Shape"`), `namePrefix`, `title`, `data-testid`, `onToolChange: (type: string) => void`, `displayedOption: ToolOption`, `fillable?`.
- **`ToolPopover = ({...}: ToolPopoverProps) => …`** (L38-L124): The component.
  - State/derived: `isPopupOpen` state (L51); `currentType = activeTool.type` (L52); `isActive = displayedOption.type === currentType` (L53); `SIDE_OFFSET = 32 / 2 + 10 = 26` (L54, half a 32px button plus 10px gap); `container` from `useExcalidrawContainer()` used as Radix collision boundary.
  - Render-time side effect (L58-L60): if `currentType` is not among `options` and the popup is open, calls `setIsPopupOpen(false)` during render — an immediate state correction (relevant for parity: this closes the popover when the active tool leaves the group).
  - Effect (L63-L69): subscribes to `app.onPointerDownEmitter` to close the popover on any canvas pointerdown; unsubscribes on cleanup. Dep `[app]`.
  - Trigger (L73-L91): `Popover.Trigger asChild` wrapping a radio `ToolButton` showing `displayedOption.icon`; `className` adds `fillable` and `active` (when any option matches the active tool). `onPointerDown` toggles `isPopupOpen` and calls `onToolChange(defaultOption)`.
  - Content (L93-L122): `Popover.Content` with `sideOffset={SIDE_OFFSET}` and `collisionBoundary={container ?? undefined}`. Maps each option to a radio `ToolButton`; on `onChange` it fires a `trackEvent("toolbar", type, "ui")` analytics call only when switching to a new tool, then `app.setActiveTool({ type })` and `onToolChange(type)`. Titles fall back to `capitalizeString(type)`.

---

### packages/excalidraw/components/Tooltip.tsx

A singleton DOM-element tooltip system (one shared `.excalidraw-tooltip` div appended to `document.body`) plus a React wrapper that shows/positions it on pointer enter/leave.

- **`getTooltipDiv = () => HTMLDivElement`** (L5-L16): returns the existing `.excalidraw-tooltip` div if present, else creates one, appends to `document.body`, adds the class. Singleton pattern — side effect: mutates `document.body`.
- **`updateTooltipPosition = (tooltip, item: {left,top,width,height}, position = "bottom") => void`** (L18-L60): Coordinate math (viewport space). Centers the tooltip horizontally over `item` (`left = item.left + item.width/2 - tooltipRect.width/2`, L35) and clamps to viewport with a 5px `margin` (L36-L40). Vertical: for `"bottom"`, places below (`item.top + item.height + margin`) and flips above if it would overflow viewport bottom (L44-L48); for `"top"`, places above and flips below if it overflows the top (L49-L54). Writes `top`/`left` px via `Object.assign(tooltip.style, …)`. Notable: all measurements come from `getBoundingClientRect()` so this is in client/viewport coordinates, not canvas/world space — important for parity.
- **`updateTooltip = (item, tooltip, label, long) => void`** (L62-L76): adds `--visible` class, sets `minWidth`/`maxWidth` to `50ch`/`50ch` (long) or `10ch`/`15ch` (short), sets `textContent = label`, then positions the tooltip against `item.getBoundingClientRect()`. Note `position` defaults to `"bottom"` here.
- **Type `TooltipProps = { children, label, long?, style?, disabled? }`** (L78-L84).
- **`Tooltip = ({ children, label, long=false, style, disabled }) => …`** (L86-L119): The wrapper. Effect (L93-L96) returns a cleanup that removes the `--visible` class on unmount. If `disabled`, renders `null` (L97-L99). Otherwise wraps children in `div.excalidraw-tooltip-wrapper`; `onPointerEnter` calls `updateTooltip(currentTarget, getTooltipDiv(), label, long)`; `onPointerLeave` removes `--visible`. Side effect: shows/hides the shared body-level div.

---

### packages/excalidraw/components/Trans.tsx

A JSX-aware i18n interpolation component that parses translation strings containing `{{vars}}` and `<tag>…</tag>` markup and substitutes React nodes/render-functions.

- **Regex constants** (L12-L18): `SPLIT_REGEX = /({{[\w-]+}})|(<[\w-]+>)|(<\/[\w-]+>)/g` splits a format string into tokens (vars, open tags, close tags); `KEY_REGEXP` extracts the name from `{{name}}`; `TAG_START_REGEXP` from `<tag>`; `TAG_END_REGEXP` from `</tag>`.
- **`getTransChildren = (format: string, props) => React.ReactNode[]`** (L20-L108): The parser. Uses an explicit stack of `{ name, children }` frames initialized with a root frame (L26-L31). Splits `format` by `SPLIT_REGEX`, drops empties, and per token:
  - Open tag (L41-L56): if the tag name is a prop key, push a new frame; else `console.warn` about a missing prop.
  - Close tag (L57-L82): if the name matches the top frame, pop it, wrap its children in a `React.Fragment`, and if the matching prop is a function call it with that fragment and push the result into the parent frame; else warn about an unexpected end tag.
  - Key `{{name}}` (L82-L96): if `name` is a prop, push `props[name]` as a child; else warn the key is missing.
  - Plain text (L96-L100): push the literal string.
  After processing, warns if the stack didn't unwind to length 1 (unbalanced tags, L103-L105), and returns the root frame's children. Behavior: supports nested tags (`<link><bold>{{x}}</bold></link>`). Invariant: render-functions for tags receive a single fragment child.
- **`Trans = ({ i18nKey, children, ...props }) => …`** (L153-L169): Default export. Pulls `t` from `useI18n()`, calls `getTransChildren(t(i18nKey), props)`, and spreads the resulting nodes into a `React.Fragment` (L164-L168). The Fragment wrapper exists specifically to dodge React's list-key warning (L163). `i18nKey` is typed `TranslationKeys`; other props are either `ReactNode` values (for `{{vars}}`) or `(el) => ReactNode` functions (for `<tags>`).

---

### packages/excalidraw/components/TTDDialog/Chat/ChatHistoryMenu.tsx

A presentational dropdown menu listing saved TTD (text-to-diagram) chat sessions, with new-chat, restore, and per-item delete controls.

- **Interface `ChatHistoryMenuProps`** (L11-L22): `isOpen`, `onToggle`, `onClose`, `onNewChat`, `onRestoreChat: (chat: SavedChat) => void`, `onDeleteChat: (chatId: string, event: React.MouseEvent) => void`, `savedChats: SavedChat[]`, `activeSessionId: string`, `disabled?`, `isNewChatBtnVisible?`.
- **`ChatHistoryMenu = ({...}: ChatHistoryMenuProps) => …`** (L24-L88): Stateless component. Renders `div.ttd-chat-history-menu` containing:
  - Optional `FilledButton` (shown when `isNewChatBtnVisible`) for "New chat" calling `onNewChat`, disabled by `disabled` (L38-L42).
  - When `savedChats.length > 0` (L43): a `DropdownMenu` controlled by `open={isOpen}`. Trigger (L46-L54) is the `historyIcon`, calling `onToggle`, with i18n title/aria from `t("chat.menu")`. Content (L55-L82) closes on outside-click and on select via `onClose`; maps each chat to a `DropdownMenu.ItemCustom` whose class gets `--active` when `chat.id === activeSessionId` (L60-L62). Clicking an item calls `onRestoreChat(chat)`; it shows the chat title and a nested delete `<button>` (`TrashIcon`) whose `onClick` calls `onDeleteChat(chat.id, e)` (the event is forwarded so the parent can `stopPropagation` to avoid triggering restore).
  - No local state, refs, or effects — all behavior is delegated to props.
