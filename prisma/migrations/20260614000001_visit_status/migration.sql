-- Visited vs wishlist (bucket-list) pins. Existing rows default to VISITED.
CREATE TYPE "VisitStatus" AS ENUM ('VISITED', 'WISHLIST');
ALTER TABLE "Visit" ADD COLUMN "status" "VisitStatus" NOT NULL DEFAULT 'VISITED';
