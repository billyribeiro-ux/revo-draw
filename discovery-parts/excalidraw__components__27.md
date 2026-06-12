## Cluster: excalidraw__components__27

This cluster covers the collaborator avatar list and the canvas "welcome screen" (the decorative empty-state shown before the user draws anything). All four are React `.tsx` files; the welcome-screen trio is built around Excalidraw's "tunnel" portal pattern (`useTunnels`) so subtrees render into fixed positions in the canvas overlay.

### packages/excalidraw/components/UserList.tsx

Renders the horizontal stack of collaborator avatars in the multiplayer top-right area, collapsing overflow into a `+N` popover with an optional search filter.

- **Types / constants**
  - `GoToCollaboratorComponentProps` (exported type, L22-L27): `{ socketId: SocketId; collaborator: Collaborator; withName: boolean; isBeingFollowed: boolean }` — the data shape passed to the `goToCollaborator` action when it renders an avatar.
  - `ClientId` (internal branded type, L30): `string & { _brand: "UserId" }`. Distinguishes a collaborator's stable user id (or socketId fallback) from a raw socket id.
  - `DEFAULT_MAX_AVATARS = 4` (L32), `SHOW_COLLABORATORS_FILTER_AT = 8` (L33): default number of inline avatars before overflow, and the collaborator count threshold at which the in-popover `QuickSearch` filter appears.
  - `UserListUserObject` (internal type, L84-L93): `Pick<Collaborator, "avatarUrl"|"id"|"socketId"|"username"|"isInCall"|"isSpeaking"|"isMuted">` — the subset of collaborator fields this component actually consumes.
  - `UserListProps` (internal type, L95-L100): `{ className?; mobile?; collaborators: Map<SocketId, UserListUserObject>; userToFollow: SocketId | null }`.
  - `collaboratorComparatorKeys` (L102-L110): the `as const` key array used by the custom `React.memo` comparator for shallow per-collaborator equality.

- **`ConditionalTooltipWrapper({ shouldWrap, children, username })`** (L35-L48): Returns `children` wrapped in a `<Tooltip label={username || "Unknown user"}>` when `shouldWrap` is true, otherwise the bare children in a fragment. Pure presentational helper; no state.

- **`renderCollaborator({ actionManager, collaborator, socketId, withName=false, shouldWrapWithTooltip=false, isBeingFollowed })`** (L50-L82): Builds the `GoToCollaboratorComponentProps` payload (L65-L70), then delegates avatar rendering to `actionManager.renderAction("goToCollaborator", data)` (L71). Wraps the resulting JSX in `ConditionalTooltipWrapper` keyed by `socketId` (L73-L81). Side effect: none directly; the rendered action owns click-to-follow behavior. Invariant: `key={socketId}` must be unique, which is why the parent dedupes by user id first.

