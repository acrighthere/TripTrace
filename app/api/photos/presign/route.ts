import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { presignUpload } from "@/lib/storage";
import { fieldErrors, photoPresignSchema, PHOTO_EXTENSIONS } from "@/lib/validation";

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

  // MIME type and size limits are enforced here (and re-checked after upload),
  // not just client-side.
  const parsed = photoPresignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }
  const { visitId, contentType, size } = parsed.data;

  const visit = await prisma.visit.findFirst({
    where: { id: visitId, userId },
    select: { id: true },
  });
  if (!visit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Key is namespaced per user and visit; the confirm endpoint rejects keys
  // outside the caller's own namespace.
  const key = `${userId}/${visitId}/${randomUUID()}.${PHOTO_EXTENSIONS[contentType]}`;
  const url = await presignUpload(key, contentType, size);

  return NextResponse.json({
    url,
    key,
    headers: { "Content-Type": contentType },
  });
}
