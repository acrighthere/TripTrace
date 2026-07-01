"use client";

import { LOCALES, useLocale, useSetLocale, type Locale } from "@/lib/i18n";

const LABEL: Record<Locale, string> = { ru: "RU", en: "EN" };

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const setLocale = useSetLocale();

  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-slate-300 ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-sky-500 ${
            locale === l ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
