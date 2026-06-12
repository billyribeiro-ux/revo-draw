## Cluster: excalidraw__components__17

This cluster covers the shape/tool catalog, the shareable-link dialog, and the Sidebar component family (compound component, context, header, tabs, tab).

---

### packages/excalidraw/components/shapes.tsx

Defines the canonical catalog of drawing tools/shapes plus helpers to map keyboard keys to a tool value.

- **`SHAPES` (const, L20-L117)** — A `readonly` tuple of tool descriptors. Each entry has `{ icon, value, key, numericKey, fillable, toolbar }`. Tools in order: `hand`, `selection`, `rectangle`, `diamond`, `ellipse`, `arrow`, `line`, `freedraw`, `text`, `image`, `eraser`, `laser`.
  - `icon` is a JSX element imported from `./icons`.
  - `key` is a single keyboard char (e.g. `KEYS.R`) or, for `freedraw`, an array `[KEYS.P, KEYS.X]` (L80). `image` and `laser`/`hand` have varying `key`/`numericKey` nullness.
  - `numericKey` maps `1`–`0` to the first ten toolbar entries (L33–L106); `hand` and `laser` have `null`.
  - `fillable` flags whether the tool produces a fill-capable shape (selection/rectangle/diamond/ellipse/arrow/line are `true`; hand/freedraw/text/image/eraser/laser are `false`).
  - `toolbar` is `true` for all except `laser` (L115) — laser is not shown in the toolbar.
  - Invariant: this is the source-of-truth ordering used by numeric hotkeys and `getToolbarTools`.

- **`getToolbarTools(app: AppClassProperties)` (L119-L130)** — Returns the toolbar tool list, substituting the selection tool with a `lasso` variant when `app.state.preferredSelectionTool.type === "lasso"`. In that case it returns a new tuple: `[SHAPES[0] (hand), { ...SHAPES[1], value: "lasso" }, ...SHAPES.slice(2)]`; otherwise returns `SHAPES` unchanged. Pure; no side effects.

- **`findShapeByKey(key: string, app: AppClassProperties)` (L132-L143)** — Given a pressed key string, finds the matching tool from `getToolbarTools(app)` and returns its `value`, or `null` if none. Match logic (L134-L140): matches if `numericKey != null && key === numericKey.toString()`, OR if `shape.key` is a string equal to `key`, OR if `shape.key` is an array that `.includes(key)`. Note the `index` param in the predicate is unused. Returns `shape?.value || null`.

---

### packages/excalidraw/components/ShareableLinkDialog.tsx

A small modal dialog presenting a read-only collaboration link with a copy-to-clipboard button.

- **`ShareableLinkDialogProps` (type, L14-L19)** — `{ link: string; onCloseRequest: () => void; setErrorMessage: (error: string) => void }`.

- **`ShareableLinkDialog({ link, onCloseRequest, setErrorMessage })` (component, L21-L80)** — Renders a `Dialog` (size `small`, no title) containing an `<h3>Shareable link</h3>`, a read-only `TextField` (auto-selected on render via `selectOnRender`), a `FilledButton` to copy, and a security note `🔒 {t("alerts.uploadedSecurly")}`.
  - **State/refs:** `setJustCopied` from `useState(false)` (the value itself is discarded — only the setter is used to drive the timed reset; L27); `timerRef = useRef<number>(0)` holds the clear-timeout handle (L28); `ref = useRef<HTMLInputElement>(null)` points at the TextField input (L29). Also uses `useCopyStatus()` → `{ onCopy, copyStatus }` (L49) to drive the button's copied indicator.
  - **`copyRoomLink` (async, L31-L48):** awaits `copyTextToSystemClipboard(link)`; on failure calls `setErrorMessage(t("errors.copyToSystemClipboardFailed"))`. Sets `justCopied` true, clears any prior `timerRef` timeout, schedules a 3000ms reset to false (L43-L45), then re-selects the input via `ref.current?.select()`.
  - **Handler:** the FilledButton `onClick` (L68-L71) calls `onCopy()` then `copyRoomLink()`.
  - Behavior note: the dialog never auto-closes on copy; closing is via `onCloseRequest` passed to `Dialog`.

