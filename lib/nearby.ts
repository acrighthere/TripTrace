// "Interesting places nearby" via the Wikipedia GeoSearch API: a place is
// interesting when it has a Wikipedia article near the point — which also
// yields a name, a short description, coordinates, and a photo thumbnail in
// one keyless request. Locale-aware (ru./en. wikipedia) to match the app UI.

import type { Locale } from "@/lib/i18n-config";
import type { NearbyPlaceDto } from "@/types";

const USER_AGENT = "TripTrace/0.1 (self-hosted personal travel map)";
const TIMEOUT_MS = 6000;
/** GeoSearch caps the radius at 10 km — also our product decision. */
const RADIUS_M = 10_000;
/** Fetch more than we return so photo-less results can be dropped first. */
const FETCH_LIMIT = 25;
const RETURN_LIMIT = 15;

// Small TTL cache so repeated clicks around the same spot don't re-hit
// Wikipedia. Keyed by locale + coords rounded to ~100 m.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; places: NearbyPlaceDto[] }>();

interface GeoPage {
  pageid: number;
  title: string;
  description?: string;
  coordinates?: { lat: number; lon: number }[];
  thumbnail?: { source: string };
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Best-effort: returns [] on timeouts or API errors. */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  locale: Locale
): Promise<NearbyPlaceDto[]> {
  const cacheKey = `${locale}:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.places;

  const url = new URL(`https://${locale}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "geosearch");
  url.searchParams.set("ggscoord", `${lat}|${lng}`);
  url.searchParams.set("ggsradius", String(RADIUS_M));
  url.searchParams.set("ggslimit", String(FETCH_LIMIT));
  url.searchParams.set("prop", "pageimages|description|coordinates");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "320");
  url.searchParams.set("colimit", String(FETCH_LIMIT));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { query?: { pages?: Record<string, GeoPage> } };
    const pages = Object.values(data.query?.pages ?? {});

    const places: NearbyPlaceDto[] = pages
      .filter((p) => p.coordinates?.[0])
      .map((p) => {
        const c = p.coordinates![0];
        return {
          title: p.title,
          description: p.description ?? null,
          lat: c.lat,
          lng: c.lon,
          thumbUrl: p.thumbnail?.source ?? null,
          distanceM: Math.round(haversineMeters(lat, lng, c.lat, c.lon)),
          url: `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
        };
      })
      .sort((a, b) => a.distanceM - b.distanceM);

    // Trim to the return limit, dropping photo-less entries first — the whole
    // point of the card is the picture.
    let trimmed = places;
    if (places.length > RETURN_LIMIT) {
      const withPhoto = places.filter((p) => p.thumbUrl);
      trimmed = (withPhoto.length >= RETURN_LIMIT ? withPhoto : places).slice(0, RETURN_LIMIT);
    }

    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, { at: Date.now(), places: trimmed });
    return trimmed;
  } catch (err) {
    console.error("[nearby] lookup failed", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
