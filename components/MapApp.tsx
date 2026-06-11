"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftPin, VisitDto } from "@/types";
import MapView, { type FlyToTarget } from "@/components/MapView";
import SidePanel from "@/components/SidePanel";
import { ToastProvider, useToast } from "@/components/Toast";

export interface VisitFormValues {
  name: string;
  type: "CITY" | "PLACE";
  /** "" means not set */
  notes: string;
  /** yyyy-mm-dd or "" */
  visitedAt: string;
}

interface MapAppProps {
  styleUrl: string;
  userEmail: string;
}

function MapAppInner({ styleUrl, userEmail }: MapAppProps) {
  const toast = useToast();

  const [visits, setVisits] = useState<VisitDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPin | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const flySeq = useRef(0);
  const tempSeq = useRef(0);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/visits");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { visits: VisitDto[] };
      setVisits(data.visits);
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

  const handleMapClick = useCallback((pin: DraftPin) => {
    setSelectedId(null);
    setDraft(pin);
  }, []);

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
        name: values.name,
        lat: pin.lat,
        lng: pin.lng,
        parentId: null,
        notes: values.notes || null,
        visitedAt: values.visitedAt ? new Date(values.visitedAt).toISOString() : null,
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
            lat: pin.lat,
            lng: pin.lng,
            notes: values.notes || null,
            visitedAt: values.visitedAt || null,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { visit: VisitDto };
        setVisits((v) => (v ?? []).map((x) => (x.id === tempId ? data.visit : x)));
        setSelectedId(data.visit.id);
        toast("Saved");
        return true;
      } catch {
        setVisits((v) => (v ?? []).filter((x) => x.id !== tempId));
        setDraft(pin);
        toast("Couldn't save. Try again.", "error");
        return false;
      }
    },
    [toast]
  );

  const updateVisit = useCallback(
    async (id: string, values: Omit<VisitFormValues, "type">): Promise<boolean> => {
      const snapshot = visits;
      setVisits((v) =>
        (v ?? []).map((x) =>
          x.id === id
            ? {
                ...x,
                name: values.name,
                notes: values.notes || null,
                visitedAt: values.visitedAt
                  ? new Date(values.visitedAt).toISOString()
                  : null,
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

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView
        styleUrl={styleUrl}
        visits={visits ?? []}
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
        loading={visits === null && !loadError}
        selectedId={selectedId}
        draft={draft}
        onSelect={(id) => selectVisit(id, { fly: true })}
        onClose={closePanels}
        onCreate={createVisit}
        onUpdate={updateVisit}
        onDelete={deleteVisit}
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
