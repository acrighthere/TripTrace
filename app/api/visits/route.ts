import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { fetchCityBoundary } from "@/lib/boundaries";
import {
  adoptOrphanPlaces,
  findParentCityId,
  reparentCoveredPlaces,
  setCityBoundary,
} from "@/lib/geo";
import { toVisitDto, visitInclude } from "@/lib/visits";
import { fieldErrors, visitCreateSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const visits = await prisma.visit.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: visitInclude,
  });

  return NextResponse.json({ visits: visits.map(toVisitDto) });
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Also paces outbound Nominatim lookups (their policy: ≤1 req/s per app).
  if (!rateLimit(`visits:${userId}`, { capacity: 20, refillPerSecond: 0.5 })) {
    return NextResponse.json(
      { error: "Too many pins at once. Try again in a moment." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = visitCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", fields: fieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  const { name, type, lat, lng, notes, visitedAt } = parsed.data;

  // Containment against stored city boundaries, radius fallback otherwise.
  const parentId =
    type === "PLACE" ? await findParentCityId(userId, lat, lng) : null;

  let visit = await prisma.visit.create({
    data: {
      userId,
      type,
      name,
      lat,
      lng,
      parentId,
      notes: notes ?? null,
      visitedAt: visitedAt ?? null,
    },
    include: visitInclude,
  });

  // New cities fetch their admin boundary (best-effort; the optimistic UI
  // hides this latency) and take in the places that belong to them.
  let adoptedPlaces = 0;
  if (type === "CITY") {
    const boundary = await fetchCityBoundary(lat, lng);
    const stored = boundary
      ? await setCityBoundary(userId, visit.id, boundary.geojson, boundary.maxAreaKm2)
      : false;

    adoptedPlaces = stored
      ? await reparentCoveredPlaces(userId, visit.id)
      : await adoptOrphanPlaces(userId, visit.id, lat, lng);

    if (adoptedPlaces > 0) {
      visit =
        (await prisma.visit.findUnique({
          where: { id: visit.id },
          include: visitInclude,
        })) ?? visit;
    }
  }

  return NextResponse.json(
    { visit: toVisitDto(visit), adoptedPlaces },
    { status: 201 }
  );
}
