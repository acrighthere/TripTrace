import { prisma } from "@/lib/db";

/** Fallback radius when no stored boundary covers a point. */
const PARENT_RADIUS_METERS = 50_000;

/**
 * Which of the user's cities does a point belong to?
 *
 * 1. Administrative containment: the smallest stored boundary covering the
 *    point wins. This resolves enclaves correctly — a pin in Vatican City
 *    attaches to Vatican, not Rome, because Rome's polygon has a hole there.
 * 2. Fallback (no boundary covers the point, or lookups failed): nearest city
 *    center within 50 km — the pre-boundary behavior, so cities without a
 *    boundary are never worse off than before.
 */
export async function findParentCityId(
  userId: string,
  lat: number,
  lng: number
): Promise<string | null> {
  const covering = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Visit"
    WHERE "userId" = ${userId}
      AND "type" = 'CITY'::"VisitType"
      AND "boundary" IS NOT NULL
      AND ST_Covers("boundary", ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)
    ORDER BY ST_Area("boundary") ASC, "id" ASC
    LIMIT 1
  `;
  if (covering[0]) return covering[0].id;

  const nearest = await prisma.$queryRaw<{ id: string }[]>`
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
  return nearest[0]?.id ?? null;
}

/**
 * Store a fetched boundary on a city visit. Returns true when a usable
 * polygon was stored. Defenses applied in SQL:
 * - ST_MakeValid + ST_CollectionExtract(…, 3) keep only valid polygon parts;
 * - empty results (e.g. a Point response collapsed to MULTIPOLYGON EMPTY)
 *   are coerced to NULL instead of poisoning containment queries;
 * - polygons above the caller's area cap are rejected (a "city" must never
 *   hold a county- or country-sized polygon, microstates excepted).
 */
export async function setCityBoundary(
  userId: string,
  cityId: string,
  geojson: string,
  maxAreaKm2: number
): Promise<boolean> {
  await prisma.$executeRaw`
    UPDATE "Visit"
    SET "boundary" = (
      SELECT CASE
        WHEN g IS NULL OR ST_IsEmpty(g) THEN NULL
        WHEN ST_Area(g::geography) > ${maxAreaKm2} * 1000000.0 THEN NULL
        ELSE g::geography
      END
      FROM (
        SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(${geojson})), 3)) AS g
      ) AS cleaned
    )
    WHERE "id" = ${cityId} AND "userId" = ${userId} AND "type" = 'CITY'::"VisitType"
  `;
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT ("boundary" IS NOT NULL) AS ok FROM "Visit" WHERE "id" = ${cityId} AND "userId" = ${userId}
  `;
  return rows[0]?.ok ?? false;
}

/**
 * After a city with a boundary is created, attach the user's places that fall
 * inside it. Deliberately conservative: a place is moved only when it is
 * currently orphaned, or its current parent has a boundary that does NOT
 * cover it (i.e. the old attachment was a radius-fallback guess). Places
 * whose parent legitimately covers them, or whose parent has no boundary at
 * all, are never silently stolen. Returns the number of places moved.
 */
export async function reparentCoveredPlaces(userId: string, cityId: string): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "Visit" AS p
    SET "parentId" = ${cityId}
    FROM "Visit" AS c
    WHERE c."id" = ${cityId}
      AND c."userId" = ${userId}
      AND c."boundary" IS NOT NULL
      AND p."userId" = ${userId}
      AND p."type" = 'PLACE'::"VisitType"
      AND p."geom" IS NOT NULL
      AND (p."parentId" IS DISTINCT FROM ${cityId})
      AND ST_Covers(c."boundary", p."geom")
      AND (
        p."parentId" IS NULL
        OR EXISTS (
          SELECT 1 FROM "Visit" AS old
          WHERE old."id" = p."parentId"
            AND old."boundary" IS NOT NULL
            AND NOT ST_Covers(old."boundary", p."geom")
        )
      )
  `;
}

/**
 * Radius fallback used when the new city has no stored boundary: adopt only
 * orphan places within the radius (never reparent).
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
