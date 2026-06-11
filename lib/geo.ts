import { prisma } from "@/lib/db";

/** A place belongs to the nearest of the user's cities within this radius. */
const PARENT_RADIUS_METERS = 50_000;

/**
 * Nearest-neighbor lookup on the GIST-indexed geography column, scoped to the
 * user's own cities. Returns null when no city is within the radius.
 */
export async function findNearestCityId(
  userId: string,
  lat: number,
  lng: number
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Visit"
    WHERE "userId" = ${userId}
      AND "type" = 'CITY'::"VisitType"
      AND "geom" IS NOT NULL
      AND ST_DWithin(
            "geom",
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${PARENT_RADIUS_METERS}
          )
    ORDER BY "geom" <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

/**
 * When a city is created after its places (e.g. pinned from a map label),
 * attach the user's orphan places within the radius to it. Returns the
 * number of adopted places.
 */
export async function adoptOrphanPlaces(
  userId: string,
  cityId: string,
  lat: number,
  lng: number
): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "Visit"
    SET "parentId" = ${cityId}
    WHERE "userId" = ${userId}
      AND "type" = 'PLACE'::"VisitType"
      AND "parentId" IS NULL
      AND "geom" IS NOT NULL
      AND ST_DWithin(
            "geom",
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${PARENT_RADIUS_METERS}
          )
  `;
}
