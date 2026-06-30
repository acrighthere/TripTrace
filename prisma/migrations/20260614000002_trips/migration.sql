-- Trips/journeys: an ordered grouping of a user's visits. Deleting a trip
-- detaches its visits (SET NULL), never deletes them.

CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Visit" ADD COLUMN "tripId" TEXT;
CREATE INDEX "Visit_tripId_idx" ON "Visit"("tripId");

ALTER TABLE "Visit" ADD CONSTRAINT "Visit_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
