"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DraftPin, TripDto, VisitDto, VisitType } from "@/types";
import { useT } from "@/lib/i18n";

/** Clicks below this zoom create cities; at or above it, places. */
export const PLACE_MIN_ZOOM = 10;

export interface FlyToTarget {
  lng: number;
  lat: number;
  zoom: number;
  /** Monotonic counter so repeated targets still retrigger the effect. */
  seq: number;
}

interface MapViewProps {
  styleUrl: string;
  visits: VisitDto[];
  trips: TripDto[];
  /** ISO alpha-2 (lowercase) of visited countries — filled on the map. */
  visitedCountries: string[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedId: string | null;
  draft: DraftPin | null;
  flyTo: FlyToTarget | null;
  onSelectVisit: (id: string) => void;
  onMapClick: (draft: DraftPin) => void;
}

const CITY_COLOR = "#0369a1"; // sky-700
const PLACE_COLOR = "#047857"; // emerald-700
const HIGHLIGHT_COLOR = "#f59e0b"; // amber-500
const TEXT_FONT = ["Noto Sans Regular"];

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function toFeatureCollection(visits: VisitDto[], type: VisitType): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: visits
      .filter((v) => v.type === type)
      .map((v) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [v.lng, v.lat] },
        properties: { id: v.id, name: v.name, status: v.status },
      })),
  };
}

/** Chronological order for drawing a trip's route through its stops. */
function visitOrder(a: VisitDto, b: VisitDto): number {
  const ka = a.visitedAt ?? a.createdAt;
  const kb = b.visitedAt ?? b.createdAt;
  return ka < kb ? -1 : ka > kb ? 1 : a.createdAt < b.createdAt ? -1 : 1;
}

/** One LineString per trip with ≥2 stops, ordered chronologically, colored. */
function toTripLines(visits: VisitDto[], trips: TripDto[]): GeoJSON.FeatureCollection {
  const colorById = new Map(trips.map((t) => [t.id, t.color]));
  const byTrip = new Map<string, VisitDto[]>();
  for (const v of visits) {
    if (!v.tripId) continue;
    const list = byTrip.get(v.tripId);
    if (list) list.push(v);
    else byTrip.set(v.tripId, [v]);
  }

  const features: GeoJSON.Feature[] = [];
  for (const [tripId, group] of byTrip) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(visitOrder);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: sorted.map((v) => [v.lng, v.lat]) },
      properties: { color: colorById.get(tripId) ?? "#2563eb" },
    });
  }
  return { type: "FeatureCollection", features };
}

const INTERACTIVE_LAYERS = [
  "places-clusters",
  "places-point",
  "places-label",
  "cities-clusters",
  "cities-point",
  "cities-label",
];

// Our own GeoJSON sources — basemap label hit-testing must skip these.
const APP_SOURCES = new Set(["cities", "places", "selected"]);

// OpenMapTiles `place` classes that count as a pinnable city. Country/state/
// region labels deliberately fall through to the plain click behavior.
const SETTLEMENT_CLASSES = new Set(["city", "town", "village"]);

interface LabelHit {
  name: string;
  lat: number;
  lng: number;
  kind: VisitType;
}

/**
 * Hit-test the basemap's rendered labels around a click point. City/town/
 * village labels suggest a CITY pin, POI labels a PLACE pin — both carry the
 * label's name and anchor coordinates so the form comes prefilled.
 */
function findLabelHit(map: MapLibreMap, point: { x: number; y: number }): LabelHit | null {
  let features: ReturnType<MapLibreMap["queryRenderedFeatures"]>;
  try {
    features = map.queryRenderedFeatures([
      [point.x - 8, point.y - 8],
      [point.x + 8, point.y + 8],
    ]);
  } catch {
    return null;
  }

  for (const f of features) {
    if (f.layer.type !== "symbol") continue;
    if (APP_SOURCES.has(f.source)) continue;
    if (f.geometry.type !== "Point") continue;

    const props = f.properties ?? {};
    // Prefer the name the style most likely rendered (English), then the
    // latin transliteration, then the local name.
    const name = [props.name_en, props["name:en"], props["name:latin"], props.name].find(
      (n): n is string => typeof n === "string" && n.trim().length > 0
    );
    if (!name) continue;

    const [lng, lat] = f.geometry.coordinates as [number, number];
    if (f.sourceLayer === "place" && SETTLEMENT_CLASSES.has(String(props.class))) {
      return { name: name.trim(), lat, lng, kind: "CITY" };
    }
    if (f.sourceLayer === "poi") {
      return { name: name.trim(), lat, lng, kind: "PLACE" };
    }
  }
  return null;
}

