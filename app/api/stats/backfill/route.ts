import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { backfillCountries } from "@/lib/stats";
import { rateLimit } from "@/lib/rate-limit";

export async function POST() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Each backfill fans out throttled Nominatim lookups; one in flight per user.
  if (!rateLimit(`backfill:${userId}`, { capacity: 1, refillPerSecond: 1 / 30 })) {
    return NextResponse.json(
      { error: "A backfill is already running. Try again shortly." },
      { status: 429 }
    );
  }

  return NextResponse.json(await backfillCountries(userId));
}
