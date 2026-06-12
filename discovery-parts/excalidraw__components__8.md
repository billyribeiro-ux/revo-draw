## Cluster: excalidraw__components__8

This cluster contains seven UI components from `packages/excalidraw/components`: two trivial layout/wrapper components (`Ellipsify`, `FixedSideContainer`), two dialog/branding components (`ErrorDialog`, `ExcalidrawLogo`), one collaboration badge (`FollowMode`), one rich button (`FilledButton`), and the canvas color-sampling `EyeDropper` — the only component in the cluster with non-trivial geometry/coordinate-space logic.

---

### packages/excalidraw/components/Ellipsify.tsx

Purpose: A one-line presentational wrapper that truncates overflowing inline text with a CSS ellipsis.

- `Ellipsify({ children, ...rest }: { children: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>)` — L1-L18.
  - Renders a `<span>` that spreads all passed HTML attributes (`...rest`) and applies a fixed truncation style: `textOverflow: "ellipsis"`, `overflow: "hidden"`, `whiteSpace: "nowrap"`, then merges any caller-supplied `rest.style` on top (so caller styles override but the three truncation properties are defaults that can be overridden) — L8-L13.
  - Props: `children` plus any `HTMLAttributes<HTMLSpanElement>`. No state, no refs, no effects, no event handlers of its own (handlers pass through via `...rest`).
  - Invariant: truncation properties are applied before `...rest.style`, so a caller can override them. Pure component.

---

### packages/excalidraw/components/ErrorDialog.tsx

Purpose: A small modal dialog that shows error message content and refocuses the editor container on close.

- `ErrorDialog({ children, onClose }: { children?: React.ReactNode; onClose?: () => void })` — L8-L41.
  - Props: optional `children` (the error content) and optional `onClose` callback.
  - State: `modalIsShown` via `useState(!!children)` — initialized to shown iff `children` is truthy (L15). Note: this is set only at mount; later changes to `children` do not re-open the dialog.
  - Context: `excalidrawContainer` pulled from `useExcalidrawContainer()` (L16).
  - Handler `handleClose` — `useCallback`, deps `[onClose, excalidrawContainer]` (L18-L26): sets `modalIsShown = false`, invokes `onClose?.()`, then calls `excalidrawContainer?.focus()`. The focus call carries an inline TODO noting it is an a11y workaround (should focus last active element).
  - Render: when `modalIsShown`, renders `<Dialog size="small" onCloseRequest={handleClose} title={t("errorDialog.title")}>` wrapping the children in a `<div style={{ whiteSpace: "pre-wrap" }}>` so newlines in error strings are preserved (L30-L38).

---

### packages/excalidraw/components/ExcalidrawLogo.tsx

Purpose: Renders the Excalidraw brand mark (hand-drawn arrow icon plus optional wordmark) at one of several sizes.

- `LogoIcon()` — L3-L15: internal stateless function component returning a single inline `<svg viewBox="0 0 40 40">` of the arrow/cursor mark; one `<path fill="currentColor">` so the color follows CSS `color`. Class `ExcalidrawLogo-icon`. Pure, no props.
- `LogoText()` — L17-L42: internal stateless component returning the "Excalidraw" wordmark `<svg viewBox="0 0 450 55">` with multiple `<path>` elements, several carrying `transform="translate(-144.023 -51.76)"` to reposition the glyph outlines into the viewBox. Class `ExcalidrawLogo-text`. Pure, no props. Note: the negative-translate offset is the only non-obvious geometry — it shifts the original path coordinate space into the declared viewBox; not relevant to canvas parity (it is static brand SVG).
- Type `LogoSize = "xs" | "small" | "normal" | "large" | "custom" | "mobile"` — L44.
- Interface `LogoProps` — L46-L56: `size?: LogoSize`, `withText?: boolean`, `style?: React.CSSProperties`, `isNotLink?: boolean` (documented as: if true, the logo is a plain div not wrapped in a Link, and the link prop is ignored — but note this prop is declared yet NOT consumed by the component below).
- `ExcalidrawLogo({ style, size = "small", withText }: LogoProps)` — L58-L69: renders `<div className={`ExcalidrawLogo is-${size}`} style={style}>` containing `<LogoIcon />` and, when `withText` is truthy, `<LogoText />`. Note: it destructures only `style`, `size`, `withText` — `isNotLink` from `LogoProps` is declared but unused in this implementation. No state/refs/effects.

---

### packages/excalidraw/components/EyeDropper.tsx

Purpose: A portal-rendered color eyedropper that samples pixels from the live Excalidraw canvas under the cursor, previews the color, and reports the pick on pointer-up (with optional live element updates while alt-dragging). This is the only geometry/coordinate-space-sensitive file in the cluster.

