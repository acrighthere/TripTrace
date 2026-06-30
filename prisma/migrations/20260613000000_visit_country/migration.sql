-- Country/continent for a visit. CITY rows get it from the Nominatim reverse
-- lookup at creation; PLACE rows inherit it from their parent city. Powers the
-- stats dashboard (distinct countries/continents, % of world).

ALTER TABLE "Visit" ADD COLUMN "country" TEXT;
ALTER TABLE "Visit" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Visit" ADD COLUMN "continent" TEXT;

CREATE INDEX "Visit_userId_countryCode_idx" ON "Visit" ("userId", "countryCode");
