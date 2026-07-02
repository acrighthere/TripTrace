"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import type { DraftPin, NearbyPlaceDto, TripDto, VisitDto, VisitStatus } from "@/types";
import VisitForm from "@/components/VisitForm";
import PhotoSection from "@/components/PhotoSection";
import StatsPanel from "@/components/StatsPanel";
import TripDetail from "@/components/TripDetail";
import NearbyPlaces from "@/components/NearbyPlaces";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useT, useLocale, formatDateRange } from "@/lib/i18n";
import type { VisitEditValues, VisitFormValues } from "@/components/MapApp";

interface SidePanelProps {
  userEmail: string;
  visits: VisitDto[];
  trips: TripDto[];
  nearby: NearbyPlaceDto[] | null;
  nearbyLoading: boolean;
  onQuickAddNearby: (place: NearbyPlaceDto) => Promise<VisitDto | null>;
  loading: boolean;
  selectedId: string | null;
  draft: DraftPin | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCreate: (pin: DraftPin, values: VisitFormValues) => Promise<VisitDto | null>;
  onUpdate: (id: string, values: VisitEditValues) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onSetStatus: (id: string, status: VisitStatus) => void;
  onSetTrip: (id: string, tripId: string | null) => void;
  onCreateTrip: (name: string) => Promise<string | null>;
  onRenameTrip: (id: string, name: string) => Promise<boolean>;
  onDeleteTrip: (id: string) => Promise<boolean>;
  onPhotoCountChange: (visitId: string, delta: number) => void;
}

function TypeBadge({ type }: { type: VisitDto["type"] }) {
  const t = useT();
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        type === "CITY" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {type === "CITY" ? t("common.city") : t("common.place")}
    </span>
  );
}

