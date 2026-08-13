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
export const artworks = selectPublicCatalog(curatedPublic satisfies Artwork[]);
export const isPrivateStaging =
  process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1";
export const displayArtworks = isPrivateStaging ? stagingArtworks : artworks;

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
