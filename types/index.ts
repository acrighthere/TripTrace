export type VisitType = "CITY" | "PLACE";

export interface VisitDto {
  id: string;
  type: VisitType;
  name: string;
  lat: number;
  lng: number;
  parentId: string | null;
  notes: string | null;
  /** ISO datetime or null */
  visitedAt: string | null;
  /** ISO datetime */
  createdAt: string;
  photoCount: number;
  placeCount: number;
}

export interface PhotoDto {
  id: string;
  visitId: string;
  caption: string | null;
  /** ISO datetime */
  createdAt: string;
  /** Presigned GET URL, valid for a limited time */
  url: string;
}

/** Payload the map produces when the user clicks an empty spot or a basemap label. */
export interface DraftPin {
  lat: number;
  lng: number;
  suggestedType: VisitType;
  /** Prefilled from a clicked basemap label (city name / POI name), if any. */
  suggestedName?: string;
}
