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
 * anywhere in src/: the full catalog's 512-d vectors would ship in the client bundle for no
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

/**
 * Palette-spread display order.
 *
 * `orderByDiversityRank` traverses the 512-d image vectors, which optimises for
 * overall visual distance — but the thing a viewer actually reads down a grid
 * is the colour cast, and the catalog is heavily weighted to two warm palettes
 * (`Warm_Autumnal_Sunset` and `Teal__Orange_Cinematic` together cover roughly
 * three quarters of the works). Under the pure vector order that leaves more
 * same-palette neighbours than chance would, so the grid reads as a wall of
 * orange no matter how well separated the vectors are.
 *
 * This walks the catalog greedily, always drawing from the largest palette
 * bucket that does not repeat the previous card or the card directly above it
 * in a `columns`-wide grid, and preferring a different style label when buckets
 * tie. Ordering inside a bucket stays in diversityRank order, so the vector
 * traversal still decides which member of a palette comes first.
 *
 * Returns null when any work is missing from the index, so callers can fall
 * back rather than render a partial order.
 */
export function spreadByVisualCluster<T extends { slug: string }>(
  items: readonly T[],
  columns = 4,
): T[] | null {
  if (items.length === 0) return null;

  const buckets = new Map<string, Array<{ item: T; rank: number; style: string }>>();
  for (const item of items) {
    const entry = getVisualEntry(item.slug);
    if (!entry) return null;
    const palette = entry.labels.colorblend?.label ?? "(none)";
    const bucket = buckets.get(palette) ?? [];
    bucket.push({ item, rank: entry.diversityRank, style: entry.labels.style?.label ?? "(none)" });
    buckets.set(palette, bucket);
  }
  for (const bucket of buckets.values()) bucket.sort((left, right) => left.rank - right.rank);

  const ordered: T[] = [];
  const paletteAt: string[] = [];
  const styleAt: string[] = [];

  while (ordered.length < items.length) {
    const position = ordered.length;
    const blockedPalettes = new Set(
      [paletteAt[position - 1], paletteAt[position - columns]].filter(
        (value): value is string => typeof value === "string",
      ),
    );
    const blockedStyles = new Set(
      [styleAt[position - 1], styleAt[position - columns]].filter(
        (value): value is string => typeof value === "string",
      ),
    );

    const available = [...buckets.entries()].filter(([, bucket]) => bucket.length > 0);
    const unblocked = available.filter(([palette]) => !blockedPalettes.has(palette));
    // When every remaining work shares a blocked palette the constraint cannot
    // be met; taking the largest bucket anyway keeps the tail from stranding a
    // single palette in one solid block at the end of the grid.
    const candidates = unblocked.length > 0 ? unblocked : available;

    const largest = Math.max(...candidates.map(([, bucket]) => bucket.length));
    const biggest = candidates.filter(([, bucket]) => bucket.length === largest);
    const preferred =
      biggest.find(([, bucket]) => !blockedStyles.has(bucket[0].style)) ?? biggest[0];

    const [palette, bucket] = preferred;
    const next = bucket.shift();
    if (!next) break;
    ordered.push(next.item);
    paletteAt.push(palette);
    styleAt.push(next.style);
  }

  return ordered.length === items.length ? ordered : null;
}

/** Related slugs for one work, most similar first. */
export function relatedVisualSlugs(slug: string, count = 4): string[] {
  return (getVisualEntry(slug)?.related ?? []).slice(0, count).map((related) => related.slug);
}
