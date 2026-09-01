import type Stripe from "stripe";
import type { PublicCatalogArtwork } from "./catalog";
import { getUncachableStripeClient } from "./stripeClient";

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
  const stripe = await getUncachableStripeClient();
  const products = await stripe.products.search({
    query: `metadata['artwork_id']:'${artwork.id}' AND active:'true'`,
  });
  const product = products.data[0];

  if (!product) {
    throw new StripeCatalogError(
      `No Stripe product is configured for artwork ${artwork.slug}.`,
    );
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    type: "one_time",
    limit: 100,
  });
  const price = prices.data.find(
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