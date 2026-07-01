import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n-config";

export const metadata: Metadata = {
  title: "TripTrace",
  description: "Pin the cities and places you've visited on your own map.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale}>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
