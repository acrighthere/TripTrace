"use client";

import { useEffect, useRef, useState } from "react";
import type { PhotoDto } from "@/types";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/validation";
import { useToast } from "@/components/Toast";

interface PhotoSectionProps {
  visitId: string;
  onCountChange: (visitId: string, delta: number) => void;
}

export default function PhotoSection({ visitId, onCountChange }: PhotoSectionProps) {
  const toast = useToast();
  const [photos, setPhotos] = useState<PhotoDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Temp visits (optimistic creates) have no server id yet.
  const ready = !visitId.startsWith("temp-");

  useEffect(() => {
    setPhotos(null);
    setLoadError(null);
    setFile(null);
    setCaption("");
    setUploadError(null);
    if (!ready) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/photos?visitId=${encodeURIComponent(visitId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { photos: PhotoDto[] };
        if (!cancelled) setPhotos(data.photos);
      } catch {
        if (!cancelled) setLoadError("Couldn't load photos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visitId, ready]);

  function pickFile(f: File | null) {
    setUploadError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(f.type)) {
      setUploadError("Use a JPEG, PNG, or WebP image.");
      setFile(null);
      return;
    }
    if (f.size > MAX_PHOTO_BYTES) {
      setUploadError("Photos can be at most 8 MB.");
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      // 1. Ask the server for a presigned PUT URL.
      const presignRes = await fetch("/api/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, contentType: file.type, size: file.size }),
      });
      if (!presignRes.ok) throw new Error("presign failed");
      const { url, key, headers } = (await presignRes.json()) as {
        url: string;
        key: string;
        headers: Record<string, string>;
      };

      // 2. Upload directly to object storage.
      const putRes = await fetch(url, { method: "PUT", headers, body: file });
      if (!putRes.ok) throw new Error("upload failed");

      // 3. Confirm so the server records the photo.
      const confirmRes = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, storageKey: key, caption: caption.trim() || null }),
      });
      if (!confirmRes.ok) throw new Error("confirm failed");
      const data = (await confirmRes.json()) as { photo: PhotoDto };

      setPhotos((p) => [...(p ?? []), data.photo]);
      setFile(null);
      setCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onCountChange(visitId, 1);
      toast("Photo uploaded");
    } catch {
      setUploadError("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(id: string) {
    const snapshot = photos;
    setPhotos((p) => (p ?? []).filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCountChange(visitId, -1);
      toast("Deleted");
    } catch {
      setPhotos(snapshot);
      toast("Couldn't delete. Try again.", "error");
    }
  }

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700">Photos</h3>

      {!ready ? (
        <p className="mt-2 text-sm text-slate-400">Photos can be added once the visit is saved.</p>
      ) : loadError ? (
        <p className="mt-2 text-sm text-red-700">{loadError}</p>
      ) : photos === null ? (
        <p className="mt-2 text-sm text-slate-400">Loading photos…</p>
      ) : (
        <>
          {photos.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No photos yet.</p>
          ) : (
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {photos.map((photo) => (
                <li key={photo.id} className="group relative">
                  <a href={photo.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.caption ?? "Travel photo"}
                      className="h-28 w-full rounded-lg object-cover"
                      loading="lazy"
                    />
                  </a>
                  {photo.caption && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{photo.caption}</p>
                  )}
                  <button
                    onClick={() => removePhoto(photo.id)}
                    aria-label="Delete photo"
                    className="absolute right-1 top-1 rounded-md bg-black/55 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            {file && (
              <>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={300}
                  placeholder="Caption (optional)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                />
                <button
                  onClick={upload}
                  disabled={uploading}
                  className="w-full rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : "Upload photo"}
                </button>
              </>
            )}
            {uploadError && (
              <p role="alert" className="text-sm text-red-700">
                {uploadError}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