---

### packages/excalidraw/components/Sidebar/common.ts

Types and the React context for the Sidebar compound-component family. Types/context only — no functions.

- **`SidebarTriggerProps` (type, L6-L15)** — `{ name: SidebarName; tab?: SidebarTabName; icon?: JSX.Element; children?: React.ReactNode; title?: string; className?: string; onToggle?: (open: boolean) => void; style?: React.CSSProperties }`.
- **`SidebarProps<P = {}>` (type, L17-L35)** — `{ name: SidebarName; children: React.ReactNode; onStateChange?: (state: AppState["openSidebar"]) => void; onDock?: (docked: boolean) => void; docked?: boolean; className?: string; __fallback?: boolean } & P`. Notes: `onStateChange` fires on open/close or tab change; `onDock` plus `docked` makes the sidebar user-dockable; `__fallback` (private) marks internal editor sidebars to have lower precedence than host-app sidebars.
- **`SidebarPropsContextValue` (type, L37-L40)** — `Pick<SidebarProps, "onDock" | "docked"> & { onCloseRequest: () => void; shouldRenderDockButton: boolean }`.
- **`SidebarPropsContext` (const, L42-L43)** — `React.createContext<SidebarPropsContextValue>` initialized with an empty cast object; provided by `SidebarInner` and consumed by `SidebarHeader`.

---

### packages/excalidraw/components/Sidebar/Sidebar.tsx

The Sidebar compound component: a docked/floating panel gated on `appState.openSidebar`, with outside-click and Escape-to-close handling and a Jotai atom broadcasting docked state.

- **`isSidebarDockedAtom` (atom, L46)** — `atom(false)`. Module-level Jotai atom flagging whether the currently rendered Sidebar is docked, so upstream components (e.g. LayerUI) can shift the UI. Comment (L38-L45) notes only one Sidebar renders at a time, so a single boolean suffices.

- **`SidebarInner` (forwardRef component, L48-L159)** — The actual rendered sidebar; forwards a ref to the inner Island `HTMLDivElement`. Props: `{ name, children, onDock, docked, className, ...rest }` (`SidebarProps` minus `onSelect`).
  - **Dev warning (L60-L64):** if `isDevEnv() && onDock && docked == null`, warns that `docked` must be set when `onDock` is supplied.
  - **Hooks/refs/effects:** `setAppState` (L66); `setIsSidebarDockedAtom` via `useSetAtom` (L68). `useLayoutEffect` (L70-L75) sets the docked atom to `!!docked` on mount/update and resets to `false` on cleanup. `headerPropsRef` (L77-L91) is a mutable ref holding `SidebarPropsContextValue`; its `onCloseRequest` sets `openSidebar: null`, `onDock` proxies to the prop, and it is renewed each render via `updateObject(...)` with `{ docked, shouldRenderDockButton: !!onDock && docked != null }` — the comment (L84-L86) explains the ref is renewed (rather than passed as props) because `<Sidebar.Header/>` may be rendered upstream and must rerender on these prop changes. `islandRef` (L93) plus `useImperativeHandle` (L95-L97) expose the island node through the forwarded ref. `editorInterface` from `useEditorInterface()` (L99).
  - **`closeLibrary` (useCallback, L101-L109):** no-ops if any `.Dialog` is open (`document.querySelector(".Dialog")`), otherwise sets `openSidebar: null`.
  - **Outside-click (L111-L126):** `useOutsideClick(islandRef, cb)` where the callback ignores clicks on `.sidebar-trigger` (so the trigger can toggle), then closes if `!docked || !editorInterface.canFitSidebar`.
  - **Escape handler (L128-L141):** `useEffect` adds a `keydown` listener; on `KEYS.ESCAPE`, closes when `!docked || !editorInterface.canFitSidebar`; removes listener on cleanup.
  - **Render (L143-L157):** an `Island` with class `CLASSES.SIDEBAR` + conditional `sidebar--docked`, wrapping children in `SidebarPropsContext.Provider value={headerPropsRef.current}`.
  - `displayName = "SidebarInner"` (L160).

