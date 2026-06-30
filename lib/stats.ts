import { prisma } from "@/lib/db";
import { lookupCity } from "@/lib/boundaries";

/** Sovereign UN member states — the denominator for "% of the world". */
const WORLD_COUNTRY_COUNT = 195;

export interface CountryStat {
  code: string;
  name: string;
  continent: string | null;
  count: number;
}

export interface TravelStats {
  counts: { cities: number; places: number; countries: number; continents: number };
  worldPct: number;
  countries: CountryStat[];
  furthest: { a: string; b: string; km: number } | null;
  /** CITY rows still lacking a country — drives the backfill prompt. */
  missingCountry: number;
}

export async function getStats(userId: string): Promise<TravelStats> {
  // Wishlist pins are aspirational — only VISITED rows count toward stats.
  const [cities, places, missingCountry, countryRows, far] = await Promise.all([
    prisma.visit.count({ where: { userId, type: "CITY", status: "VISITED" } }),
    prisma.visit.count({ where: { userId, type: "PLACE", status: "VISITED" } }),
    prisma.visit.count({ where: { userId, type: "CITY", status: "VISITED", countryCode: null } }),
    prisma.$queryRaw<{ code: string; name: string | null; continent: string | null; count: bigint }[]>`
      SELECT "countryCode" AS code,
             MAX("country") AS name,
             MAX("continent") AS continent,
             COUNT(*) AS count
      FROM "Visit"
      WHERE "userId" = ${userId} AND "status" = 'VISITED'::"VisitStatus" AND "countryCode" IS NOT NULL
      GROUP BY "countryCode"
      ORDER BY count DESC, name ASC
    `,
    // Widest span of the user's travels — the two most distant visited pins.
    prisma.$queryRaw<{ a: string; b: string; d: number }[]>`
      SELECT a."name" AS a, b."name" AS b, ST_Distance(a."geom", b."geom") AS d
      FROM "Visit" a
      JOIN "Visit" b ON a."id" < b."id"
      WHERE a."userId" = ${userId} AND b."userId" = ${userId}
        AND a."status" = 'VISITED'::"VisitStatus" AND b."status" = 'VISITED'::"VisitStatus"
        AND a."geom" IS NOT NULL AND b."geom" IS NOT NULL
      ORDER BY d DESC
      LIMIT 1
    `,
  ]);

  const countries: CountryStat[] = countryRows.map((r) => ({
    code: r.code,
    name: r.name ?? r.code.toUpperCase(),
    continent: r.continent,
    count: Number(r.count),
  }));
  const continents = new Set(countries.map((c) => c.continent).filter(Boolean));

  return {
    counts: { cities, places, countries: countries.length, continents: continents.size },
    worldPct: Math.round((countries.length / WORLD_COUNTRY_COUNT) * 100),
    countries,
    furthest: far[0] ? { a: far[0].a, b: far[0].b, km: Math.round(far[0].d / 1000) } : null,
    missingCountry,
  };
}

/**
 * Fill country/continent for the user's pre-existing rows: cities via a
 * throttled Nominatim lookup (≤1/s through the shared queue — slow for many
 * cities, but user-triggered and re-runnable), then places inherit from their
 * parent. Returns how many cities were resolved.
 */
export async function backfillCountries(userId: string): Promise<{ citiesUpdated: number }> {
  const cities = await prisma.visit.findMany({
    where: { userId, type: "CITY", countryCode: null },
    select: { id: true, lat: true, lng: true },
  });

  let citiesUpdated = 0;
  for (const city of cities) {
    const lk = await lookupCity(city.lat, city.lng);
    if (lk.country || lk.countryCode) {
      await prisma.visit.update({
        where: { id: city.id },
        data: { country: lk.country, countryCode: lk.countryCode, continent: lk.continent },
      });
      citiesUpdated++;
    }
  }

  // Places inherit from their parent city wherever they don't have one yet.
  await prisma.$executeRaw`
    UPDATE "Visit" p
    SET "country" = c."country", "countryCode" = c."countryCode", "continent" = c."continent"
    FROM "Visit" c
    WHERE p."parentId" = c."id"
      AND p."userId" = ${userId}
      AND p."type" = 'PLACE'::"VisitType"
      AND p."countryCode" IS NULL
      AND c."countryCode" IS NOT NULL
  `;

  return { citiesUpdated };
}
