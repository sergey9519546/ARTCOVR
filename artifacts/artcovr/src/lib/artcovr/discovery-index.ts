import type { Artwork } from "./artworks.ts";
import { getArtworkColors, getArtworkMoods } from "./catalog-intelligence.ts";
import { isPublicArtwork } from "./catalog-visibility.ts";
import { displayGenreLabel, getArtworkGenres, MUSIC_GENRES, type MusicGenre } from "./genre-index.ts";
import { displayVisualLabel, getVisualEntry } from "./visual-index.ts";

export type ArtworkSimilarityMode = "visual" | "palette" | "mood";

export type ArtworkSimilarityMatch = {
  artwork: Artwork;
  basis: "visual-neighbor" | "shared-palette" | "shared-mood";
  reasons: string[];
};

export type GenreArtworkMatch = {
  artwork: Artwork;
  basis: "metadata" | "visual-neighbor";
  reasons: string[];
  /** Relative discovery support in [0, 1], never an audio-classification probability. */
  score: number;
};

const genreAliases: Readonly<Record<string, MusicGenre>> = {
  "hiphop": "hip-hop",
  "r-and-b": "r-and-b-soul",
  "rnb": "r-and-b-soul",
  "r-and-b-soul": "r-and-b-soul",
};

/** Normalize spellings only; unsupported styles such as lo-fi stay unsupported. */
export function normalizeDiscoveryGenre(value: string): MusicGenre | null {
  const normalized = value.trim().toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[\s_/]+/g, "-")
    .replace(/-+/g, "-");
  const alias = genreAliases[normalized];
  if (typeof alias === "string") return alias;
  return MUSIC_GENRES.find((genre) => genre === normalized) ?? null;
}

function sharedValues(left: readonly string[], right: readonly string[]) {
  const rightValues = new Set(right);
  return [...new Set(left)].filter((value) => rightValues.has(value));
}

function visualReasons(seed: Artwork, candidate: Artwork) {
  const source = getVisualEntry(seed.slug);
  const target = getVisualEntry(candidate.slug);
  const traits = [
    ["style", "style"],
    ["medium", "medium"],
    ["colorblend", "palette"],
    ["mood", "mood"],
  ] as const;
  const shared = traits.flatMap(([task, label]) => {
    const value = source?.labels[task]?.label;
    return value && target?.labels[task]?.label === value
      ? [`Shared ${label}: ${displayVisualLabel(value)}`]
      : [];
  });
  return shared.length > 0 ? shared.slice(0, 2) : ["Similar color, texture or composition"];
}

/**
 * Explore within the caller's approved catalog scope. Visual mode preserves
 * the existing offline pixel-descriptor neighbors; it does not pretend that
 * broader trait matches are additional vector neighbors or CLIP results.
 * Palette and mood modes return only candidates with an actual shared trait.
 * No source vectors, private paths, or model-confidence percentages are exposed.
 */
