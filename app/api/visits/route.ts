import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { adoptOrphanPlaces, findNearestCityId } from "@/lib/geo";
import { toVisitDto, visitInclude } from "@/lib/visits";
import { fieldErrors, visitCreateSchema } from "@/lib/validation";

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

  // A place is attached to the user's nearest city within 50 km, if any.
  const parentId =
    type === "PLACE" ? await findNearestCityId(userId, lat, lng) : null;

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

  // A city created after its places (pin-by-label flow) adopts the user's
  // orphan places nearby; re-read so placeCount reflects the adoption.
  if (type === "CITY") {
    const adopted = await adoptOrphanPlaces(userId, visit.id, lat, lng);
    if (adopted > 0) {
      visit =
        (await prisma.visit.findUnique({
          where: { id: visit.id },
          include: visitInclude,
        })) ?? visit;
    }
  }

  return NextResponse.json({ visit: toVisitDto(visit) }, { status: 201 });
}
