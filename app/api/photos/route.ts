import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { deleteObject, headObject, presignDownload } from "@/lib/storage";
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  fieldErrors,
  photoCreateSchema,
} from "@/lib/validation";
import type { PhotoDto } from "@/types";

async function toPhotoDto(p: {
  id: string;
  visitId: string;
  storageKey: string;
  caption: string | null;
  createdAt: Date;
}): Promise<PhotoDto> {
  return {
    id: p.id,
    visitId: p.visitId,
    caption: p.caption,
    createdAt: p.createdAt.toISOString(),
    url: await presignDownload(p.storageKey),
  };
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const visitId = req.nextUrl.searchParams.get("visitId");
  if (!visitId) {
    return NextResponse.json({ error: "visitId query parameter is required" }, { status: 400 });
  }

  const visit = await prisma.visit.findFirst({
    where: { id: visitId, userId },
    select: { id: true },
  });
  if (!visit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const photos = await prisma.photo.findMany({
    where: { visitId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ photos: await Promise.all(photos.map(toPhotoDto)) });
}

/** Called after the browser finishes the presigned PUT; records the photo. */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = photoCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }
  const { visitId, storageKey, caption } = parsed.data;

  const visit = await prisma.visit.findFirst({
    where: { id: visitId, userId },
    select: { id: true },
  });
  if (!visit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The key must sit inside the caller's own namespace — prevents registering
  // someone else's object under your visit.
  if (!storageKey.startsWith(`${userId}/${visitId}/`)) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  // Trust nothing about the upload: confirm it exists and re-check size and
  // type against what actually landed in storage.
  const head = await headObject(storageKey);
  if (!head) {
    return NextResponse.json({ error: "Upload not found in storage" }, { status: 400 });
  }
  const tooBig = (head.ContentLength ?? 0) > MAX_PHOTO_BYTES;
  const badType = !ALLOWED_PHOTO_TYPES.includes(
    (head.ContentType ?? "") as (typeof ALLOWED_PHOTO_TYPES)[number]
  );
  if (tooBig || badType) {
    await deleteObject(storageKey);
    return NextResponse.json(
      { error: tooBig ? "Photo exceeds the 8 MB limit" : "Unsupported image type" },
      { status: 400 }
    );
  }

  const photo = await prisma.photo.create({
    data: { visitId, storageKey, caption: caption ?? null },
  });

  return NextResponse.json({ photo: await toPhotoDto(photo) }, { status: 201 });
}
