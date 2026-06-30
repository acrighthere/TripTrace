import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getStats } from "@/lib/stats";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json(await getStats(userId));
}
