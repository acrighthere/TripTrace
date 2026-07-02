"use client";

import { useRef, useState } from "react";
import type { NearbyPlaceDto, VisitDto } from "@/types";
import { useLocale, useT, formatNumber } from "@/lib/i18n";
import { isUploadablePhoto, uploadVisitPhoto } from "@/lib/upload-photo";
import { useToast } from "@/components/Toast";

interface NearbyPlacesProps {
  /** null while the lookup is still in flight */
  places: NearbyPlaceDto[] | null;
  loading: boolean;
  onAdd: (place: NearbyPlaceDto) => Promise<VisitDto | null>;
  onPhotoCountChange: (visitId: string, delta: number) => void;
}

export default function NearbyPlaces({ places, loading, onAdd, onPhotoCountChange }: NearbyPlacesProps) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  // Wikipedia article title of the card whose action is in flight.
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPhotoPlace = useRef<NearbyPlaceDto | null>(null);

  function formatDistance(m: number): string {
    return m < 1000
      ? t("nearby.distanceM", { m: formatNumber(m, locale) })
      : t("nearby.distanceKm", { km: formatNumber(Math.round(m / 100) / 10, locale) });
  }

  async function markVisited(place: NearbyPlaceDto) {
    if (busy) return;
    setBusy(place.title);
    // On success the optimistic visits update removes the card from the list.
    await onAdd(place);
    setBusy(null);
  }

  function pickPhoto(place: NearbyPlaceDto) {
    if (busy) return;
    pendingPhotoPlace.current = place;
    fileInputRef.current?.click();
  }

  async function handlePhotoChosen(file: File | null) {
    const place = pendingPhotoPlace.current;
    pendingPhotoPlace.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!place || !file) return; // cancelled the picker -> nothing happens
    if (!isUploadablePhoto(file)) {
      toast(t("photos.invalidType"), "error");
      return;
    }

    setBusy(place.title);
    // Adding a photo implies the place was visited: create the visit first,
    // then attach the photo to it.
    const visit = await onAdd(place);
    if (visit) {
      const ok = await uploadVisitPhoto(visit.id, file);
      if (ok) {
        onPhotoCountChange(visit.id, 1);
        toast(t("photos.uploaded"));
      } else {
        toast(t("nearby.photoFailed"), "error");
      }
    }
    setBusy(null);
  }

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700">{t("nearby.heading")}</h3>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handlePhotoChosen(e.target.files?.[0] ?? null)}
      />

      {loading || places === null ? (
        <p className="mt-2 text-sm text-slate-400">{t("nearby.loading")}</p>
      ) : places.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{t("nearby.empty")}</p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {places.map((place) => {
              const isBusy = busy === place.title;
              return (
                <li
                  key={place.title}
                  className="overflow-hidden rounded-xl border border-slate-200"
                >
                  <div className="flex gap-3 p-2">
                    {place.thumbUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={place.thumbUrl}
                        alt={place.title}
                        loading="lazy"
                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xl"
                      >
                        📍
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words text-sm font-medium text-slate-700">
                          {place.title}
                        </p>
                        <a
                          href={place.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t("nearby.openArticle")}
                          className="shrink-0 text-xs text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500"
                        >
                          W↗
                        </a>
                      </div>
                      {place.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                          {place.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDistance(place.distanceM)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 border-t border-slate-100 p-1.5">
                    <button
                      onClick={() => markVisited(place)}
                      disabled={isBusy}
                      className="flex-1 rounded-lg bg-sky-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 disabled:opacity-60"
                    >
                      {isBusy ? t("common.saving") : t("nearby.markVisited")}
                    </button>
                    <button
                      onClick={() => pickPhoto(place)}
                      disabled={isBusy}
                      className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-60"
                    >
                      {isBusy ? t("nearby.uploadingPhoto") : t("nearby.addPhoto")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-center text-xs text-slate-400">{t("nearby.attribution")}</p>
        </>
      )}
    </section>
  );
}
