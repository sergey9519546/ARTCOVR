import { getPublicCatalog } from "./catalog";
import { commerceConfig } from "./commerce-config";
import { getUncachableStripeClient } from "./stripeClient";
import type Stripe from "stripe";

export async function seedStripeCatalog() {
  const stripe = await getUncachableStripeClient();
  const existingProducts = new Map<string, Stripe.Product>();

  for await (const product of stripe.products.list({
    active: true,
    limit: 100,
  })) {
    const artworkId = product.metadata.artwork_id;
    if (artworkId) existingProducts.set(artworkId, product);
  }

  let createdProducts = 0;
  let createdPrices = 0;
  for (const artwork of getPublicCatalog()) {
    if (artwork.priceCents === null || artwork.saleMode === null) continue;

    let product = existingProducts.get(artwork.id);
    if (!product) {
      product = await stripe.products.create({
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

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      type: "one_time",
      limit: 100,
    });
    const matchingPrice = prices.data.find(
      (price) =>
        price.currency === commerceConfig.currency &&
        price.unit_amount === artwork.priceCents,
    );

    if (!matchingPrice) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: artwork.priceCents,
        currency: commerceConfig.currency,
        metadata: {
          artwork_id: artwork.id,
          artwork_slug: artwork.slug,
        },
      });
      await stripe.products.update(product.id, { default_price: price.id });
      createdPrices++;
    }
  }

  return {
    total: getPublicCatalog().length,
    createdProducts,
    createdPrices,
  };
}