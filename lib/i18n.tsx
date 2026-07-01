"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { MESSAGES } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n-config";

// Re-exported so client components can keep importing from "@/lib/i18n".
export { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale, type Locale } from "@/lib/i18n-config";

type Params = Record<string, string | number>;

function translate(locale: Locale, key: string, params?: Params): string {
  const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  let str = table[key] ?? MESSAGES.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, setLocale: () => {} });

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    // Persist for the next server render (sets <html lang>) and update it now.
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

export function useSetLocale(): (l: Locale) => void {
  return useContext(I18nContext).setLocale;
}

/** Returns the translator bound to the current locale: t("key", { count }). */
export function useT(): (key: string, params?: Params) => string {
  const { locale } = useContext(I18nContext);
  return useCallback((key: string, params?: Params) => translate(locale, key, params), [locale]);
}

const INTL_LOCALE: Record<Locale, string> = { ru: "ru-RU", en: "en-US" };

export function formatDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(INTL_LOCALE[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "12 Mar 2025" or "12 Mar 2025 – 15 Mar 2025" when an end date differs. */
export function formatDateRange(from: string | null, to: string | null, locale: Locale): string | null {
  const f = formatDate(from, locale);
  if (!f) return null;
  const t = formatDate(to, locale);
  return t && t !== f ? `${f} – ${t}` : f;
}

export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(INTL_LOCALE[locale]);
}