- **`Sidebar` (L162-L224)** — `Object.assign` of a `forwardRef` wrapper component with static members `{ Header, TabTriggers, TabTrigger, Tabs, Tab, Trigger }` (L216-L223), forming the compound-component API. The wrapper:
  - Reads `useUIAppState()` (L164) and destructures `onStateChange` (L166).
  - **State-change effect (L168-L188):** keeps `refPrevOpenSidebar` ref of previous `openSidebar`. Fires `onStateChange` when the sidebar for this `name` is being closed, this sidebar is opening, or tabs are switching — guarded by `appState.openSidebar !== refPrevOpenSidebar.current`. Passes `null` when the open sidebar is no longer this one, else the open-sidebar object. Updates the ref at the end.
  - **Mount gate (L190-L208):** `mounted` state set true in `useLayoutEffect` (reset false on unmount). `shouldRender = mounted && appState.openSidebar?.name === props.name`. The comment (L196-L208) explains the next-tick mount avoids fallback-flicker by guaranteeing the previous sidebar unmounts first (HoC fallback flags otherwise race).
  - Returns `null` if `!shouldRender` (L210-L212), else `<SidebarInner {...props} ref={ref} key={props.name} />` (keyed by name to force remount across sidebars).
  - `displayName = "Sidebar"` (L225).

---

### packages/excalidraw/components/Sidebar/SidebarHeader.tsx

Renders the sidebar header row with optional dock (pin) toggle and a close button, pulling behavior from `SidebarPropsContext`.

- **`SidebarHeader({ children, className })` (component, L12-L57)** — Props: `{ children?: React.ReactNode; className?: string }`.
  - Reads `editorInterface` (`useEditorInterface()`, L19) and `props` (`useContext(SidebarPropsContext)`, L20).
  - **`renderDockButton` (L22-L24):** `!!(editorInterface.canFitSidebar && props.shouldRenderDockButton)` — dock button only shows when the sidebar can fit and is user-dockable.
  - **Render (L26-L56):** a `div.sidebar__header` (testid `sidebar-header`) containing `children` then a `.sidebar__header__buttons` group. If `renderDockButton`, renders a `Tooltip`-wrapped `Button` (testid `sidebar-dock`) whose `onSelect` toggles `props.onDock?.(!props.docked)` and whose `selected` reflects `!!props.docked`, showing `PinIcon`. Always renders a close `Button` (testid `sidebar-close`) calling `props.onCloseRequest`, showing `CloseIcon`.
  - `displayName = "SidebarHeader"` (L59).

---

### packages/excalidraw/components/Sidebar/SidebarTab.tsx

Thin wrapper around Radix `Tabs.Content` representing one sidebar tab panel.

- **`SidebarTab({ tab, children, ...rest })` (component, L5-L18)** — Props: `{ tab: SidebarTabName; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>`. Renders `<RadixTabs.Content {...rest} value={tab} data-testid={tab}>{children}</RadixTabs.Content>` — the panel shown when the Radix tab `value` matches `tab`. `displayName = "SidebarTab"` (L19).

---

### packages/excalidraw/components/Sidebar/SidebarTabs.tsx

Wrapper around Radix `Tabs.Root` that binds the active tab to `appState.openSidebar.tab`.

- **`SidebarTabs({ children, ...rest })` (component, L6-L36)** — Props: `{ children: React.ReactNode } & Omit<React.RefAttributes<HTMLDivElement>, "onSelect">`.
  - Reads `appState` (`useUIAppState()`) and `setAppState` (L12-L13). Returns `null` early if `!appState.openSidebar` (L15-L17).
  - Destructures `name` from `openSidebar` (L19).
  - **Render (L21-L34):** `<RadixTabs.Root className="sidebar-tabs-root" value={appState.openSidebar.tab} onValueChange={(tab) => setAppState((state) => ({ ...state, openSidebar: { ...state.openSidebar, name, tab } }))} {...rest}>`. The `onValueChange` handler (L25-L30) updates `openSidebar` with the new `tab` while preserving `name`. `displayName = "SidebarTabs"` (L37).

---

No files in this cluster were empty. `common.ts` is types-and-context only (no functions). The remaining files are small React `.tsx` components plus the `shapes.tsx` tool catalog with two pure helper functions.
