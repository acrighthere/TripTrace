"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftPin, TripDto, VisitDto, VisitStatus, VisitType } from "@/types";
import MapView, { type FlyToTarget } from "@/components/MapView";
import SidePanel from "@/components/SidePanel";
import { ToastProvider, useToast } from "@/components/Toast";

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

  const [visits, setVisits] = useState<VisitDto[] | null>(null);
  const [trips, setTrips] = useState<TripDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError("Couldn't load your visits.");
    }
  }, []);

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
          toast("Already pinned");
          return;
        }
      }
      setSelectedId(null);
      setDraft(pin);
    },
    [visits, toast]
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
          toast(`Saved — ${adopted} place${adopted === 1 ? "" : "s"} attached`);
          void load();
        } else {
          toast("Saved");
        }
        return true;
      } catch {
        setVisits((v) => (v ?? []).filter((x) => x.id !== tempId));
        setDraft(pin);
        toast("Couldn't save. Try again.", "error");
        return false;
      }
    },
    [toast, load]
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
        toast("Saved");
        return true;
      } catch {
        if (snapshot) setVisits(snapshot);
        toast("Couldn't save. Try again.", "error");
        return false;
      }
    },
    [visits, toast]
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
        toast("Couldn't save. Try again.", "error");
      }
    },
    [visits, toast]
  );

  const setVisitStatus = useCallback(
    (id: string, status: VisitStatus) =>
      patchVisit(id, { status }, status === "VISITED" ? "Marked visited" : "Moved to wishlist"),
    [patchVisit]
  );

  const setVisitTrip = useCallback(
    (id: string, tripId: string | null) => patchVisit(id, { tripId }, tripId ? "Added to trip" : "Removed from trip"),
    [patchVisit]
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
        toast("Deleted");
        return true;
      } catch {
        if (snapshot) setVisits(snapshot);
        setSelectedId(id);
        toast("Couldn't delete. Try again.", "error");
        return false;
      }
    },
    [visits, toast]
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
        setTrips((t) => [data.trip, ...t]);
        toast("Trip created");
        return data.trip.id;
      } catch {
        toast("Couldn't create trip.", "error");
        return null;
      }
    },
    [toast]
  );

  const renameTrip = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const snapshot = trips;
      setTrips((t) => t.map((x) => (x.id === id ? { ...x, name } : x)));
      try {
        const res = await fetch(`/api/trips/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast("Saved");
        return true;
      } catch {
        setTrips(snapshot);
        toast("Couldn't rename trip.", "error");
        return false;
      }
    },
    [trips, toast]
  );

  const deleteTrip = useCallback(
    async (id: string): Promise<boolean> => {
      const tripsSnap = trips;
      const visitsSnap = visits;
      setTrips((t) => t.filter((x) => x.id !== id));
      setVisits((v) => (v ?? []).map((x) => (x.tripId === id ? { ...x, tripId: null } : x)));
      try {
        const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast("Trip deleted");
        return true;
      } catch {
        setTrips(tripsSnap);
        if (visitsSnap) setVisits(visitsSnap);
        toast("Couldn't delete trip.", "error");
        return false;
      }
    },
    [trips, visits, toast]
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView
        styleUrl={styleUrl}
        visits={visits ?? []}
        trips={trips}
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
