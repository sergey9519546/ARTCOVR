import type { Artwork } from "./artworks.ts";
import { orderByDiversityRank } from "./visual-index.ts";
import type { ArtworkOrderPreferenceMode } from "@workspace/api-client-react";
import { orderArtworkForVisit } from "./artwork-order-preference";

export const CRATE_STORAGE_KEY = "artcovr:visual-crate:v1";
export type DiscoveryOrder = "recommended" | "diverse" | "title";

export function readSavedSlugs(raw: string | null, items: readonly Artwork[]): string[] {
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(values)) return [];
    const allowed = new Set(items.filter((item) => item.rightsApproved && item.published).map((item) => item.slug));
    return [...new Set(values.filter((value): value is string => typeof value === "string" && allowed.has(value)))];
  } catch { return []; }
}

export function orderDiscoveryArtwork(
  items: readonly Artwork[],
  order: DiscoveryOrder,
  preference: ArtworkOrderPreferenceMode = "rotate",
  visitIndex = 0,
): Artwork[] {
  if (order === "diverse") return orderByDiversityRank(items) ?? [...items];
  if (order === "title") return [...items].sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug));
  return orderArtworkForVisit(items, preference, visitIndex);
}
