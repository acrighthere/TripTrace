import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { deleteObject } from "@/lib/storage";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const photo = await prisma.photo.findFirst({
    where: { id, visit: { userId } },
    select: { id: true, storageKey: true },
  });
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.photo.delete({ where: { id: photo.id } });
  await deleteObject(photo.storageKey);

  return NextResponse.json({ ok: true });
}
