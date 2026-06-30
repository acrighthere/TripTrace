import { Prisma } from "@prisma/client";
import type { TripDto } from "@/types";

// Distinct, map-legible line colors, assigned round-robin as trips are created.
export const TRIP_COLORS = [
  "#e11d48", // rose
  "#7c3aed", // violet
  "#2563eb", // blue
  "#0891b2", // cyan
  "#059669", // emerald
  "#ca8a04", // amber
  "#ea580c", // orange
  "#db2777", // pink
];

export const DEFAULT_TRIP_COLOR = TRIP_COLORS[2];

export function nextTripColor(existingCount: number): string {
  return TRIP_COLORS[existingCount % TRIP_COLORS.length];
}

export const tripInclude = {
  _count: { select: { visits: true } },
} satisfies Prisma.TripInclude;

export type TripWithCount = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

export function toTripDto(t: TripWithCount): TripDto {
  return {
    id: t.id,
    name: t.name,
    color: t.color ?? DEFAULT_TRIP_COLOR,
    createdAt: t.createdAt.toISOString(),
    visitCount: t._count.visits,
  };
}
