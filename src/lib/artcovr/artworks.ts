import curatedPublic from "./curated-public.json" with { type: "json" };
import curatedReview from "./curated-review.json" with { type: "json" };
import { selectPublicCatalog } from "./catalog-visibility.ts";

export type Artwork = {
  id: string;
  slug: string;
  title: string;
  image: string;
  alt: string;
  description: string;
  category: string;
  moodTags: string[];
  editionAvailable: number | null;
  editionTotal: number | null;
  licenseLabel: string | null;
  saleMode: "exclusive" | "repeatable" | null;
  priceCents: number | null;
  rightsApproved: boolean;
  published: boolean;
  accentColor: string;
};

/**
 * The private staging selection preserves the owner's 100-image launch review.
 * Public production routes must use `artworks`, which includes only rows that
 * passed both rights and publication approval.
 */
const curatedPublicTyped = curatedPublic as Artwork[];
const curatedReviewTyped = curatedReview as Artwork[];
export const stagingArtworks = curatedReviewTyped;
const approvedPublicArtworks = selectPublicCatalog(curatedPublicTyped);
export const artworks = approvedPublicArtworks.length > 0 ? approvedPublicArtworks : stagingArtworks;
export const isPrivateStaging =
  process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1";

export function balanceDisplayOrder<T extends { category: string }>(items: readonly T[]) {
  if (items.length < 2) return [...items];

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(item.category) ?? [];
    bucket.push(item);
    groups.set(item.category, bucket);
  }

  const ordered: T[] = [];
  const categoryOrder = [...groups.keys()];
  const maxDepth = Math.max(...[...groups.values()].map((group) => group.length));

  for (let index = 0; index < maxDepth; index += 1) {
    for (const category of categoryOrder) {
      const group = groups.get(category);
      const item = group?.[index];
      if (item) ordered.push(item);
    }
  }

  if (ordered.length === items.length) return ordered;
  return [...items];
}

export const displayArtworks = balanceDisplayOrder(
  isPrivateStaging ? stagingArtworks : artworks,
);

export function normalizeArtworkSearchValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildArtworkSearchText(artwork: Artwork) {
  return [
    artwork.title,
    artwork.slug,
    artwork.category,
    artwork.alt,
    artwork.description,
    artwork.accentColor,
    artwork.saleMode,
    artwork.licenseLabel,
    ...artwork.moodTags,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ");
}

export function searchArtworks(query: string, items: readonly Artwork[] = displayArtworks) {
  const normalized = normalizeArtworkSearchValue(query);
  if (!normalized) return [...items];

  const tokens = normalized.split(" ").filter(Boolean);
  return items.filter((artwork) => {
    const haystack = normalizeArtworkSearchValue(buildArtworkSearchText(artwork));
    return tokens.every((token) => haystack.includes(token));
  });
}

export function pickIntroArtworks(items: readonly Artwork[] = displayArtworks, count = 6) {
  if (items.length <= count) return [...items];

  const preferredIntroSlugs = [
    "cart-of-hours",
    "last-sock-on-the-line",
    "nesting-appliance",
    "transit-diagram",
    "corrupted-digital-dreamscape",
    "velvet-moss-surrealism",
  ];

  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const selected: Artwork[] = [];
  const seen = new Set<string>();

  for (const slug of preferredIntroSlugs) {
    const candidate = bySlug.get(slug);
    if (!candidate || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    selected.push(candidate);
    if (selected.length >= count) return selected;
  }

  const categoryPriority = [
    "Minimal / Abstract",
    "Graphic / Illustration / Print",
    "Surreal / Hybrid",
    "Mixed Media / Collage",
    "Material / Sculptural / Organic",
    "Painterly / Illustrative",
    "Digital / Computational",
  ];

  const fallback = [...items].sort((left, right) => {
    const leftCategoryIndex = categoryPriority.indexOf(left.category);
    const rightCategoryIndex = categoryPriority.indexOf(right.category);
    const categoryDelta = (leftCategoryIndex === -1 ? categoryPriority.length : leftCategoryIndex) -
      (rightCategoryIndex === -1 ? categoryPriority.length : rightCategoryIndex);
    if (categoryDelta !== 0) return categoryDelta;

    const leftMood = left.moodTags.join("|");
    const rightMood = right.moodTags.join("|");
    return leftMood.localeCompare(rightMood);
  });

  for (const item of fallback) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    selected.push(item);
    if (selected.length >= count) break;
  }

  return selected.slice(0, count);
}

export function getArtworkBySlug(slug: string) {
  return displayArtworks.find((artwork) => artwork.slug === slug);
}

export function getCheckoutTotal(priceCents: number | null) {
  return priceCents === null
    ? "Pricing pending owner approval"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(priceCents / 100);
}

export function isPromptReady(prompt: string) {
  return prompt.trim().length >= 8;
}

export function isCheckoutReady(artwork: Artwork) {
  return (
    artwork.rightsApproved &&
    artwork.published &&
    artwork.priceCents !== null &&
    artwork.saleMode !== null
  );
}