- Type `EyeDropperProperties` — L21-L32: `{ keepOpenOnAlt: boolean; swapPreviewOnAlt?: boolean; onSelect: (color: string, event: PointerEvent) => void; colorPickerType: ColorPickerType }`. `onSelect` fires on pointerup; `colorPickerType` identifies which property of selected elements to update.
- `activeEyeDropperAtom = atom<null | EyeDropperProperties>(null)` — L34: jotai atom (from `../editor-jotai`) holding the currently-active eyedropper config, or null when inactive.
- `EyeDropper: React.FC<{ onCancel: () => void; onSelect: EyeDropperProperties["onSelect"]; onChange: (type, color, selectedElements, { altKey }) => void; colorPickerType }>` — L36-L238. The component.
  - Props: `onCancel`, `onSelect` (on pointerup), `onChange` (fires on pointerdown/while dragging for live preview, receives the `ColorPickerType`, the hex color, the array of selected elements, and `{ altKey }`), `colorPickerType`.
  - Portal container: `eyeDropperContainer = useCreatePortalContainer({ className: "excalidraw-eye-dropper-backdrop", parentSelector: ".excalidraw-eye-dropper-container" })` (L48-L51).
  - State sources: `appState = useUIAppState()`, `elements = useExcalidrawElements()`, `app = useApp()`, `excalidrawContainer` from `useExcalidrawContainer()` (L52-L66).
  - `selectedElements = getSelectedElements(elements, appState)` (L56).
  - `stableProps = useStable({ app, onCancel, onChange, onSelect, selectedElements })` (L58-L64): wraps callbacks/values in a stable ref so the effect's listeners always read latest values without re-subscribing.
  - Ref: `ref = useRef<HTMLDivElement>(null)` (L210) — the floating color-preview div that is portal-rendered (L234-L237). NOTE: `ref` is declared at L210 but read inside the effect at L69 (`ref.current`); the effect runs after render so the ref is populated.
  - Main `useEffect` (L68-L208), deps `[stableProps, app.canvas, eyeDropperContainer, colorPickerType, excalidrawContainer, appState.offsetLeft, appState.offsetTop]`:
    - Early-returns if no preview div, no `app.canvas`, or no portal container (L71-L73).
    - Gets the canvas 2D context (L77).
    - `getCurrentColor({ clientX, clientY })` (L79-L94): **KEY GEOMETRY** — converts viewport client coords to canvas device-pixel coords via `(clientX - appState.offsetLeft) * window.devicePixelRatio` and `(clientY - appState.offsetTop) * window.devicePixelRatio`, then `ctx.getImageData(x, y, 1, 1).data` reads a single pixel and `rgbToHex(pixel[0], pixel[1], pixel[2])` returns the hex string. This is the central coordinate-space transform: client space → editor-relative (subtract offset) → device pixels (multiply by DPR). A Svelte/Canvas reimplementation must apply the same offset-then-DPR scaling or it will sample the wrong pixel on HiDPI displays.
    - `mouseMoveListener({ clientX, clientY, altKey })` (L96-L121): positions the preview div at `clientY + 20` / `clientX + 20` (a fixed +20px offset from cursor; an inline FIXME notes it does not flip when near the viewport edge), samples the color, and if a pointer is held down calls `stableProps.onChange(...)` for live update; finally sets the preview div's background to the sampled color.
    - `onCancel` (L123-L125) and `onSelect` (L127-L132): thin wrappers delegating to `stableProps`.
    - `pointerDownListener` (L134-L139): sets `isHoldingPointerDown = true`; calls `event.stopImmediatePropagation()` but deliberately does NOT `preventDefault()` (comment: doing so would suppress subsequent pointermove events).
    - `pointerUpListener` (L141-L152): clears the holding flag, refocuses `excalidrawContainer` (since no preventDefault was done on pointerdown, focus would otherwise fall to `body`), stops propagation and prevents default, then commits the pick via `onSelect(getCurrentColor(event), event)`.
    - `keyDownListener` (L154-L160): on `KEYS.ESCAPE`, prevents default, stops propagation, and cancels.
    - Setup (L164-L184): sets `eyeDropperContainer.tabIndex = -1` and focuses it (so it can receive keydown), then primes the preview by invoking `mouseMoveListener` once with `app.lastViewportPosition` (so the swatch shows before the first mouse move). Registers keydown/pointerdown/pointerup on the container, a passive `pointermove` on `window`, and `blur` on `window` → cancel.
    - Cleanup (L186-L199): resets the holding flag and removes every listener.
  - `useOutsideClick(ref, () => onCancel(), predicate)` (L212-L228): cancels on outside click, but the predicate treats clicks inside `.excalidraw-eye-dropper-trigger` or `.excalidraw-eye-dropper-backdrop` as "inside" (returns true) so the trigger/backdrop don't self-dismiss; all other targets count as outside.
  - Render (L230-L237): returns `null` until the portal container exists, then `createPortal(<div ref={ref} className="excalidraw-eye-dropper-preview" />, eyeDropperContainer)`.
  - Performance/invariant notes: pointermove is registered passive (no scroll-jank); `useStable` avoids re-subscribing listeners on every prop change; the +20px preview offset and DPR-scaled pixel sampling are the parity-relevant details.

