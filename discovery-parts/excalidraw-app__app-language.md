## Cluster: excalidraw-app__app-language

This cluster implements the Excalidraw web app's UI-language selection: detecting the browser's preferred locale, storing the active language code in a Jotai atom (with side-effect persistence back into the i18next detector cache), and rendering the `<select>` dropdown that lets the user switch languages.

### excalidraw-app/app-language/language-detector.ts

Wraps `i18next-browser-languagedetector` to detect and normalize the user's preferred Excalidraw UI language against the library's supported `languages` list.

- **Module constant `languageDetector` — `new LanguageDetector()`** (L4): a singleton instance of `i18next-browser-languagedetector`'s `LanguageDetector`. It is `init`-ed immediately at module load with `{ languageUtils: {} }` (L6-L8) — an empty `languageUtils` object, which short-circuits i18next's normal language-utility processing so detection returns raw detected codes. Side effect: runs at import time. Exported so `language-state.ts` can call `cacheUserLanguage` on it.
- **`getPreferredLanguage = () => ...`** (L10-L25): returns the initial UI language `code` (a `string`). Algorithm:
  1. Calls `languageDetector.detect()` (L11), which may return a single string or an array of candidate codes.
  2. Normalizes to a single `detectedLanguage` by taking `[0]` if an array, else the value itself (L13-L15).
  3. Attempts to match a supported language whose `code` **starts with** the detected code via `languages.find((lang) => lang.code.startsWith(detectedLanguage))?.code` (L21). The `startsWith` (not equality) is the key detail: it lets a generic preferred language like `"zh"` resolve to the first concrete supported variant (e.g. `"zh-CN"`) when the browser does not supply a region/country subtag — see the inline comment at L19-L20 ("region code may not be defined ... chinese vs instead of chinese-simplified").
  4. Falls back to `defaultLang.code` when no language was detected or no match is found (the `|| defaultLang.code` at L22).
  - Inputs: none (reads from the browser via the detector and from the imported `languages` / `defaultLang` from `@excalidraw/excalidraw`). Output: a language code string. No mutation of external state. Invariant: always returns a supported code (never `undefined`/`null`), because of the `defaultLang.code` fallback.
  - Parity note: there is no fuzzy/closest-locale logic beyond prefix matching; the first list entry whose `code` prefixes the detected string wins, so ordering of the `languages` array determines which regional variant a generic locale maps to.

### excalidraw-app/app-language/language-state.ts

Holds the app-wide active UI language as a Jotai atom and exposes a hook that persists the selection back to the detector cache.

- **Module constant `appLangCodeAtom` — `atom(getPreferredLanguage())`** (L7): a Jotai primitive atom whose initial value is the result of `getPreferredLanguage()` (evaluated once at module init). Holds the current UI language code (`string`). Exported and consumed by both `useAppLangCode` here and `LanguageList.tsx` (via `useSetAtom`). Note `atom`/`useAtom` come from the app-local `../app-jotai` wrapper, not directly from `jotai`.
- **`useAppLangCode = () => ...`** (L9-L17): a React hook returning the tuple `[langCode, setLangCode] as const` (i.e. `readonly [string, setter]`). Behavior:
  - Subscribes to `appLangCodeAtom` via `useAtom` to get `[langCode, setLangCode]` (L10).
  - Owns a single `useEffect` (L12-L14) keyed on `[langCode]` that calls `languageDetector.cacheUserLanguage(langCode)` whenever the code changes — this is the side effect that persists the user's choice (typically to `localStorage`/cookie via i18next's caching) so the next session's `getPreferredLanguage()` detection can pick it up.
  - Returns the read/write tuple so callers can both display and change the language.
  - Invariant/parity note: persistence is a side effect of mounting + value change, not part of the setter itself; setting the atom elsewhere (e.g. `LanguageList`) only persists if a mounted `useAppLangCode` observes the change.

### excalidraw-app/app-language/LanguageList.tsx

A React component rendering the native `<select>` language-picker dropdown wired to the app's language atom.

- **`LanguageList` component — `({ style }: { style?: React.CSSProperties }) => JSX`** (L8-L27):
  - **Props:** `style?: React.CSSProperties` — optional inline styles forwarded to the `<select>` element (L8, L18).
  - **State/refs/hooks owned:** none of its own React state or refs. It reads `{ t, langCode }` from `useI18n()` (L9, the i18next translation function and current active code) and obtains the atom setter `setLangCode` via `useSetAtom(appLangCodeAtom)` (L10). It is a pure controlled-component over external Jotai/i18n state.
  - **Render:** a `<select className="dropdown-select dropdown-select__language">` (L13-L25) whose `value` is bound to `langCode` (controlled; L16) and `aria-label` is `t("buttons.selectLanguage")` for accessibility (L17). It maps the imported `languages` array to `<option key={lang.code} value={lang.code}>{lang.label}</option>` (L20-L24) — `code` as the value/React key, `label` as the human-readable display text.
  - **Event handlers:** `onChange={({ target }) => setLangCode(target.value)}` (L15) — on selection change, writes the chosen `target.value` (the option's `lang.code`) into `appLangCodeAtom` via the Jotai setter. It does not itself persist to the detector cache; persistence happens through `useAppLangCode`'s effect (in `language-state.ts`) elsewhere in the tree observing the atom change.
  - Parity note: this is a plain native `<select>`, not a custom popover/listbox — keyboard nav, focus, and option rendering are browser-native; the only styling hooks are the two CSS classes and the optional `style` prop.
