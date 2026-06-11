"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import type { DraftPin, VisitDto } from "@/types";
import VisitForm from "@/components/VisitForm";
import PhotoSection from "@/components/PhotoSection";
import type { VisitFormValues } from "@/components/MapApp";

interface SidePanelProps {
  userEmail: string;
  visits: VisitDto[];
  loading: boolean;
  selectedId: string | null;
  draft: DraftPin | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCreate: (pin: DraftPin, values: VisitFormValues) => Promise<boolean>;
  onUpdate: (id: string, values: Omit<VisitFormValues, "type">) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onPhotoCountChange: (visitId: string, delta: number) => void;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function TypeBadge({ type }: { type: VisitDto["type"] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        type === "CITY" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {type === "CITY" ? "City" : "Place"}
    </span>
  );
}

export default function SidePanel({
  userEmail,
  visits,
  loading,
  selectedId,
  draft,
  onSelect,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onPhotoCountChange,
}: SidePanelProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const selected = selectedId ? visits.find((v) => v.id === selectedId) ?? null : null;

  useEffect(() => {
    setEditing(false);
    setConfirmingDelete(false);
  }, [selectedId]);

  const cities = useMemo(
    () =>
      visits
        .filter((v) => v.type === "CITY")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [visits]
  );
  const placesByParent = useMemo(() => {
    const map = new Map<string, VisitDto[]>();
    const cityIds = new Set(cities.map((c) => c.id));
    for (const v of visits) {
      if (v.type !== "PLACE") continue;
      const key = v.parentId && cityIds.has(v.parentId) ? v.parentId : "__orphan__";
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [visits, cities]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return visits
      .filter((v) => v.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visits, search]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rowClass =
    "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500";

  function VisitRow({ visit, indent }: { visit: VisitDto; indent?: boolean }) {
    return (
      <button onClick={() => onSelect(visit.id)} className={`${rowClass} ${indent ? "pl-6" : ""}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              visit.type === "CITY" ? "bg-sky-600" : "bg-emerald-600"
            }`}
          />
          <span className="truncate font-medium text-slate-700">{visit.name}</span>
        </span>
        <span className="shrink-0 text-xs text-slate-400">
          {visit.photoCount > 0 && `${visit.photoCount} 📷`}
        </span>
      </button>
    );
  }

  let body: React.ReactNode;

  if (draft) {
    body = (
      <div className="p-4">
        <h2 className="text-lg font-semibold">Add visit</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Pinned at {draft.lat.toFixed(4)}, {draft.lng.toFixed(4)}
        </p>
        <div className="mt-4">
          <VisitForm
            mode="create"
            typeEditable
            initial={{ name: "", type: draft.suggestedType, notes: "", visitedAt: "" }}
            onSubmit={(values) => onCreate(draft, values)}
            onCancel={onClose}
          />
        </div>
      </div>
    );
  } else if (selected) {
    const parent = selected.parentId
      ? visits.find((v) => v.id === selected.parentId) ?? null
      : null;
    const childPlaces = placesByParent.get(selected.id) ?? [];
    const visitedLabel = formatDate(selected.visitedAt);

    body = (
      <div className="p-4">
        <button
          onClick={onClose}
          className="text-sm text-slate-500 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          ← All places
        </button>

        {editing ? (
          <div className="mt-4">
            <h2 className="text-lg font-semibold">Edit visit</h2>
            <div className="mt-4">
              <VisitForm
                mode="edit"
                typeEditable={false}
                initial={{
                  name: selected.name,
                  type: selected.type,
                  notes: selected.notes ?? "",
                  visitedAt: selected.visitedAt ? selected.visitedAt.slice(0, 10) : "",
                }}
                onSubmit={async (values) => {
                  const ok = await onUpdate(selected.id, values);
                  if (ok) setEditing(false);
                  return ok;
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-start justify-between gap-2">
              <h2 className="min-w-0 break-words text-lg font-semibold">{selected.name}</h2>
              <TypeBadge type={selected.type} />
            </div>

            {parent && (
              <p className="mt-1 text-sm text-slate-500">
                in{" "}
                <button
                  onClick={() => onSelect(parent.id)}
                  className="font-medium text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  {parent.name}
                </button>
              </p>
            )}

            <dl className="mt-3 space-y-1 text-sm">
              {visitedLabel && (
                <div className="flex gap-2">
                  <dt className="text-slate-400">Visited</dt>
                  <dd className="text-slate-600">{visitedLabel}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-slate-400">Coordinates</dt>
                <dd className="text-slate-600">
                  {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </dd>
              </div>
            </dl>

            {selected.notes && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{selected.notes}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                Edit
              </button>
              {confirmingDelete ? (
                <>
                  <button
                    onClick={() => onDelete(selected.id)}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  >
                    {selected.type === "CITY" && childPlaces.length > 0
                      ? `Delete + ${childPlaces.length} place${childPlaces.length === 1 ? "" : "s"}`
                      : "Confirm delete"}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Delete
                </button>
              )}
            </div>

            {selected.type === "CITY" && childPlaces.length > 0 && (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-700">
                  Places in {selected.name}
                </h3>
                <ul className="mt-1">
                  {childPlaces.map((p) => (
                    <li key={p.id}>
                      <VisitRow visit={p} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <PhotoSection visitId={selected.id} onCountChange={onPhotoCountChange} />
          </>
        )}
      </div>
    );
  } else {
    body = (
      <div className="flex min-h-0 flex-col p-4">
        <label htmlFor="search" className="sr-only">
          Search your visits
        </label>
        <input
          id="search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cities and places…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        />

        <div className="mt-3 min-h-0 flex-1">
          {loading ? (
            <p className="px-2 text-sm text-slate-400">Loading…</p>
          ) : searchResults ? (
            searchResults.length === 0 ? (
              <p className="px-2 text-sm text-slate-400">Nothing matches “{search.trim()}”.</p>
            ) : (
              <ul>
                {searchResults.map((v) => (
                  <li key={v.id} className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <VisitRow visit={v} />
                    </div>
                    <TypeBadge type={v.type} />
                  </li>
                ))}
              </ul>
            )
          ) : visits.length === 0 ? (
            <p className="px-2 text-sm text-slate-400">
              Your visited cities and places will appear here.
            </p>
          ) : (
            <>
              <ul>
                {cities.map((city) => {
                  const children = placesByParent.get(city.id) ?? [];
                  const isExpanded = expanded.has(city.id);
                  return (
                    <li key={city.id}>
                      <div className="flex items-center">
                        <button
                          onClick={() => toggleExpanded(city.id)}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${city.name}`}
                          disabled={children.length === 0}
                          className="rounded p-1 text-slate-400 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-30"
                        >
                          <span
                            aria-hidden
                            className={`block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          >
                            ▸
                          </span>
                        </button>
                        <div className="min-w-0 flex-1">
                          <VisitRow visit={city} />
                        </div>
                        {children.length > 0 && (
                          <span className="pr-2 text-xs text-slate-400">{children.length}</span>
                        )}
                      </div>
                      {isExpanded && (
                        <ul>
                          {children.map((p) => (
                            <li key={p.id}>
                              <VisitRow visit={p} indent />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(placesByParent.get("__orphan__") ?? []).length > 0 && (
                <section className="mt-3">
                  <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Other places
                  </h3>
                  <ul className="mt-1">
                    {(placesByParent.get("__orphan__") ?? []).map((p) => (
                      <li key={p.id}>
                        <VisitRow visit={p} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <aside
      aria-label="Your visits"
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[60dvh] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl md:inset-y-0 md:left-0 md:right-auto md:h-full md:max-h-none md:w-96 md:rounded-none md:border-r md:border-t-0"
    >
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">TripTrace</h1>
          <p className="truncate text-xs text-slate-400">{userEmail}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Log out
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}
