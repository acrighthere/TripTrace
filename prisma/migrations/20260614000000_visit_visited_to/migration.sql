-- End date for a visit, so a multi-day stay reads as a range, not one day.
ALTER TABLE "Visit" ADD COLUMN "visitedTo" TIMESTAMP(3);
