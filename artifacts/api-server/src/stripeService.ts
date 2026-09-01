import type Stripe from "stripe";
import type { PublicCatalogArtwork } from "./catalog";
import {
  listStripePrices,
  listStripeProducts,
} from "./stripeClient";

export class StripeCatalogError extends Error {
  readonly code = "stripe_price_missing";

  constructor(message: string) {
    super(message);
    this.name = "StripeCatalogError";
  }
}

export async function getStripePriceForArtwork(
  artwork: PublicCatalogArtwork,
): Promise<Stripe.Price> {
  const products = await listStripeProducts();
  const product = products.find(
    (candidate) => candidate.metadata.artwork_id === artwork.id,
  );

  if (!product) {
    throw new StripeCatalogError(
      `No Stripe product is configured for artwork ${artwork.slug}.`,
    );
  }

  const prices = await listStripePrices(product.id);
  const price = prices.find(
    (candidate) =>
      candidate.currency === "usd" &&
      candidate.unit_amount === artwork.priceCents,
  );

  if (!price) {
    throw new StripeCatalogError(
      `No matching Stripe price is configured for artwork ${artwork.slug}.`,
    );
  }

  return price;
}