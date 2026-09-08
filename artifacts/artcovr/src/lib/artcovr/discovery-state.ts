import type { Artwork } from "./artworks.ts";
import { orderByDiversityRank } from "./visual-index.ts";

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

export function orderDiscoveryArtwork(items: readonly Artwork[], order: DiscoveryOrder): Artwork[] {
  if (order === "diverse") return orderByDiversityRank(items) ?? [...items];
  if (order === "title") return [...items].sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug));
  return [...items];
}
