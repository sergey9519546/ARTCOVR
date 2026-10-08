import type Stripe from "stripe";
import type { PublicCatalogArtwork } from "./catalog";
import {
  listStripePrices,
  listStripeProducts,
} from "./stripeClient";
import {
  selectCreditUnitPriceCandidate,
  productsForArtwork,
  selectStripePriceCandidate,
  type StripePriceCandidate,
} from "./stripeCatalog";

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
  const artworkProducts = productsForArtwork(products, artwork.id);

  if (!artworkProducts.length) {
    throw new StripeCatalogError(
      `No Stripe product is configured for artwork ${artwork.slug}.`,
    );
  }

  const candidates: StripePriceCandidate[] = (
    await Promise.all(
      artworkProducts.map(async (product) =>
        (await listStripePrices(product.id)).map((price) => ({
          product,
          price,
        })),
      ),
    )
  ).flat();
  const selected = selectStripePriceCandidate(
    artwork,
    candidates,
  );

  if (!selected) {
    throw new StripeCatalogError(
      `No matching Stripe price is configured for artwork ${artwork.slug}.`,
    );
  }

  return selected.price;
}

export async function getStripePriceForCreditUnit(): Promise<Stripe.Price> {
  const products = await listStripeProducts();
  const creditProducts = products.filter(
    (product) =>
      product.metadata.artcovr_product_type === "image_generation_credit",
  );

  if (!creditProducts.length) {
    throw new StripeCatalogError(
      "No Stripe product is configured for generation credits.",
    );
  }

  const candidates: StripePriceCandidate[] = (
    await Promise.all(
      creditProducts.map(async (product) =>
        (await listStripePrices(product.id)).map((price) => ({
          product,
          price,
        })),
      ),
    )
  ).flat();
  const selected = selectCreditUnitPriceCandidate(candidates);

  if (!selected) {
    throw new StripeCatalogError(
      "No active one-time Stripe price matches the configured generation credit price.",
    );
  }

  return selected.price;
}