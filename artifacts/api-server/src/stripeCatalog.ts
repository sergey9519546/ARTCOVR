import type Stripe from "stripe";
import type { PublicCatalogArtwork } from "./catalog";
import { commerceConfig } from "./commerce-config";

export type StripePriceCandidate = {
  product: Stripe.Product;
  price: Stripe.Price;
};

export function productsForArtwork(
  products: Stripe.Product[],
  artworkId: string,
): Stripe.Product[] {
  return products
    .filter((product) => product.metadata.artwork_id === artworkId)
    .sort(
      (left, right) =>
        left.created - right.created || left.id.localeCompare(right.id),
    );
}

function defaultPriceId(product: Stripe.Product): string | null {
  if (typeof product.default_price === "string") return product.default_price;
  return product.default_price?.id ?? null;
}

export function matchingStripePriceCandidates(
  artwork: PublicCatalogArtwork,
  candidates: StripePriceCandidate[],
): StripePriceCandidate[] {
  return candidates
    .filter(
      ({ price }) =>
        price.active &&
        price.type === "one_time" &&
        price.currency === commerceConfig.currency &&
        price.unit_amount === artwork.priceCents,
    )
    .sort((left, right) => {
      const leftIsDefault = defaultPriceId(left.product) === left.price.id;
      const rightIsDefault = defaultPriceId(right.product) === right.price.id;
      if (leftIsDefault !== rightIsDefault) return leftIsDefault ? -1 : 1;
      return (
        left.product.created - right.product.created ||
        left.product.id.localeCompare(right.product.id) ||
        left.price.created - right.price.created ||
        left.price.id.localeCompare(right.price.id)
      );
    });
}

export function selectStripePriceCandidate(
  artwork: PublicCatalogArtwork,
  candidates: StripePriceCandidate[],
): StripePriceCandidate | undefined {
  return matchingStripePriceCandidates(artwork, candidates)[0];
}
