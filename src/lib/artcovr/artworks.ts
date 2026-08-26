import curatedPublic from "./curated-public.json" with { type: "json" };
import ownerPicksJson from "./owner-picks.json" with { type: "json" };
import curatedReview from "#staging-catalog" with { type: "json" };
import stagingIntroJson from "#staging-intro" with { type: "json" };
import productionIntroJson from "./production-intro.json" with { type: "json" };
import { selectPublicCatalog } from "./catalog-visibility.ts";
import {
  orderByDiversityRank,
  relatedVisualSlugs,
  spreadByVisualCluster,
  visualLabelSearchTerms,
} from "./visual-index.ts";

export { visualIndex, getVisualEntry, getVisualStyleLabel } from "./visual-index.ts";

export type Artwork = {
  id: string;
  slug: string;
  title: string;
  image: string;
  alt: string;
  description: string;
  category: string;
  moodTags: string[];
  editionAvailable?: number | null;
  editionTotal?: number | null;
  licenseLabel?: string | null;
  saleMode: "exclusive" | "repeatable" | null;
  priceCents: number | null;
  rightsApproved: boolean;
  published: boolean;
  accentColor?: string;
  /**
   * Owner display tier. Only "featured" works may appear on the home page;
   * "archive" works live on the archive page. Optional because the private
   * staging catalog predates the field — see `artworkTier` for the fail-open
   * default that keeps staging previews whole.
   */
  tier?: "featured" | "archive";
};

/**
 * Tier accessor with the staging default: a record without a tier (the private
 * review catalog) counts as featured so staging previews render everything.
 * Public records always carry an explicit tier from the projection.
 */
export function artworkTier(artwork: Artwork): "featured" | "archive" {
  return artwork.tier ?? "featured";
}

/**
 * The private staging selection preserves the owner's 100-image launch review.
 * Public production routes must use `artworks`, which includes only rows that
 * passed both rights and publication approval.
 */
export const isPrivateStaging =
  process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1";

/**
 * The unapproved review catalog may exist ONLY inside explicit private-staging
 * builds. The conditional below is statically resolvable (NEXT_PUBLIC_* env is
 * inlined at build time), so production bundles tree-shake the entire
 * curated-review.json module: no unapproved slug, title, or image URL may ship
 * in any public asset. scripts/catalog/verify-export-isolation.ts enforces
 * this against the built export on every production build.
 */
/*
 * The catalog JSON is validated at generation time (catalog-projection.ts /
 * catalog-import.ts enforce sale modes, prices, and approval gates before a
 * row can be projected), so the cast below is backed by a real pipeline gate.
 * `satisfies` cannot be used here: TypeScript widens JSON string fields like
 * saleMode to `string`, which fails against the literal union the moment the
 * catalog is populated — the exact launch state.
 */
export const stagingArtworks: Artwork[] = isPrivateStaging
  ? (curatedReview as Artwork[])
  : [];
const approvedPublicArtworks: Artwork[] = selectPublicCatalog(
  curatedPublic as Artwork[],
);
/**
 * Production catalog: strictly the rights- and publication-approved projection.
 * There is deliberately NO fallback to the staging review catalog — an empty
 * approved catalog must render an empty public storefront, never leak
 * unapproved review works into public pages, the sitemap, or search indexing.
 * The staging catalog is reachable only through the explicit
 * NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING=1 owner-review flag.
 */
export const artworks = approvedPublicArtworks;

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

/**
 * Owner-selected covers, hand-picked from the approved catalog. These lead the
 * grid; everything else follows. This is a presentation preference only — it
 * confers no rights or publication state, and a slug listed here that is not in
 * the approved catalog is simply ignored rather than promoted into view.
 */
export const ownerPickSlugs: readonly string[] = ownerPicksJson as string[];

/**
 * Palette-spread traversal from visual-index.json, which keeps the colour cast
 * a viewer actually reads from repeating in neighbouring grid cells while still
 * using the image-vector diversity rank to order works within a palette. Falls
 * back to the raw vector traversal, then to the category round-robin: the
 * private staging catalog is not in the index, and a partially indexed catalog
 * would produce a half-sorted grid.
 */
function spreadForDisplay(items: readonly Artwork[]) {
  if (items.length === 0) return [];
  return (
    spreadByVisualCluster(items) ??
    orderByDiversityRank(items) ??
    balanceDisplayOrder(items)
  );
}

