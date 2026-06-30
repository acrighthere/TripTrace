import { Prisma } from "@prisma/client";
import type { VisitDto } from "@/types";

export const visitInclude = {
  _count: { select: { photos: true, children: true } },
} satisfies Prisma.VisitInclude;

export type VisitWithCounts = Prisma.VisitGetPayload<{ include: typeof visitInclude }>;

export function toVisitDto(v: VisitWithCounts): VisitDto {
  return {
    id: v.id,
    type: v.type,
    status: v.status,
    name: v.name,
    lat: v.lat,
    lng: v.lng,
    parentId: v.parentId,
    tripId: v.tripId,
    notes: v.notes,
    country: v.country,
    countryCode: v.countryCode,
    continent: v.continent,
    visitedAt: v.visitedAt?.toISOString() ?? null,
    visitedTo: v.visitedTo?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
    photoCount: v._count.photos,
    placeCount: v._count.children,
  };
}
