import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { deleteObject } from "@/lib/storage";
import { toVisitDto, visitInclude } from "@/lib/visits";
import { fieldErrors, visitUpdateSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  // Ownership check: the row must belong to the session user. 404 either way
  // so existence of other users' visits is never revealed.
  const existing = await prisma.visit.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = visitUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  const data: Prisma.VisitUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.visitedAt !== undefined) data.visitedAt = parsed.data.visitedAt;

  const visit = await prisma.visit.update({
    where: { id },
    data,
    include: visitInclude,
  });

  return NextResponse.json({ visit: toVisitDto(visit) });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.visit.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Deleting a city also deletes its places (Prisma can't cascade
  // self-relations) and every photo involved, including the stored objects.
  const children = await prisma.visit.findMany({
    where: { parentId: id, userId },
    select: { id: true },
  });
  const ids = [id, ...children.map((c) => c.id)];

  const photos = await prisma.photo.findMany({
    where: { visitId: { in: ids } },
    select: { storageKey: true },
  });

  // One statement so the parent/child FK (NO ACTION, end-of-statement check)
  // is satisfied; Photo rows cascade at the DB level.
  await prisma.visit.deleteMany({ where: { id: { in: ids }, userId } });

  // Best-effort object cleanup after the DB commit; an orphaned object is
  // recoverable, a dangling DB row pointing at nothing is not.
  await Promise.allSettled(photos.map((p) => deleteObject(p.storageKey)));

  return NextResponse.json({ deletedIds: ids });
}