export default function MapView({
  styleUrl,
  visits,
  trips,
  visitedCountries,
  loading,
  error,
  onRetry,
  selectedId,
  draft,
  flyTo,
  onSelectVisit,
  onMapClick,
}: MapViewProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [showAreas, setShowAreas] = useState(true);

  // Latest props for the stable map event handlers.
  const visitsRef = useRef(visits);
  visitsRef.current = visits;
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  const onSelectRef = useRef(onSelectVisit);
  onSelectRef.current = onSelectVisit;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Mount the map once; styleUrl is fixed for the session.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [12, 30],
      zoom: 1.7,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");

    map.on("load", () => {
      map.addSource("cities", {
        type: "geojson",
        data: toFeatureCollection(visitsRef.current, "CITY"),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 45,
      });
      map.addSource("places", {
        type: "geojson",
        data: toFeatureCollection(visitsRef.current, "PLACE"),
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 40,
      });
      map.addSource("selected", { type: "geojson", data: EMPTY_FC });
      // Bundled world-country polygons (keyed by lowercase ISO alpha-2); the
      // fill is filtered to the user's visited countries in a separate effect.
      map.addSource("countries", { type: "geojson", data: "/countries.geo.json" });
      map.addSource("trips", {
        type: "geojson",
        data: toTripLines(visitsRef.current, tripsRef.current),
      });

      // Visited-country fill sits at the very bottom (just above the basemap).
      map.addLayer({
        id: "countries-fill",
        type: "fill",
        source: "countries",
        filter: ["in", ["get", "code"], ["literal", []]],
        paint: { "fill-color": CITY_COLOR, "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "countries-outline",
        type: "line",
        source: "countries",
        filter: ["in", ["get", "code"], ["literal", []]],
        paint: { "line-color": CITY_COLOR, "line-width": 1, "line-opacity": 0.5 },
      });

      // Trip routes sit beneath every marker so pins stay clickable.
      map.addLayer({
        id: "trip-lines",
        type: "line",
        source: "trips",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2.5,
          "line-opacity": 0.75,
          "line-dasharray": [2, 1.5],
        },
      });

      // Halo under the selected marker.
      map.addLayer({
        id: "selected-ring",
        type: "circle",
        source: "selected",
        paint: {
          "circle-radius": 13,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": HIGHLIGHT_COLOR,
          "circle-stroke-width": 3,
        },
      });

      // Places only render once zoomed in past the threshold.
      map.addLayer({
        id: "places-clusters",
        type: "circle",
        source: "places",
        minzoom: PLACE_MIN_ZOOM,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": PLACE_COLOR,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "places-cluster-count",
        type: "symbol",
        source: "places",
        minzoom: PLACE_MIN_ZOOM,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 11,
          "text-font": TEXT_FONT,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "places-point",
        type: "circle",
        source: "places",
        minzoom: PLACE_MIN_ZOOM,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6.5,
          // Wishlist pins read as a hollow ring; visited ones are solid.
          "circle-color": ["case", ["==", ["get", "status"], "WISHLIST"], "#ffffff", PLACE_COLOR],
          "circle-stroke-width": 2,
          "circle-stroke-color": ["case", ["==", ["get", "status"], "WISHLIST"], PLACE_COLOR, "#ffffff"],
        },
      });
      map.addLayer({
        id: "places-label",
        type: "symbol",
        source: "places",
        minzoom: PLACE_MIN_ZOOM,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": TEXT_FONT,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": "#065f46",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });

      map.addLayer({
        id: "cities-clusters",
        type: "circle",
        source: "cities",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": CITY_COLOR,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "cities-cluster-count",
        type: "symbol",
        source: "cities",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": TEXT_FONT,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "cities-point",
        type: "circle",
        source: "cities",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 8.5,
          // Wishlist pins read as a hollow ring; visited ones are solid.
          "circle-color": ["case", ["==", ["get", "status"], "WISHLIST"], "#ffffff", CITY_COLOR],
          "circle-stroke-width": 2,
          "circle-stroke-color": ["case", ["==", ["get", "status"], "WISHLIST"], CITY_COLOR, "#ffffff"],
        },
      });
      map.addLayer({
        id: "cities-label",
        type: "symbol",
        source: "cities",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-font": TEXT_FONT,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": "#0c4a6e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });

      setStyleLoaded(true);
    });

    map.on("click", async (e) => {
      const layers = INTERACTIVE_LAYERS.filter((l) => map.getLayer(l));
      const features = layers.length
        ? map.queryRenderedFeatures(e.point, { layers })
        : [];
      const feature = features[0];

      if (!feature) {
        // A click on a basemap label (city name, POI) pins that label —
        // name and coordinates come from the label itself.
        const labelHit = findLabelHit(map, e.point);
        if (labelHit) {
          onMapClickRef.current({
            lat: labelHit.lat,
            lng: labelHit.lng,
            suggestedType: labelHit.kind,
            suggestedName: labelHit.name,
          });
          return;
        }

        const zoom = map.getZoom();
        onMapClickRef.current({
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          suggestedType: zoom >= PLACE_MIN_ZOOM ? "PLACE" : "CITY",
        });
        return;
      }

      if (feature.properties?.cluster) {
        const source = map.getSource(feature.source) as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: zoom + 0.5,
        });
        return;
      }

      if (feature.properties?.id) {
        onSelectRef.current(String(feature.properties.id));
      }
    });

    map.on("mousemove", (e) => {
      const layers = INTERACTIVE_LAYERS.filter((l) => map.getLayer(l));
      if (!layers.length) return;
      const features = map.queryRenderedFeatures(e.point, { layers });
      const clickable = features.length > 0 || findLabelHit(map, e.point) !== null;
      map.getCanvas().style.cursor = clickable ? "pointer" : "";
    });

    return () => {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push visit data into the map sources.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    (map.getSource("cities") as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(visits, "CITY")
    );
    (map.getSource("places") as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(visits, "PLACE")
    );
    (map.getSource("trips") as GeoJSONSource | undefined)?.setData(toTripLines(visits, trips));
  }, [visits, trips, styleLoaded]);

  // Filter the country fill to visited countries and honor the show/hide toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const filter = ["in", ["get", "code"], ["literal", visitedCountries]] as never;
    const vis = showAreas ? "visible" : "none";
    for (const id of ["countries-fill", "countries-outline"]) {
      if (!map.getLayer(id)) continue;
      map.setFilter(id, filter);
      map.setLayoutProperty(id, "visibility", vis);
    }
  }, [visitedCountries, showAreas, styleLoaded]);

  // Highlight ring under the selected visit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const visit = selectedId ? visits.find((v) => v.id === selectedId) : undefined;
    (map.getSource("selected") as GeoJSONSource | undefined)?.setData(
      visit
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [visit.lng, visit.lat] },
                properties: {},
              },
            ],
          }
        : EMPTY_FC
    );
  }, [selectedId, visits, styleLoaded]);

  // Temporary marker while the add-visit form is open.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    if (draft) {
      draftMarkerRef.current = new maplibregl.Marker({ color: HIGHLIGHT_COLOR })
        .setLngLat([draft.lng, draft.lat])
        .addTo(map);
    }
  }, [draft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    const target = { center: [flyTo.lng, flyTo.lat] as [number, number], zoom: flyTo.zoom };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      map.jumpTo(target);
    } else {
      map.flyTo({ ...target, duration: 1100 });
    }
  }, [flyTo]);

  const showEmpty = !loading && !error && visits.length === 0 && !draft;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />

      {visitedCountries.length > 0 && (
        <button
          onClick={() => setShowAreas((s) => !s)}
          aria-pressed={showAreas}
          className="absolute left-3 top-3 z-10 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow hover:bg-white focus-visible:ring-2 focus-visible:ring-sky-500 md:left-[25rem]"
        >
          {showAreas ? t("map.hideAreas") : t("map.showAreas")}
        </button>
      )}

      {loading && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-sm text-slate-600 shadow">
          {t("map.loading")}
        </div>
      )}

      {error && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-white px-4 py-2 text-sm text-red-700 shadow">
          <span>{error}</span>
          <button
            onClick={onRetry}
            className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {showEmpty && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4 md:top-6">
          <p className="rounded-xl bg-white/95 px-4 py-3 text-center text-sm text-slate-600 shadow">
            {t("map.empty")}
          </p>
        </div>
      )}
    </div>
  );
}
