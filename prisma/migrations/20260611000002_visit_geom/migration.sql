-- Prisma cannot model PostGIS types natively; lat/lng floats are the app-facing
-- columns and this geography column is kept in sync by trigger for geo queries.

ALTER TABLE "Visit" ADD COLUMN "geom" geography(Point, 4326);

CREATE OR REPLACE FUNCTION visit_sync_geom() RETURNS trigger AS $$
BEGIN
  NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."lng", NEW."lat"), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER visit_geom_sync
  BEFORE INSERT OR UPDATE OF "lat", "lng" ON "Visit"
  FOR EACH ROW
  EXECUTE FUNCTION visit_sync_geom();

-- Backfill any rows created before this migration (no-op on a fresh database).
UPDATE "Visit" SET "geom" = ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography;

CREATE INDEX "Visit_geom_idx" ON "Visit" USING GIST ("geom");
