"use client";

import { useState } from "react";
import type { TripDto, VisitDto } from "@/types";

function visitOrder(a: VisitDto, b: VisitDto): number {
  const ka = a.visitedAt ?? a.createdAt;
  const kb = b.visitedAt ?? b.createdAt;
  return ka < kb ? -1 : ka > kb ? 1 : a.createdAt < b.createdAt ? -1 : 1;
}

function haversineKm(a: VisitDto, b: VisitDto): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface TripDetailProps {
  trip: TripDto;
  /** All visits assigned to this trip (any order). */
  stops: VisitDto[];
  onBack: () => void;
  onSelectStop: (id: string) => void;
  onRemoveStop: (id: string) => void;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

export default function TripDetail({
  trip,
  stops,
  onBack,
  onSelectStop,
  onRemoveStop,
  onRename,
  onDelete,
}: TripDetailProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(trip.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ordered = [...stops].sort(visitOrder);
  let km = 0;
  for (let i = 1; i < ordered.length; i++) km += haversineKm(ordered[i - 1], ordered[i]);

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await onRename(name.trim());
    if (ok) setRenaming(false);
  }

  return (
    <div className="p-4">
      <button
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        ← All trips
      </button>

      {renaming ? (
        <form onSubmit={submitRename} className="mt-3 flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            Save
          </button>
        </form>
      ) : (
        <div className="mt-3 flex items-start justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: trip.color }}
            />
            <span className="min-w-0 break-words">{trip.name}</span>
          </h2>
          <button
            onClick={() => {
              setName(trip.name);
              setRenaming(true);
            }}
            className="shrink-0 text-sm text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            Rename
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-100 px-3 py-3">
          <p className="text-xs text-slate-500">Stops</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{ordered.length}</p>
        </div>
        <div className="rounded-xl bg-slate-100 px-3 py-3">
          <p className="text-xs text-slate-500">Route distance</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {km >= 1 ? `${Math.round(km).toLocaleString()} km` : "—"}
          </p>
        </div>
      </div>

      <section className="mt-5">
        <h3 className="text-sm font-semibold text-slate-700">Stops, in order</h3>
        {ordered.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">
            No stops yet — open a visit and add it to this trip.
          </p>
        ) : (
          <ol className="mt-2 space-y-0.5">
            {ordered.map((v, i) => (
              <li key={v.id} className="flex items-center gap-1">
                <button
                  onClick={() => onSelectStop(v.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <span className="w-4 shrink-0 text-xs tabular-nums text-slate-400">{i + 1}</span>
                  <span className="truncate font-medium text-slate-700">{v.name}</span>
                </button>
                <button
                  onClick={() => onRemoveStop(v.id)}
                  aria-label={`Remove ${v.name} from trip`}
                  className="shrink-0 rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-5">
        {confirmingDelete ? (
          <div className="flex gap-2">
            <button
              onClick={onDelete}
              className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              Delete trip (keeps pins)
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Delete trip
          </button>
        )}
      </div>
    </div>
  );
}
