import visualIndexJson from "./visual-index.json" with { type: "json" };

/**
 * Machine visual metadata for the public display catalog.
 *
 * The artifact is generated offline by `npm run catalog:visual-index`
 * (scripts/catalog/build-visual-index.ts -> compute-visual-index.py) from the
 * display derivatives in public/assets/artworks, and committed. Nothing here
 * is computed at request time and nothing here is an approval signal: it is
 * visual metadata only, never rights, price, or publication state.
 *
 * Only the light artifact is imported by site code. The 512-d vectors live in
 * src/lib/artcovr/visual-vectors.json and are deliberately NOT imported
 * anywhere in src/: 100 x 512 floats would ship in the client bundle for no
 * user-visible gain (tests/unit/visual-index.test.ts guards both facts).
 */
export const VISUAL_TASKS = [
  "style",
  "medium",
  "mood",
  "category",
  "weather",
  "colorblend",
  "domcolor",
] as const;

export type VisualTask = (typeof VISUAL_TASKS)[number];
export type VisualLabel = { label: string; conf: number };
export type VisualRelated = { slug: string; score: number };
export type VisualIndexEntry = {
  related: VisualRelated[];
  diversityRank: number;
  labels: Record<VisualTask, VisualLabel>;
};
export type VisualIndex = {
  version: string;
  labelVersion: string;
  backend: string;
  generatedFrom: string;
  vocabularySource: string;
  vectorArtifact: string;
  dimensions: number;
  works: Record<string, VisualIndexEntry>;
};

/**
 * The artifact is schema-validated at generation time by
 * scripts/catalog/build-visual-index.ts (slug set, vector norms, related-slug
 * existence, rank permutation, vocabulary membership, banned-term filter), and
 * re-validated in tests/unit/visual-index.test.ts, so the cast below is backed
 * by real gates rather than by trust.
 */
export const visualIndex = visualIndexJson as unknown as VisualIndex;

export function getVisualEntry(slug: string): VisualIndexEntry | undefined {
  return visualIndex.works[slug];
}

/** Human-readable form of a vocabulary label: `Melancholic__Solitary` -> `melancholic solitary`. */
export function humanizeVisualLabel(label: string) {
  return label.replaceAll("__", " ").replaceAll("_", " ").replaceAll("-", " ").toLowerCase().trim();
}

/** Label strings for one work, for search-corpus merging. Never includes confidences. */
export function visualLabelSearchTerms(slug: string): string[] {
  const entry = getVisualEntry(slug);
  if (!entry) return [];
  return VISUAL_TASKS.flatMap((task) => {
    const label = entry.labels[task]?.label;
    if (!label) return [];
    const humanized = humanizeVisualLabel(label);
    return humanized === label.toLowerCase() ? [humanized] : [label, humanized];
  });
}

export function getVisualStyleLabel(slug: string): string | undefined {
  return getVisualEntry(slug)?.labels.style?.label;
}

/**
 * Vector-diversity display order: the farthest-point traversal computed over
 * the image vectors, which keeps visually similar works out of neighbouring
 * grid positions. Returns null when any displayed work is missing from the
 * index (the private staging catalog has no index), so callers can fall back
 * to the category round-robin instead of rendering a partial order.
 */
export function orderByDiversityRank<T extends { slug: string }>(items: readonly T[]): T[] | null {
  if (items.length === 0) return null;
  const ranked: Array<{ item: T; rank: number }> = [];
  for (const item of items) {
    const entry = getVisualEntry(item.slug);
    if (!entry) return null;
    ranked.push({ item, rank: entry.diversityRank });
  }
  return ranked.sort((left, right) => left.rank - right.rank).map(({ item }) => item);
}

/** Related slugs for one work, most similar first. */
export function relatedVisualSlugs(slug: string, count = 4): string[] {
  return (getVisualEntry(slug)?.related ?? []).slice(0, count).map((related) => related.slug);
}
