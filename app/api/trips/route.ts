import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { nextTripColor, toTripDto, tripInclude } from "@/lib/trips";
import { fieldErrors, tripCreateSchema } from "@/lib/validation";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const trips = await prisma.trip.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: tripInclude,
  });

  return NextResponse.json({ trips: trips.map(toTripDto) });
}

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

  const parsed = tripCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  const count = await prisma.trip.count({ where: { userId } });
  const trip = await prisma.trip.create({
    data: { userId, name: parsed.data.name, color: nextTripColor(count) },
    include: tripInclude,
  });

  return NextResponse.json({ trip: toTripDto(trip) }, { status: 201 });
}