export default function SidePanel({
  userEmail,
  visits,
  trips,
  nearby,
  nearbyLoading,
  onQuickAddNearby,
  loading,
  selectedId,
  draft,
  onSelect,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onSetStatus,
  onSetTrip,
  onCreateTrip,
  onRenameTrip,
  onDeleteTrip,
  onPhotoCountChange,
}: SidePanelProps) {
  const t = useT();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [tripViewId, setTripViewId] = useState<string | null>(null);
  const [newTripName, setNewTripName] = useState("");

  const selected = selectedId ? visits.find((v) => v.id === selectedId) ?? null : null;
  const tripView = tripViewId ? trips.find((t) => t.id === tripViewId) ?? null : null;

  useEffect(() => {
    setEditing(false);
    setConfirmingDelete(false);
    if (selectedId) {
      setShowStats(false);
      setTripViewId(null);
    }
  }, [selectedId]);

  // Member visits per trip, for counts and the trip detail view.
  const visitsByTrip = useMemo(() => {
    const map = new Map<string, VisitDto[]>();
    for (const v of visits) {
      if (!v.tripId) continue;
      const list = map.get(v.tripId);
      if (list) list.push(v);
      else map.set(v.tripId, [v]);
    }
    return map;
  }, [visits]);

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
    const wishlist = visit.status === "WISHLIST";
    const color = visit.type === "CITY" ? "bg-sky-600" : "bg-emerald-600";
    const ring = visit.type === "CITY" ? "border-sky-600" : "border-emerald-600";
    return (
      <button onClick={() => onSelect(visit.id)} className={`${rowClass} ${indent ? "pl-6" : ""}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              wishlist ? `border-2 bg-transparent ${ring}` : color
            }`}
          />
          <span className={`truncate font-medium ${wishlist ? "text-slate-500" : "text-slate-700"}`}>
            {visit.name}
          </span>
        </span>
        <span className="shrink-0 text-xs text-slate-400">
          {visit.photoCount > 0 && `${visit.photoCount} 📷`}
        </span>
      </button>
    );
  }

  let body: React.ReactNode;

  if (tripView && !draft && !selected) {
    body = (
      <TripDetail
        trip={tripView}
        stops={visitsByTrip.get(tripView.id) ?? []}
        onBack={() => setTripViewId(null)}
        onSelectStop={onSelect}
        onRemoveStop={(id) => onSetTrip(id, null)}
        onRename={(name) => onRenameTrip(tripView.id, name)}
        onDelete={async () => {
          const ok = await onDeleteTrip(tripView.id);
          if (ok) setTripViewId(null);
          return ok;
        }}
      />
    );
  } else if (showStats && !draft && !selected) {
    body = <StatsPanel onBack={() => setShowStats(false)} />;
  } else if (draft) {
    body = (
      <div className="p-4">
        <h2 className="text-lg font-semibold">{t("sidepanel.addVisit")}</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          {draft.suggestedName
            ? t("sidepanel.fromMapLabel", { name: draft.suggestedName })
            : t("sidepanel.pinnedAt", {
                lat: draft.lat.toFixed(4),
                lng: draft.lng.toFixed(4),
              })}
        </p>
        <div className="mt-4">
          <VisitForm
            key={`${draft.lat}:${draft.lng}:${draft.suggestedName ?? ""}`}
            mode="create"
            typeEditable
            initial={{
              name: draft.suggestedName ?? "",
              type: draft.suggestedType,
              status: "VISITED",
              notes: "",
              visitedAt: "",
              visitedTo: "",
            }}
            onSubmit={async (values) => !!(await onCreate(draft, values))}
            onCancel={onClose}
          />
        </div>
        <NearbyPlaces
          places={nearby}
          loading={nearbyLoading}
          onAdd={onQuickAddNearby}
          onPhotoCountChange={onPhotoCountChange}
        />
      </div>
    );
  } else if (selected) {
    const parent = selected.parentId
      ? visits.find((v) => v.id === selected.parentId) ?? null
      : null;
    const childPlaces = placesByParent.get(selected.id) ?? [];
    const dateLabel = formatDateRange(selected.visitedAt, selected.visitedTo, locale);
    const wishlist = selected.status === "WISHLIST";

    body = (
      <div className="p-4">
        <button
          onClick={onClose}
          className="text-sm text-slate-500 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          {t("sidepanel.allPlaces")}
        </button>

        {editing ? (
          <div className="mt-4">
            <h2 className="text-lg font-semibold">{t("sidepanel.editVisit")}</h2>
            <div className="mt-4">
              <VisitForm
                mode="edit"
                typeEditable={false}
                initial={{
                  name: selected.name,
                  type: selected.type,
                  status: selected.status,
                  notes: selected.notes ?? "",
                  visitedAt: selected.visitedAt ? selected.visitedAt.slice(0, 10) : "",
                  visitedTo: selected.visitedTo ? selected.visitedTo.slice(0, 10) : "",
                }}
                onSubmit={async (values) => {
                  const ok = await onUpdate(selected.id, {
                    name: values.name,
                    notes: values.notes,
                    visitedAt: values.visitedAt,
                    visitedTo: values.visitedTo,
                  });
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
              <div className="flex shrink-0 flex-col items-end gap-1">
                <TypeBadge type={selected.type} />
                {wishlist && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {t("sidepanel.wishlist")}
                  </span>
                )}
              </div>
            </div>

            {parent && (
              <p className="mt-1 text-sm text-slate-500">
                {t("sidepanel.in")}{" "}
                <button
                  onClick={() => onSelect(parent.id)}
                  className="font-medium text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  {parent.name}
                </button>
              </p>
            )}

            <dl className="mt-3 space-y-1 text-sm">
              {dateLabel && (
                <div className="flex gap-2">
                  <dt className="text-slate-400">
                    {wishlist ? t("sidepanel.planned") : t("sidepanel.visited")}
                  </dt>
                  <dd className="text-slate-600">{dateLabel}</dd>
                </div>
              )}
              {selected.country && (
                <div className="flex gap-2">
                  <dt className="text-slate-400">{t("sidepanel.country")}</dt>
                  <dd className="text-slate-600">{selected.country}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-slate-400">{t("sidepanel.coordinates")}</dt>
                <dd className="text-slate-600">
                  {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </dd>
              </div>
            </dl>

            {selected.notes && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{selected.notes}</p>
            )}

            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="trip-select" className="text-sm text-slate-400">
                {t("sidepanel.trip")}
              </label>
              <select
                id="trip-select"
                value={selected.tripId ?? ""}
                onChange={(e) => onSetTrip(selected.id, e.target.value || null)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <option value="">{t("sidepanel.none")}</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => onSetStatus(selected.id, wishlist ? "VISITED" : "WISHLIST")}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {wishlist ? t("sidepanel.markVisited") : t("sidepanel.moveToWishlist")}
            </button>

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {t("common.edit")}
              </button>
              {confirmingDelete ? (
                <>
                  <button
                    onClick={() => onDelete(selected.id)}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  >
                    {selected.type === "CITY" && childPlaces.length > 0
                      ? t("sidepanel.deleteWithPlaces", { count: childPlaces.length })
                      : t("sidepanel.confirmDelete")}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  {t("common.delete")}
                </button>
              )}
            </div>

            {selected.type === "CITY" && childPlaces.length > 0 && (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-700">
                  {t("sidepanel.placesIn", { name: selected.name })}
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
        <button
          onClick={() => setShowStats(true)}
          className="mb-3 flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden>📊</span> {t("sidepanel.travelStats")}
          </span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
        </button>

        <section className="mb-3">
          <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("sidepanel.trips")}
          </h2>
          {trips.length > 0 && (
            <ul className="space-y-0.5">
              {trips.map((trip) => {
                const count = visitsByTrip.get(trip.id)?.length ?? 0;
                return (
                  <li key={trip.id}>
                    <button
                      onClick={() => {
                        setShowStats(false);
                        setTripViewId(trip.id);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: trip.color }}
                        />
                        <span className="truncate font-medium text-slate-700">{trip.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {t("sidepanel.stops", { count })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = newTripName.trim();
              if (!name) return;
              setNewTripName("");
              const id = await onCreateTrip(name);
              if (id) setTripViewId(id);
            }}
            className="mt-1 flex gap-2"
          >
            <input
              value={newTripName}
              onChange={(e) => setNewTripName(e.target.value)}
              maxLength={80}
              placeholder={t("sidepanel.newTripPlaceholder")}
              aria-label={t("sidepanel.newTripName")}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            <button
              type="submit"
              disabled={!newTripName.trim()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40"
            >
              {t("sidepanel.add")}
            </button>
          </form>
        </section>

        <label htmlFor="search" className="sr-only">
          {t("sidepanel.searchVisits")}
        </label>
        <input
          id="search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("sidepanel.searchPlaceholder")}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        />

        <div className="mt-3 min-h-0 flex-1">
          {loading ? (
            <p className="px-2 text-sm text-slate-400">{t("common.loading")}</p>
          ) : searchResults ? (
            searchResults.length === 0 ? (
              <p className="px-2 text-sm text-slate-400">
                {t("sidepanel.nothingMatches", { query: search.trim() })}
              </p>
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
              {t("sidepanel.emptyState")}
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
                          aria-label={
                            isExpanded
                              ? t("sidepanel.collapse", { name: city.name })
                              : t("sidepanel.expand", { name: city.name })
                          }
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
                    {t("sidepanel.otherPlaces")}
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
      aria-label={t("sidepanel.yourVisits")}
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[60dvh] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl md:inset-y-0 md:left-0 md:right-auto md:h-full md:max-h-none md:w-96 md:rounded-none md:border-r md:border-t-0"
    >
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">TripTrace</h1>
          <p className="truncate text-xs text-slate-400">{userEmail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            {t("common.logOut")}
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}
