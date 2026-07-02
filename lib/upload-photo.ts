// Client-side photo upload pipeline (presign -> direct PUT to storage ->
// confirm). Extracted so both PhotoSection and quick-add flows can use it.
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/validation";

export function isUploadablePhoto(file: File): boolean {
  return (
    (ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type) &&
    file.size <= MAX_PHOTO_BYTES
  );
}

/** Returns true when the photo is fully uploaded and recorded. */
export async function uploadVisitPhoto(
  visitId: string,
  file: File,
  caption?: string | null
): Promise<boolean> {
  if (!isUploadablePhoto(file)) return false;
  try {
    const presignRes = await fetch("/api/photos/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId, contentType: file.type, size: file.size }),
    });
    if (!presignRes.ok) return false;
    const { url, key, headers } = (await presignRes.json()) as {
      url: string;
      key: string;
      headers: Record<string, string>;
    };

    const putRes = await fetch(url, { method: "PUT", headers, body: file });
    if (!putRes.ok) return false;

    const confirmRes = await fetch("/api/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId, storageKey: key, caption: caption ?? null }),
    });
    return confirmRes.ok;
  } catch {
    return false;
  }
}
