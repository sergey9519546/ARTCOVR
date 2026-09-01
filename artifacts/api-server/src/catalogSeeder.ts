import { getPublicCatalog } from "./catalog";
import { commerceConfig } from "./commerce-config";
import type Stripe from "stripe";
import {
  createStripePrice,
  createStripeProduct,
  listStripePrices,
  listStripeProducts,
  updateStripeProduct,
} from "./stripeClient";

export async function seedStripeCatalog() {
  const existingProducts = new Map<string, Stripe.Product>();

  for (const product of await listStripeProducts()) {
    const artworkId = product.metadata.artwork_id;
    if (artworkId) existingProducts.set(artworkId, product);
  }

  let createdProducts = 0;
  let createdPrices = 0;
  for (const artwork of getPublicCatalog()) {
    if (artwork.priceCents === null || artwork.saleMode === null) continue;

    let product = existingProducts.get(artwork.id);
    if (!product) {
      product = await createStripeProduct({
        name: artwork.title,
        description: artwork.title,
        metadata: {
          artwork_id: artwork.id,
          artwork_slug: artwork.slug,
          sale_mode: artwork.saleMode,
          included_credits: String(commerceConfig.includedCreditsPerCover),
        },
      });
      existingProducts.set(artwork.id, product);
      createdProducts++;
    }

    const prices = await listStripePrices(product.id);
    const matchingPrice = prices.find(
      (price) =>
        price.currency === commerceConfig.currency &&
        price.unit_amount === artwork.priceCents,
    );

    if (!matchingPrice) {
      const price = await createStripePrice({
        productId: product.id,
        amountCents: artwork.priceCents,
        currency: commerceConfig.currency,
        metadata: {
          artwork_id: artwork.id,
          artwork_slug: artwork.slug,
        },
      });
      await updateStripeProduct(product.id, { defaultPrice: price.id });
      createdPrices++;
    }
  }

  return {
    total: getPublicCatalog().length,
    createdProducts,
    createdPrices,
  };
}