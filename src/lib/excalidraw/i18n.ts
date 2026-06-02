// Port stub — i18n is explicitly out of scope. A minimal shape keeps the type hub self-contained,
// and a fixed default language keeps consumers (scrollbars RTL check, etc.) working in English.
export type Language = { code: string; label: string; rtl?: boolean };

export const defaultLang: Language = { code: "en", label: "English", rtl: false };

export const getLanguage = (): Language => defaultLang;
