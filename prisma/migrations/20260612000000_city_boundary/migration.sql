-- Administrative boundary polygon for CITY visits, fetched from Nominatim at
-- creation time. Place→city attribution prefers point-in-polygon containment
-- (smallest covering boundary wins, which resolves enclaves like Vatican City
-- inside Rome) and falls back to nearest-center-within-radius when no stored
-- boundary covers the point.

ALTER TABLE "Visit" ADD COLUMN "boundary" geography(MultiPolygon, 4326);

CREATE INDEX "Visit_boundary_idx" ON "Visit" USING GIST ("boundary")
  WHERE "boundary" IS NOT NULL;
