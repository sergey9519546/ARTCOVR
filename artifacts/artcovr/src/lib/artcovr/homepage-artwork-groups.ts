import { featuredArtworks } from "./artworks";

const GROUP_WEIGHTS = {
  grid: 33,
  slide: 29,
  spiral: 30,
} as const;
const TOTAL_WEIGHT =
  GROUP_WEIGHTS.grid + GROUP_WEIGHTS.slide + GROUP_WEIGHTS.spiral;

export const MAX_SPIRAL_ARTWORKS = 40;

export type HomepageArtworkGroups<T> = {
  grid: T[];
  slide: T[];
  spiral: T[];
};

type GroupCounts = {
  grid: number;
  slide: number;
  spiral: number;
};

function allocateGroupCounts(total: number): GroupCounts {
  if (total < 3) {
    return { grid: total, slide: 0, spiral: 0 };
  }

  const entries = Object.entries(GROUP_WEIGHTS) as [
    keyof GroupCounts,
    number,
  ][];
  const weighted = entries.map(([group, weight], priority) => {
    const exact = (total * weight) / TOTAL_WEIGHT;
    const count = Math.floor(exact);
    return { group, count, remainder: exact - count, priority };
  });
  let remainder = total - weighted.reduce((sum, item) => sum + item.count, 0);

  for (const item of [...weighted].sort(
    (left, right) =>
      right.remainder - left.remainder || left.priority - right.priority,
  )) {
    if (remainder <= 0) break;
    item.count += 1;
    remainder -= 1;
  }

  const counts = Object.fromEntries(
    weighted.map(({ group, count }) => [group, count]),
  ) as GroupCounts;

  if (counts.spiral > MAX_SPIRAL_ARTWORKS) {
    const remaining = total - MAX_SPIRAL_ARTWORKS;
    return {
      grid: Math.ceil(remaining / 2),
      slide: Math.floor(remaining / 2),
      spiral: MAX_SPIRAL_ARTWORKS,
    };
  }

  return counts;
}

/**
 * Assign every featured cover to one homepage surface. The 33/29/30 weights
 * give the current 92-cover catalog a complete 16-card trailing grid after the
 * 12 opening cards and five-card runway; for larger catalogs, the spiral stays
 * capped at 40 covers and the remaining works are split evenly between grid
 * and slide. A catalog too small to populate all three areas stays in the grid.
 */
export function partitionHomepageArtworks<T>(
  artworks: readonly T[],
): HomepageArtworkGroups<T> {
  const counts = allocateGroupCounts(artworks.length);
  const gridEnd = counts.grid;
  const slideEnd = gridEnd + counts.slide;

  return {
    grid: artworks.slice(0, gridEnd),
    slide: artworks.slice(gridEnd, slideEnd),
    spiral: artworks.slice(slideEnd),
  };
}

export const homepageArtworkGroups =
  partitionHomepageArtworks(featuredArtworks);
