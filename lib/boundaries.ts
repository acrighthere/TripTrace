// City administrative boundaries + country from Nominatim (env-switchable to a
// self-hosted instance — that also satisfies the OSMF policy clause that an
// app must be able to change providers without a code update).
//
// Public-instance policy (https://operations.osmfoundation.org/policies/nominatim/):
// max 1 request/second per application, identifying User-Agent, cache results
// on our side. Calls here are serialized through an in-process queue and both
// the polygon and the country are persisted on the Visit row, so each pinned
// city costs one lookup ever. Only CITY pin coordinates are sent — never
// place pins (places inherit their country from the parent city).

import { continentForCode } from "@/lib/continents";

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
}

export interface CityLookup {
  /** null when no usable city/microstate polygon was returned */
  boundary: CityBoundary | null;
  /** country display name, e.g. "Italy" / "Vatican City" */
  country: string | null;
  /** ISO 3166-1 alpha-2, lowercase, e.g. "it" / "va" */
  countryCode: string | null;
  /** derived from countryCode */
  continent: string | null;
}

interface NominatimReverse {
  error?: string;
  place_rank?: number;
  addresstype?: string;
  display_name?: string;
  geojson?: { type: string };
  address?: { country?: string; country_code?: string };
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
  url.searchParams.set("addressdetails", "1"); // for address.country / country_code
  if (threshold) url.searchParams.set("polygon_threshold", String(threshold));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      // English country names regardless of the place's local language.
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
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

async function boundaryFrom(
  data: NominatimReverse,
  lat: number,
  lng: number
): Promise<CityBoundary | null> {
  const rank = Number(data.place_rank ?? 0);
  const isCityBand = rank >= 13 && rank <= 16;
  const isMicrostate = data.addresstype === "country";
  if (!isCityBand && !isMicrostate) return null;

  let geo = polygonOf(data);
  if (!geo) return null;

  let geojson = JSON.stringify(geo);
  if (geojson.length > RAW_SIZE_LIMIT) {
    const simplified = await throttled(() => reverseLookup(lat, lng, SIMPLIFY_THRESHOLD_DEG));
    geo = polygonOf(simplified);
    if (!geo) return null;
    geojson = JSON.stringify(geo);
  }

  return {
    geojson,
    maxAreaKm2: isCityBand ? CITY_AREA_CAP_KM2 : COUNTRY_AREA_CAP_KM2,
  };
}

/**
 * One reverse lookup yields both the country (always, when Nominatim returns
 * an address) and a city/microstate boundary polygon (when the result is a
 * city-band or microstate). Country is captured even when the polygon is
 * rejected (counties, oceans, place nodes), so country stats stay populated.
 * Best-effort: everything is null on a timeout or error.
 */
export async function lookupCity(lat: number, lng: number): Promise<CityLookup> {
  const empty: CityLookup = { boundary: null, country: null, countryCode: null, continent: null };
  try {
    const data = await throttled(() => reverseLookup(lat, lng));
    if (!data || data.error) return empty;

    const countryCode = data.address?.country_code?.toLowerCase() ?? null;
    const country = data.address?.country ?? null;
    const continent = continentForCode(countryCode);
    const boundary = await boundaryFrom(data, lat, lng);

    return { boundary, country, countryCode, continent };
  } catch (err) {
    console.error("[boundaries] lookup failed", err);
    return empty;
  }
}