- **`UserList` (default export, `React.memo`)** (L112-L296): The component proper.
  - Props: `UserListProps` (see above).
  - Hooks/refs/state owned:
    - `actionManager = useExcalidrawActionManager()` (L114).
    - `searchTerm` / `setSearchTerm` (`useState("")`, L134) — drives the QuickSearch filter.
    - `userListWrapper` (`useRef<HTMLDivElement|null>`, L140) — measured for responsive avatar count.
    - `maxAvatars` / `setMaxAvatars` (`useState(DEFAULT_MAX_AVATARS)`, L170).
    - `useLayoutEffect` (L142-L168) — responsive observer (detailed below).
  - Dedupe logic (L116-L132): builds `uniqueCollaboratorsMap` keyed by `collaborator.id || socketId` (preferring stable user id, falling back to socket id), spreading `{ ...collaborator, socketId }` so the resolved socketId is retained; then filters to only collaborators with a non-empty trimmed `username` (L130-L132). Invariant: one avatar per logical user even across reconnects.
  - Filtering (L135-L138): `filteredCollaborators` is the unique array filtered by case-insensitive `username.includes(searchTerm)`. Note `searchTerm` is not lowercased here, only `username` is — a parity-relevant subtlety (uppercase search input would never match).
  - Inline slice (L172-L185): `firstNCollaborators = uniqueCollaboratorsArray.slice(0, maxAvatars - 1)` — leaves one slot for the `+N` button; mapped into `firstNAvatarsJSX` with `shouldWrapWithTooltip: true` and `isBeingFollowed` computed by `collaborator.socketId === userToFollow`.
  - Render branches:
    - **mobile** (L187-L198): renders ALL unique collaborators inline in a `.UserList.UserList_mobile` div, no overflow popover.
    - **desktop** (L199-L262): renders `firstNAvatarsJSX` inside `.UserList` with inline CSS var `--max-avatars` set to `maxAvatars` (L203, cast `[`--max-avatars` as any]`). When `uniqueCollaboratorsArray.length > maxAvatars - 1` (L207) it adds a radix `Popover.Root`/`Trigger` showing `+{length - maxAvatars + 1}` (L210), and `Popover.Content` (z-index 2, width 15rem, `align="end"`, `sideOffset={10}`) containing an `Island`. Inside: a `QuickSearch` shown only when `length >= SHOW_COLLABORATORS_FILTER_AT` (L222-L228), and a `ScrollableList` (L229-L249) that defensively returns `[]` when no matches (the list checks `Children.count()`), else a `.hint` div plus the filtered collaborators rendered `withName: true`. A styled `Popover.Arrow` (20x10, fill `--popup-bg-color`, drop-shadow) closes the island (L250-L257).
  - **Custom memo comparator** (L266-L295): returns `false` (re-render) if `collaborators.size`, `mobile`, `className`, or `userToFollow` differ (L267-L274). Otherwise iterates `prev.collaborators` while advancing `next.collaborators.keys()` in lockstep (`nextCollaboratorSocketIds.next().value`, L284) — so it re-renders if a collaborator is missing, the **map insertion order** changed, or any of `collaboratorComparatorKeys` differ via `isShallowEqual` (L278-L293). Performance detail: comparator is O(n) and order-sensitive, deliberately avoiding deep avatar re-renders.
  - **`useLayoutEffect` responsive sizing** (L142-L168): measures `userListWrapper.current.clientWidth` and sets `maxAvatars = Math.max(1, Math.min(8, Math.floor(width / 38)))` — i.e. ~38px per avatar, clamped to [1,8]. Runs once on mount, then installs a `ResizeObserver` (guarded by `supportsResizeObserver`) that re-measures `entry.contentRect.width` on every resize; cleanup disconnects the observer. Empty dep array `[]` (L168) so the observer is set up once. Parity note: the 38px divisor and [1,8] clamp are the magic numbers governing overflow.

### packages/excalidraw/components/welcome-screen/WelcomeScreen.Center.tsx

Defines the center cluster of the welcome screen (logo, heading, menu of quick actions) and exposes a composable `Center` namespace with attached sub-components; renders into the `WelcomeScreenCenterTunnel`.

- **`WelcomeScreenMenuItemContent({ icon, shortcut, children })`** (L12-L32): Internal layout shell for a menu item — renders an `__icon` div, a `__text` div (children), and a `__shortcut` div only when `shortcut` is truthy AND `editorInterface.formFactor !== "phone"` (so shortcuts hide on phones). Reads `useEditorInterface()` (L21). `displayName` set (L32).

- **`WelcomeScreenMenuItem({ onSelect, children, icon, shortcut, className="", ...props })`** (L34-L60): Renders a `<button type="button" className={`welcome-screen-menu-item ${className}`}>` whose `onClick` is `onSelect`, wrapping `WelcomeScreenMenuItemContent`. Spreads remaining `React.ButtonHTMLAttributes`. `displayName` set (L60).

- **`WelcomeScreenMenuItemLink({ children, href, icon, shortcut, className="", ...props })`** (L62-L89): Anchor variant — `<a href target="_blank" rel="noopener">` with the same content shell; spreads `AnchorHTMLAttributes`. `displayName` set (L89).

- **`Center({ children })`** (L91-L110): Renders into `WelcomeScreenCenterTunnel.In` (from `useTunnels()`, L92). If no `children` provided, renders the default composition: `<Logo/>`, `<Heading>` with `t("welcomeScreen.defaults.center_heading")`, and a `<Menu>` containing `<MenuItemLoadScene/>` and `<MenuItemHelp/>` (L96-L104). `displayName` set (L110).

