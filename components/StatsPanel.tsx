"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

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
      setError("Couldn't load your stats.");
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
          ? `Resolved ${data.citiesUpdated} ${data.citiesUpdated === 1 ? "city" : "cities"}`
          : "Nothing to resolve"
      );
      await load();
    } catch {
      toast("Backfill failed. Try again.", "error");
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
        ← All places
      </button>

      <h2 className="mt-3 text-lg font-semibold">Travel stats</h2>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : !stats ? (
        <p className="mt-4 text-sm text-slate-400">Crunching the numbers…</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric
              label="Countries"
              value={stats.counts.countries}
              sub={`${stats.worldPct}% of the world`}
            />
            <Metric label="Continents" value={`${stats.counts.continents} / 7`} />
            <Metric label="Cities" value={stats.counts.cities} />
            <Metric label="Places" value={stats.counts.places} />
          </div>

          {stats.furthest && (
            <div className="mt-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              <p className="text-xs text-slate-500">Widest span</p>
              <p className="mt-0.5 text-slate-700">
                {stats.furthest.a} ↔ {stats.furthest.b}
              </p>
              <p className="text-xs text-slate-400">
                {stats.furthest.km.toLocaleString()} km apart
              </p>
            </div>
          )}

          {stats.missingCountry > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm">
              <p className="text-amber-800">
                {stats.missingCountry}{" "}
                {stats.missingCountry === 1 ? "city has" : "cities have"} no country yet.
              </p>
              <button
                onClick={backfill}
                disabled={backfilling}
                className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {backfilling ? "Resolving…" : "Resolve countries now"}
              </button>
            </div>
          )}

          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-700">By country</h3>
            {stats.countries.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">
                Pin a city to start counting countries.
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
                      {c.count} {c.count === 1 ? "pin" : "pins"}
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
