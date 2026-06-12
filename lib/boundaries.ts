// City administrative boundaries from Nominatim (env-switchable to a
// self-hosted instance — that also satisfies the OSMF policy clause that an
// app must be able to change providers without a code update).
//
// Public-instance policy (https://operations.osmfoundation.org/policies/nominatim/):
// max 1 request/second per application, identifying User-Agent, cache results
// on our side. Calls here are serialized through an in-process queue and the
// fetched polygon is persisted on the Visit row, so each pinned city costs
// one lookup ever. Only CITY pin coordinates are sent — never place pins.

const BASE_URL = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
const USER_AGENT = "TripTrace/0.1 (self-hosted personal travel map)";
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 6000;

// Above this raw GeoJSON size we refetch server-simplified: a ~50 m tolerance
// is negligible for polygons this large. Small polygons (Vatican is ~7 KB)
// are stored exactly — simplifying them would blur the borders that motivate
// this feature.
const RAW_SIZE_LIMIT = 700_000;
const SIMPLIFY_THRESHOLD_DEG = 0.0005;

// Accepted result classes, enforced again as area caps in SQL:
// - place_rank 13–16 is Nominatim's "city band" (commune/borough/ward…)
// - country-level results are accepted only for microstates (Vatican, Monaco,
//   San Marino…) so a rural lookup can never pin a whole country's polygon.
const CITY_AREA_CAP_KM2 = 50_000;
const COUNTRY_AREA_CAP_KM2 = 1_500;

export interface CityBoundary {
  /** GeoJSON Polygon/MultiPolygon string */
  geojson: string;
  /** Sanity cap checked in SQL before storing */
  maxAreaKm2: number;
  displayName: string;
}

interface NominatimReverse {
  error?: string;
  place_rank?: number;
  addresstype?: string;
  display_name?: string;
  geojson?: { type: string };
}

let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

async function reverseLookup(
  lat: number,
  lng: number,
  threshold?: number
): Promise<NominatimReverse | null> {
  const url = new URL("/reverse", BASE_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "10"); // city-level admin area
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("addressdetails", "0");
  if (threshold) url.searchParams.set("polygon_threshold", String(threshold));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as NominatimReverse;
  } finally {
    clearTimeout(timer);
  }
}

function polygonOf(data: NominatimReverse | null): { type: string } | null {
  const geo = data?.geojson;
  if (!geo || (geo.type !== "Polygon" && geo.type !== "MultiPolygon")) return null;
  return geo;
}

/**
 * Best-effort: returns null on timeouts, non-city results (counties, plain
 * place nodes without polygons), or oceans — the caller falls back to the
 * radius heuristic in that case.
 */
export async function fetchCityBoundary(lat: number, lng: number): Promise<CityBoundary | null> {
  try {
    let data = await throttled(() => reverseLookup(lat, lng));
    if (!data || data.error) return null;

    const rank = Number(data.place_rank ?? 0);
    const isCityBand = rank >= 13 && rank <= 16;
    const isMicrostate = data.addresstype === "country";
    if (!isCityBand && !isMicrostate) return null;

    let geo = polygonOf(data);
    if (!geo) return null;

    let geojson = JSON.stringify(geo);
    if (geojson.length > RAW_SIZE_LIMIT) {
      data = await throttled(() => reverseLookup(lat, lng, SIMPLIFY_THRESHOLD_DEG));
      geo = polygonOf(data);
      if (!geo) return null;
      geojson = JSON.stringify(geo);
    }

    return {
      geojson,
      maxAreaKm2: isCityBand ? CITY_AREA_CAP_KM2 : COUNTRY_AREA_CAP_KM2,
      displayName: String(data?.display_name ?? ""),
    };
  } catch (err) {
    console.error("[boundaries] lookup failed", err);
    return null;
  }
}
