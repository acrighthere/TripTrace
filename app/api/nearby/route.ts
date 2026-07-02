import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { fetchNearbyPlaces } from "@/lib/nearby";
import { normalizeLocale } from "@/lib/i18n-config";
import { rateLimit } from "@/lib/rate-limit";

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
});

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Keeps outbound Wikipedia traffic modest: burst of 10, then one per 3 s.
  if (!rateLimit(`nearby:${userId}`, { capacity: 10, refillPerSecond: 1 / 3 })) {
    return NextResponse.json(
      { error: "Too many lookups. Try again in a moment." },
      { status: 429 }
    );
  }

  const parsed = querySchema.safeParse({
    lat: req.nextUrl.searchParams.get("lat"),
    lng: req.nextUrl.searchParams.get("lng"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const locale = normalizeLocale(req.nextUrl.searchParams.get("lang"));
  const places = await fetchNearbyPlaces(parsed.data.lat, parsed.data.lng, locale);

  return NextResponse.json({ places });
}