export function rankSimilarArtwork(
  seed: Artwork,
  items: readonly Artwork[],
  mode: ArtworkSimilarityMode = "visual",
): ArtworkSimilarityMatch[] {
  if (!isPublicArtwork(seed)) return [];

  const candidates = new Map<string, Artwork>();
  for (const item of items) {
    if (item.slug !== seed.slug && isPublicArtwork(item) && !candidates.has(item.slug)) {
      candidates.set(item.slug, item);
    }
  }

  if (mode === "visual") {
    const seen = new Set<string>();
    return (getVisualEntry(seed.slug)?.related ?? []).flatMap(({ slug }) => {
      const artwork = candidates.get(slug);
      if (!artwork || seen.has(slug)) return [];
      seen.add(slug);
      return [{ artwork, basis: "visual-neighbor" as const, reasons: visualReasons(seed, artwork) }];
    });
  }

  const seedPalette = getVisualEntry(seed.slug)?.labels.colorblend?.label;
  const seedColors = getArtworkColors(seed);
  const seedMoods = getArtworkMoods(seed);
  return [...candidates.values()]
    .map((artwork, inputOrder) => {
      if (mode === "palette") {
        const sharedPalette = seedPalette && getVisualEntry(artwork.slug)?.labels.colorblend?.label === seedPalette;
        const colors = sharedValues(seedColors, getArtworkColors(artwork));
        return {
          artwork,
          basis: "shared-palette" as const,
          reasons: [
            ...(sharedPalette ? [`Shared palette: ${displayVisualLabel(seedPalette)}`] : []),
            ...colors.map((color) => `Shared color: ${displayVisualLabel(color)}`),
          ].slice(0, 2),
          // An exact palette label leads individual shared color families.
          score: (sharedPalette ? 3 : 0) + colors.length,
          inputOrder,
        };
      }

      const moods = sharedValues(seedMoods, getArtworkMoods(artwork));
      return {
        artwork,
        basis: "shared-mood" as const,
        reasons: moods.slice(0, 2).map((mood) => `Shared mood: ${displayVisualLabel(mood)}`),
        score: moods.length,
        inputOrder,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.inputOrder - right.inputOrder)
    .map(({ artwork, basis, reasons }) => ({ artwork, basis, reasons }));
}

/**
 * Music genres are visual-fit suggestions based on the existing metadata rules.
 * Direct metadata matches always lead. Additional suggestions must have positive
 * pixel-vector neighbor support from a direct match in the caller's public scope;
 * suggestions never propagate transitively or borrow evidence from private works.
 */
export function rankGenreArtwork(genre: string, items: readonly Artwork[]): GenreArtworkMatch[] {
  const normalizedGenre = normalizeDiscoveryGenre(genre);
  if (!normalizedGenre) return [];
  const label = displayGenreLabel(normalizedGenre);
  const publicItems = new Map<string, Artwork>();
  for (const artwork of items) {
    if (isPublicArtwork(artwork) && !publicItems.has(artwork.slug)) publicItems.set(artwork.slug, artwork);
  }
  const directSlugs = new Set(
    [...publicItems.values()]
      .filter((artwork) => getArtworkGenres(artwork).includes(normalizedGenre))
      .map(({ slug }) => slug),
  );
  if (directSlugs.size === 0) return [];

  const matches: Array<GenreArtworkMatch & { inputOrder: number }> = [];
  [...publicItems.values()].forEach((artwork, inputOrder) => {
    if (directSlugs.has(artwork.slug)) {
      const style = getVisualEntry(artwork.slug)?.labels.style?.label;
      matches.push({
        artwork,
        basis: "metadata",
        reasons: [
          `Metadata rule: ${label}`,
          // IDM is assigned by the existing Digital / Computational category
          // rule, not by the work's independent visual style label.
          normalizedGenre === "idm"
            ? `Category rule: ${artwork.category}`
            : style ? `Visual style: ${displayVisualLabel(style)}` : `Category: ${artwork.category}`,
        ],
        score: 1,
        inputOrder,
      });
      return;
    }

    const neighbors = getVisualEntry(artwork.slug)?.related ?? [];
    const seen = new Set<string>();
    const supporters = neighbors.flatMap(({ slug, score }) => {
      if (slug === artwork.slug || seen.has(slug) || !directSlugs.has(slug) || !Number.isFinite(score) || score <= 0) return [];
      seen.add(slug);
      const neighbor = publicItems.get(slug);
      return neighbor ? [{ artwork: neighbor, weight: Math.min(score, 1) }] : [];
    });
    if (supporters.length === 0) return;

    matches.push({
      artwork,
      basis: "visual-neighbor",
      reasons: [
        `${supporters.length} close visual ${supporters.length === 1 ? "neighbor provides" : "neighbors provide"} support for ${label}`,
        `Supporting work: ${supporters[0].artwork.title}`,
      ],
      score: supporters.reduce((sum, { weight }) => sum + weight, 0) / neighbors.length,
      inputOrder,
    });
  });

  return matches
    .sort((left, right) => {
      if (left.basis !== right.basis) return left.basis === "metadata" ? -1 : 1;
      return right.score - left.score || left.inputOrder - right.inputOrder;
    })
    .map(({ artwork, basis, reasons, score }) => ({ artwork, basis, reasons, score }));
}