- **`Logo({ children })`** (L112-L119): Decorative logo wrapper (`welcome-screen-center__logo excalifont welcome-screen-decor`); defaults to `<ExcalidrawLogo withText />`.

- **`Heading({ children })`** (L121-L128): Styled heading wrapper div; children required.

- **`Menu({ children })`** (L130-L133): Simple `.welcome-screen-menu` container.

- **`MenuItemHelp()`** (L135-L148): Menu item that runs `actionManager.executeAction(actionShortcuts)` on select (opens the help/shortcuts dialog), shortcut `"?"`, `HelpIcon`, label `t("helpDialog.title")`. Reads `useExcalidrawActionManager()`.

- **`MenuItemLoadScene()`** (L150-L168): Reads `useUIAppState()`; returns `null` when `appState.viewModeEnabled` (L154-L156) — hidden in view mode. Otherwise a menu item executing `actionLoadScene`, shortcut from `getShortcutFromShortcutName("loadScene")`, `LoadIcon`, label `t("buttons.load")`.

- **`MenuItemLiveCollaborationTrigger({ onSelect })`** (L170-L183): Menu item with `shortcut={null}`, `usersIcon`, label `t("labels.liveCollaboration")` (uses `useI18n()` for `t`). The host app wires `onSelect` to start collaboration.

- **Namespace attachment** (L187-L196): `Center.Logo/Heading/Menu/MenuItem/MenuItemLink/MenuItemHelp/MenuItemLoadScene/MenuItemLiveCollaborationTrigger` assigned so consumers can override individual pieces. Exports `{ Center }`.

### packages/excalidraw/components/welcome-screen/WelcomeScreen.Hints.tsx

Defines the three decorative arrow+label hints ("open the menu", "pick a tool", "get help") that point at fixed UI regions; each renders into its own tunnel so it overlays the correct on-screen element.

- **`MenuHint({ children })`** (L9-L22): Renders into `WelcomeScreenMenuHintTunnel.In`. Outputs the `WelcomeScreenMenuArrow` icon followed by a `__label` div defaulting to `t("welcomeScreen.defaults.menuHint")`. `displayName` set (L22).

- **`ToolbarHint({ children })`** (L24-L37): Renders into `WelcomeScreenToolbarHintTunnel.In`. Label first then the `WelcomeScreenTopToolbarArrow` icon (label-before-arrow ordering, opposite of MenuHint), defaulting to `t("welcomeScreen.defaults.toolbarHint")`. `displayName` set (L37).

- **`HelpHint({ children })`** (L39-L50): Renders into `WelcomeScreenHelpHintTunnel.In`. Label then `WelcomeScreenHelpArrow`, defaulting to `t("welcomeScreen.defaults.helpHint")`. `displayName` set (L50).

- Exports `{ HelpHint, MenuHint, ToolbarHint }` (L52). All three share the classes `excalifont welcome-screen-decor welcome-screen-decor-hint`. No state, refs, or effects — purely positional/decorative SVG+text. The arrow-vs-label ordering per hint is the layout-relevant detail.

### packages/excalidraw/components/welcome-screen/WelcomeScreen.tsx

Top-level `WelcomeScreen` component that composes the center cluster and all three hints; default-exported and the public entry point.

- **`WelcomeScreen({ children })`** (L6-L19): If `props.children` is provided it renders them verbatim (full override); otherwise renders the default composition `<Center/>`, `<MenuHint/>`, `<ToolbarHint/>`, `<HelpHint/>` in a fragment (L9-L17). No state/refs/effects. `displayName` set (L21).
- Namespace attachment (L23-L24): `WelcomeScreen.Center = Center` and `WelcomeScreen.Hints = { MenuHint, ToolbarHint, HelpHint }`, enabling the API consumers use (`<WelcomeScreen.Center.Menu>…</>`). Imports `"./WelcomeScreen.scss"` for styling (L4). `export default WelcomeScreen` (L26).
