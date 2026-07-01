// Pure, server-and-client-safe i18n config. Kept out of lib/i18n.tsx (which is
// "use client") so server components — notably app/layout.tsx — can call these
// without importing a client module.

export type Locale = "ru" | "en";
export const LOCALES: Locale[] = ["ru", "en"];
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "locale";

export function normalizeLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "ru";
}
