import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { lookupCity, type CityLookup } from "@/lib/boundaries";
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

  const { name, type, status, lat, lng, notes, visitedAt, visitedTo } = parsed.data;

  // Containment against stored city boundaries, radius fallback otherwise.
  const parentId =
    type === "PLACE" ? await findParentCityId(userId, lat, lng) : null;

  // A city resolves its country (and boundary) from one Nominatim lookup; a
  // place inherits its country from the parent city — no extra lookup, and
  // never sends place coordinates to the geocoder.
  let lookup: CityLookup | null = null;
  let country: string | null = null;
  let countryCode: string | null = null;
  let continent: string | null = null;
  if (type === "CITY") {
    lookup = await lookupCity(lat, lng);
    ({ country, countryCode, continent } = lookup);
  } else if (parentId) {
    const parent = await prisma.visit.findUnique({
      where: { id: parentId },
      select: { country: true, countryCode: true, continent: true },
    });
    country = parent?.country ?? null;
    countryCode = parent?.countryCode ?? null;
    continent = parent?.continent ?? null;
  }

  let visit = await prisma.visit.create({
    data: {
      userId,
      type,
      status: status ?? "VISITED",
      name,
      lat,
      lng,
      parentId,
      notes: notes ?? null,
      visitedAt: visitedAt ?? null,
      visitedTo: visitedTo ?? null,
      country,
      countryCode,
      continent,
    },
    include: visitInclude,
  });

  // A new city stores its boundary (best-effort) and takes in the places that
  // belong to it.
  let adoptedPlaces = 0;
  if (type === "CITY") {
    const stored = lookup?.boundary
      ? await setCityBoundary(userId, visit.id, lookup.boundary.geojson, lookup.boundary.maxAreaKm2)
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
