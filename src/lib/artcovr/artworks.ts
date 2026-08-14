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
export const stagingArtworks = curatedReview satisfies Artwork[];
const approvedPublicArtworks = selectPublicCatalog(curatedPublic satisfies Artwork[]);
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

  const groups = new Map<string, Artwork[]>();
  for (const item of items) {
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }

  const categoryOrder = [...groups.keys()];
  const picked = new Set<string>();
  const selected: Artwork[] = [];

  for (const category of categoryOrder) {
    const candidate = groups.get(category)?.find((item) => !picked.has(item.id));
    if (!candidate) continue;
    picked.add(candidate.id);
    selected.push(candidate);
    if (selected.length >= count) return selected;
  }

  for (const item of items) {
    if (picked.has(item.id)) continue;
    picked.add(item.id);
    selected.push(item);
    if (selected.length >= count) return selected;
  }

  return [...selected];
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
