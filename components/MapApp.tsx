"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftPin, TripDto, VisitDto, VisitStatus, VisitType } from "@/types";
import MapView, { type FlyToTarget } from "@/components/MapView";
import SidePanel from "@/components/SidePanel";
import { ToastProvider, useToast } from "@/components/Toast";
import { useT } from "@/lib/i18n";

export interface VisitFormValues {
  name: string;
  type: VisitType;
  status: VisitStatus;
  /** "" means not set */
  notes: string;
  /** yyyy-mm-dd or "" */
  visitedAt: string;
  /** yyyy-mm-dd or "" */
  visitedTo: string;
}

export type VisitEditValues = Pick<VisitFormValues, "name" | "notes" | "visitedAt" | "visitedTo">;

interface MapAppProps {
  styleUrl: string;
  userEmail: string;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function MapAppInner({ styleUrl, userEmail }: MapAppProps) {
  const toast = useToast();
  const t = useT();

  const [visits, setVisits] = useState<VisitDto[] | null>(null);
  const [trips, setTrips] = useState<TripDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ISO codes of countries with at least one VISITED pin — drives the
  // country fill on the map (full coverage: every city carries a country).
  const visitedCountries = useMemo(() => {
    const codes = new Set<string>();
    for (const v of visits ?? []) {
      if (v.status === "VISITED" && v.countryCode) codes.add(v.countryCode.toLowerCase());
    }
    return [...codes];
  }, [visits]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPin | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const flySeq = useRef(0);
  const tempSeq = useRef(0);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [vRes, tRes] = await Promise.all([fetch("/api/visits"), fetch("/api/trips")]);
      if (!vRes.ok) throw new Error(`HTTP ${vRes.status}`);
      const vData = (await vRes.json()) as { visits: VisitDto[] };
      setVisits(vData.visits);
      if (tRes.ok) {
        const tData = (await tRes.json()) as { trips: TripDto[] };
        setTrips(tData.trips);
      }
    } catch {
      setLoadError(t("map.loadError"));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const requestFly = useCallback((lng: number, lat: number, zoom: number) => {
    setFlyTo({ lng, lat, zoom, seq: ++flySeq.current });
  }, []);

  const selectVisit = useCallback(
    (id: string, opts?: { fly?: boolean }) => {
      setDraft(null);
      setSelectedId(id);
      if (opts?.fly) {
        const v = (visits ?? []).find((x) => x.id === id);
        if (v) requestFly(v.lng, v.lat, v.type === "CITY" ? 9.5 : 13.5);
      }
    },
    [visits, requestFly]
  );

  const handleMapClick = useCallback(
    (pin: DraftPin) => {
      // Clicking a basemap label that's already pinned selects the existing
      // visit instead of drafting a duplicate.
      if (pin.suggestedName) {
        const norm = pin.suggestedName.trim().toLowerCase();
        const existing = (visits ?? []).find(
          (v) =>
            v.type === pin.suggestedType &&
            v.name.trim().toLowerCase() === norm &&
            distanceKm(v.lat, v.lng, pin.lat, pin.lng) < 30
        );
        if (existing) {
          setDraft(null);
          setSelectedId(existing.id);
          toast(t("map.alreadyPinned"));
          return;
        }
      }
      setSelectedId(null);
      setDraft(pin);
    },
    [visits, toast, t]
  );

  const closePanels = useCallback(() => {
    setSelectedId(null);
    setDraft(null);
  }, []);

  const createVisit = useCallback(
    async (pin: DraftPin, values: VisitFormValues): Promise<boolean> => {
      const tempId = `temp-${++tempSeq.current}`;
      const optimistic: VisitDto = {
        id: tempId,
        type: values.type,
        status: values.status,
        name: values.name,
        lat: pin.lat,
        lng: pin.lng,
        parentId: null,
        tripId: null,
        notes: values.notes || null,
        country: null,
        countryCode: null,
        continent: null,
        visitedAt: values.visitedAt ? new Date(values.visitedAt).toISOString() : null,
        visitedTo: values.visitedTo ? new Date(values.visitedTo).toISOString() : null,
        createdAt: new Date().toISOString(),
        photoCount: 0,
        placeCount: 0,
      };
      setVisits((v) => [...(v ?? []), optimistic]);
      setDraft(null);

      try {
        const res = await fetch("/api/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            type: values.type,
            status: values.status,
            lat: pin.lat,
            lng: pin.lng,
            notes: values.notes || null,
            visitedAt: values.visitedAt || null,
            visitedTo: values.visitedTo || null,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { visit: VisitDto; adoptedPlaces?: number };
        setVisits((v) => (v ?? []).map((x) => (x.id === tempId ? data.visit : x)));
        setSelectedId(data.visit.id);
        // Attachment must never happen silently — say how many places moved,
        // and resync since other visits' parent links changed server-side.
        const adopted = data.adoptedPlaces ?? 0;
        if (adopted > 0) {
          toast(t("map.placesAttached", { count: adopted }));
          void load();
        } else {
          toast(t("common.saved"));
        }
        return true;
      } catch {
        setVisits((v) => (v ?? []).filter((x) => x.id !== tempId));
        setDraft(pin);
        toast(t("common.tryAgain"), "error");
        return false;
      }
    },
    [toast, load, t]
  );

  const updateVisit = useCallback(
    async (id: string, values: VisitEditValues): Promise<boolean> => {
      const snapshot = visits;
      setVisits((v) =>
        (v ?? []).map((x) =>
          x.id === id
            ? {
                ...x,
                name: values.name,
                notes: values.notes || null,
                visitedAt: values.visitedAt ? new Date(values.visitedAt).toISOString() : null,
                visitedTo: values.visitedTo ? new Date(values.visitedTo).toISOString() : null,
              }
            : x
        )
      );

      try {
        const res = await fetch(`/api/visits/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            notes: values.notes || null,
            visitedAt: values.visitedAt || null,
            visitedTo: values.visitedTo || null,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { visit: VisitDto };
        setVisits((v) => (v ?? []).map((x) => (x.id === id ? data.visit : x)));
        toast(t("common.saved"));
        return true;
      } catch {
        if (snapshot) setVisits(snapshot);
        toast(t("common.tryAgain"), "error");
        return false;
      }
    },
    [visits, toast, t]
  );

  /** Generic single-field PATCH on a visit (status, trip assignment). */
  const patchVisit = useCallback(
    async (id: string, patch: Partial<{ status: VisitStatus; tripId: string | null }>, label: string) => {
      const snapshot = visits;
      setVisits((v) => (v ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
      try {
        const res = await fetch(`/api/visits/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { visit: VisitDto };
        setVisits((v) => (v ?? []).map((x) => (x.id === id ? data.visit : x)));
        toast(label);
      } catch {
        if (snapshot) setVisits(snapshot);
        toast(t("common.tryAgain"), "error");
      }
    },
    [visits, toast, t]
  );

  const setVisitStatus = useCallback(
    (id: string, status: VisitStatus) =>
      patchVisit(id, { status }, status === "VISITED" ? t("map.markedVisited") : t("map.movedToWishlist")),
    [patchVisit, t]
  );

  const setVisitTrip = useCallback(
    (id: string, tripId: string | null) => patchVisit(id, { tripId }, tripId ? t("map.addedToTrip") : t("map.removedFromTrip")),
    [patchVisit, t]
  );

  const deleteVisit = useCallback(
    async (id: string): Promise<boolean> => {
      const snapshot = visits;
      // Deleting a city removes its places too — mirror the server cascade.
      const removed = new Set(
        [id, ...(visits ?? []).filter((v) => v.parentId === id).map((v) => v.id)]
      );
      setVisits((v) => (v ?? []).filter((x) => !removed.has(x.id)));
      setSelectedId(null);

      try {
        const res = await fetch(`/api/visits/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast(t("common.deleted"));
        return true;
      } catch {
        if (snapshot) setVisits(snapshot);
        setSelectedId(id);
        toast(t("map.couldntDelete"), "error");
        return false;
      }
    },
    [visits, toast, t]
  );

  const adjustPhotoCount = useCallback((id: string, delta: number) => {
    setVisits((v) =>
      (v ?? []).map((x) =>
        x.id === id ? { ...x, photoCount: Math.max(0, x.photoCount + delta) } : x
      )
    );
  }, []);

  const createTrip = useCallback(
    async (name: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { trip: TripDto };
        setTrips((prev) => [data.trip, ...prev]);
        toast(t("map.tripCreated"));
        return data.trip.id;
      } catch {
        toast(t("map.couldntCreateTrip"), "error");
        return null;
      }
    },
    [toast, t]
  );

  const renameTrip = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const snapshot = trips;
      setTrips((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)));
      try {
        const res = await fetch(`/api/trips/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast(t("common.saved"));
        return true;
      } catch {
        setTrips(snapshot);
        toast(t("map.couldntRenameTrip"), "error");
        return false;
      }
    },
    [trips, toast, t]
  );

  const deleteTrip = useCallback(
    async (id: string): Promise<boolean> => {
      const tripsSnap = trips;
      const visitsSnap = visits;
      setTrips((prev) => prev.filter((x) => x.id !== id));
      setVisits((v) => (v ?? []).map((x) => (x.tripId === id ? { ...x, tripId: null } : x)));
      try {
        const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast(t("map.tripDeleted"));
        return true;
      } catch {
        setTrips(tripsSnap);
        if (visitsSnap) setVisits(visitsSnap);
        toast(t("map.couldntDeleteTrip"), "error");
        return false;
      }
    },
    [trips, visits, toast, t]
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView
        styleUrl={styleUrl}
        visits={visits ?? []}
        trips={trips}
        visitedCountries={visitedCountries}
        loading={visits === null && !loadError}
        error={loadError}
        onRetry={load}
        selectedId={selectedId}
        draft={draft}
        flyTo={flyTo}
        onSelectVisit={(id) => selectVisit(id)}
        onMapClick={handleMapClick}
      />
      <SidePanel
        userEmail={userEmail}
        visits={visits ?? []}
        trips={trips}
        loading={visits === null && !loadError}
        selectedId={selectedId}
        draft={draft}
        onSelect={(id) => selectVisit(id, { fly: true })}
        onClose={closePanels}
        onCreate={createVisit}
        onUpdate={updateVisit}
        onDelete={deleteVisit}
        onSetStatus={setVisitStatus}
        onSetTrip={setVisitTrip}
        onCreateTrip={createTrip}
        onRenameTrip={renameTrip}
        onDeleteTrip={deleteTrip}
        onPhotoCountChange={adjustPhotoCount}
      />
    </div>
  );
}

export default function MapApp(props: MapAppProps) {
  return (
    <ToastProvider>
      <MapAppInner {...props} />
    </ToastProvider>
  );
}