/**
 * Display order: owner picks first, then the rest of the catalog. Both blocks
 * are palette-spread independently, so the picks do not open on a run of one
 * colour and the tail still reads as varied rather than as the leftovers.
 */
export function orderForDisplay(items: readonly Artwork[]) {
  const picked = new Set(ownerPickSlugs);
  const leading = items.filter((artwork) => picked.has(artwork.slug));
  if (leading.length === 0) return spreadForDisplay(items);

  const trailing = items.filter((artwork) => !picked.has(artwork.slug));
  return [...spreadForDisplay(leading), ...spreadForDisplay(trailing)];
}

/** Keep the cobalt cover in the fourth desktop row instead of the opening row. */
function deferCobaltCover(ordered: Artwork[]) {
  const cobaltIndex = ordered.findIndex(
    (artwork) => artwork.slug === "electric-cobalt-minimalist",
  );
  const destinationIndex = 14;
  if (cobaltIndex >= 0 && ordered.length > destinationIndex) {
    const swapped = [...ordered];
    const temp = swapped[cobaltIndex];
    swapped[cobaltIndex] = swapped[destinationIndex];
    swapped[destinationIndex] = temp;
    return swapped;
  }
  return ordered;
}

export const displayArtworks = (() => {
  const ordered = orderForDisplay(
    isPrivateStaging ? stagingArtworks : artworks,
  );
  return deferCobaltCover(ordered);
})();

/**
 * The home-page catalog: featured-tier works only, palette-spread through the
 * same display ordering as the full list. The archive page, search, product
 * routes and the sitemap keep using `displayArtworks`, which spans every
 * published tier — the owner's rule is that archive works stay reachable and
 * searchable, just never on the front page.
 */
export const featuredArtworks = deferCobaltCover(
  orderForDisplay(
    (isPrivateStaging ? stagingArtworks : artworks).filter(
      (artwork) => artworkTier(artwork) === "featured",
    ),
  ),
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
    // Machine visual labels (fastText task vocabularies) so archive queries
    // like "minimalism", "film noir shadowy", or "foggy" reach the catalog.
    ...visualLabelSearchTerms(artwork.slug),
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

/**
 * Intro preference slugs reference staging works, so the defaults may only
 * exist in private-staging builds; production folds this to an empty list and
 * relies on the category-priority fallback.
 */
export const stagingIntroSlugs: readonly string[] = isPrivateStaging
  ? (stagingIntroJson as string[])
  : [];
/**
 * Owner-curated intro covers for production. Unlike the staging intro list,
 * this set ships in every public build and is deliberately chosen for
 * visibility (brightness/contrast) and category spread so the preloader never
 * opens on a near-black or flat cover that reads as a loading failure.
 */
export const productionIntroSlugs: readonly string[] = !isPrivateStaging
  ? (productionIntroJson as string[])
  : [];

export function pickIntroArtworks(
  items: readonly Artwork[] = displayArtworks,
  count = 6,
  preferredIntroSlugs: readonly string[] = isPrivateStaging
    ? stagingIntroSlugs
    : productionIntroSlugs,
) {
  if (items.length <= count) return [...items];

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

/**
 * Visually nearest works that are actually displayable. Related slugs come
 * from the committed visual index, but only works present in the current
 * display catalog may be linked: a pruned or unapproved slug must never
 * surface as a related work.
 */
export function getRelatedArtworks(slug: string, count = 4) {
  const related: Artwork[] = [];
  for (const relatedSlug of relatedVisualSlugs(slug, count * 2)) {
    if (relatedSlug === slug) continue;
    const artwork = getArtworkBySlug(relatedSlug);
    if (!artwork) continue;
    related.push(artwork);
    if (related.length >= count) break;
  }
  return related;
}

/**
 * Static export requires every dynamic route to emit at least one path.
 * With an empty public catalog we emit a single sentinel slug whose page
 * resolves to notFound(), keeping the export valid without publishing any
 * unapproved artwork URL.
 */
export function getStaticCatalogParams(): { slug: string }[] {
  if (displayArtworks.length === 0) return [{ slug: "catalog-pending" }];
  return displayArtworks.map((artwork) => ({ slug: artwork.slug }));
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