---

### packages/excalidraw/components/FilledButton.tsx

Purpose: A styled, variant-aware button that auto-manages an async loading spinner and a success-check state.

- Type `ButtonVariant = "filled" | "outlined" | "icon"` — L13.
- Type `ButtonColor = "primary" | "danger" | "warning" | "muted" | "success"` — L14-L19.
- Type `ButtonSize = "medium" | "large"` — L20.
- Type `FilledButtonProps` — L22-L37: `label?`, `children?`, `onClick?: (event: React.MouseEvent) => void`, `status?: null | "loading" | "success"`, `variant?`, `color?`, `size?`, `className?`, `fullWidth?`, `icon?: React.ReactNode`, `disabled?`.
- `FilledButton = forwardRef<HTMLButtonElement, FilledButtonProps>((props, ref) => ...)` — L39-L119.
  - Defaults: `variant = "filled"`, `color = "primary"`, `size = "medium"` (L46-L48). Forwards `ref` to the underlying `<button>`.
  - State: `isLoading` via `useState(false)` (L56).
  - Handler `_onClick = async (event: React.MouseEvent)` (L58-L79): calls `onClick?.(event)`; if the return is promise-like (`isPromiseLike(ret)`), it starts a **50ms-delayed** loading state via `setTimeout` (to avoid spinner flicker on fast responses), awaits the promise inside try/catch/finally. In catch: re-throws any error that is NOT an `AbortError`; for `AbortError` it just `console.warn`s (swallowed). In finally: clears the timer and resets `isLoading = false`. **Invariant**: spinner only appears if the click handler returns a thenable AND the promise takes >50ms.
  - Derived: `_status = isLoading ? "loading" : status` (L81); `color` is forced to `"success"` when `_status === "success"` (L82).
  - Render (L84-L117): a `<button type="button">` with clsx classes `ExcButton`, `ExcButton--color-${color}`, `ExcButton--variant-${variant}`, `ExcButton--size-${size}`, `ExcButton--status-${_status}`, optional `ExcButton--fullWidth`, plus `className`. `aria-label={label}`. `disabled` when `disabled || _status === "loading" || _status === "success"`. Contents: a `Spinner` when loading, the `tablerCheckIcon` when success, the optional `icon` (aria-hidden), and — for non-`icon` variants — `children ?? label` as the text.

---

### packages/excalidraw/components/FixedSideContainer.tsx

Purpose: A layout wrapper that pins its children to a fixed side (top/left/right) of the editor via CSS classes.

- Type `FixedSideContainerProps = { children: React.ReactNode; side: "top" | "left" | "right"; className?: string }` — L6-L10.
- `FixedSideContainer({ children, side, className }: FixedSideContainerProps)` — L12-L26: renders a `<div>` with clsx classes `FixedSideContainer`, `FixedSideContainer_side_${side}`, and any `className`, wrapping `children`. The actual positioning is delegated entirely to `FixedSideContainer.scss`. Pure component, no state/refs/effects/handlers.

---

### packages/excalidraw/components/FollowMode/FollowMode.tsx

Purpose: A collaboration overlay badge displayed when the local user is following another collaborator's viewport, with a disconnect button.

- Interface `FollowModeProps = { width: number; height: number; userToFollow: UserToFollow; onDisconnect: () => void }` — L7-L12.
- `FollowMode({ height, width, userToFollow, onDisconnect }: FollowModeProps)` — L14-L42 (default-exported at L44):
  - Props: `width`/`height` (numbers, applied as inline pixel sizing on the outer `.follow-mode` div via `style={{ width, height }}` — L21), `userToFollow` (a `UserToFollow` from `../../types`), `onDisconnect` callback.
  - Renders a badge showing the hardcoded English text "Following " followed by `userToFollow.username` in a `<span title={userToFollow.username}>` (the `title` gives a tooltip for truncated names), and a `<button type="button" onClick={onDisconnect}>` containing the `CloseIcon` to leave follow mode.
  - No state/refs/effects. The only handler is the disconnect button's `onClick` wired directly to the `onDisconnect` prop. Note: "Following" is not internationalized (no `t(...)` call), unlike most other components in this cluster.
