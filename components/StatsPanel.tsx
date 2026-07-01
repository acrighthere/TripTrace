"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useT, useLocale, formatNumber } from "@/lib/i18n";

interface CountryStat {
  code: string;
  name: string;
  continent: string | null;
  count: number;
}

interface TravelStats {
  counts: { cities: number; places: number; countries: number; continents: number };
  worldPct: number;
  countries: CountryStat[];
  furthest: { a: string; b: string; km: number } | null;
  missingCountry: number;
}

/** ISO alpha-2 -> flag emoji (regional indicator letters). */
function flag(code: string): string {
  if (code.length !== 2) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (code.toUpperCase().charCodeAt(0) - 65),
    base + (code.toUpperCase().charCodeAt(1) - 65)
  );
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function StatsPanel({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const t = useT();
  const locale = useLocale();
  const [stats, setStats] = useState<TravelStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats((await res.json()) as TravelStats);
    } catch {
      setError(t("stats.loadError"));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function backfill() {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const res = await fetch("/api/stats/backfill", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { citiesUpdated: number };
      toast(
        data.citiesUpdated > 0
          ? t("stats.resolved", { count: formatNumber(data.citiesUpdated, locale) })
          : t("stats.nothingToResolve")
      );
      await load();
    } catch {
      toast(t("stats.backfillFailed"), "error");
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="p-4">
      <button
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        {t("stats.back")}
      </button>

      <h2 className="mt-3 text-lg font-semibold">{t("stats.heading")}</h2>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : !stats ? (
        <p className="mt-4 text-sm text-slate-400">{t("stats.loading")}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric
              label={t("stats.countries")}
              value={formatNumber(stats.counts.countries, locale)}
              sub={t("stats.worldPct", { worldPct: formatNumber(stats.worldPct, locale) })}
            />
            <Metric
              label={t("stats.continents")}
              value={t("stats.continentsOf7", { n: formatNumber(stats.counts.continents, locale) })}
            />
            <Metric label={t("stats.cities")} value={formatNumber(stats.counts.cities, locale)} />
            <Metric label={t("stats.places")} value={formatNumber(stats.counts.places, locale)} />
          </div>

          {stats.furthest && (
            <div className="mt-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              <p className="text-xs text-slate-500">{t("stats.widestSpan")}</p>
              <p className="mt-0.5 text-slate-700">
                {stats.furthest.a} ↔ {stats.furthest.b}
              </p>
              <p className="text-xs text-slate-400">
                {t("stats.kmApart", { km: formatNumber(stats.furthest.km, locale) })}
              </p>
            </div>
          )}

          {stats.missingCountry > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm">
              <p className="text-amber-800">
                {t("stats.missingCountry", {
                  count: formatNumber(stats.missingCountry, locale),
                })}
              </p>
              <button
                onClick={backfill}
                disabled={backfilling}
                className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {backfilling ? t("stats.resolving") : t("stats.resolveNow")}
              </button>
            </div>
          )}

          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-700">{t("stats.byCountry")}</h3>
            {stats.countries.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">
                {t("stats.empty")}
              </p>
            ) : (
              <ul className="mt-2 space-y-0.5">
                {stats.countries.map((c) => (
                  <li
                    key={c.code}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="text-base leading-none">
                        {flag(c.code)}
                      </span>
                      <span className="truncate text-slate-700">{c.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {t("stats.pins", { count: formatNumber(c.count, locale) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
