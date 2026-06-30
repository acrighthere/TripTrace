import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { toTripDto, tripInclude } from "@/lib/trips";
import { fieldErrors, tripUpdateSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.trip.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = tripUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  const trip = await prisma.trip.update({
    where: { id },
    data: { name: parsed.data.name },
    include: tripInclude,
  });

  return NextResponse.json({ trip: toTripDto(trip) });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.trip.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Visits detach via the tripId FK (ON DELETE SET NULL); they are never deleted.
  await prisma.trip.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
