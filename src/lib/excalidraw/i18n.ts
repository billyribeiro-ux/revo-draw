export interface Language {
  code: string;
  label: string;
  rtl?: boolean;
}

export type TranslationKeys = string;

export const defaultLang: Language = { code: "en", label: "English" };
export const languages: Language[] = [defaultLang];

let currentLang: Language = defaultLang;

export const setLanguage = async (lang: Language): Promise<void> => {
  currentLang = lang;
  if (typeof document !== "undefined") {
    document.documentElement.dir = currentLang.rtl ? "rtl" : "ltr";
    document.documentElement.lang = currentLang.code;
  }
};

export const getLanguage = (): Language => currentLang;

export const t = (
  path: TranslationKeys,
  replacement?: Record<string, string | number> | null,
  fallback?: string,
): string => {
  let translation = fallback ?? path;
  if (replacement) {
    for (const key in replacement) {
      translation = translation.replace(`{{${key}}}`, String(replacement[key]));
    }
  }
  return translation;
};

export const useI18n = () => ({ t, langCode: currentLang.code });
