// Message registry: merges every per-area message table into one lookup
// keyed by locale. lib/i18n.tsx imports MESSAGES from here. Add new areas to
// the TABLES array below.
import type { Locale } from "@/lib/i18n-config";
import { common } from "./common";
import { auth } from "./auth";
import { map } from "./map";
import { sidePanel } from "./sidePanel";
import { visitForm } from "./visitForm";
import { statsPanel } from "./statsPanel";
import { tripDetail } from "./tripDetail";
import { photoSection } from "./photoSection";

type Table = Record<string, string>;

const TABLES = [common, auth, map, sidePanel, visitForm, statsPanel, tripDetail, photoSection];

function merge(locale: Locale): Table {
  return Object.assign({}, ...TABLES.map((t) => t[locale]));
}

export const MESSAGES: Record<Locale, Table> = {
  ru: merge("ru"),
  en: merge("en"),
};
