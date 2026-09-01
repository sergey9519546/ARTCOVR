import curatedPublic from "../../artifacts/artcovr/src/lib/artcovr/curated-public.json" with {
  type: "json",
};
import commerceConfig from "../../artifacts/artcovr/src/lib/artcovr/commerce-config.json" with {
  type: "json",
};
import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";

type CatalogArtwork = {
  id: string;
  slug: string;
  title: string;
  description: string;
  priceCents: number | null;
  saleMode: "exclusive" | "repeatable" | null;
  rightsApproved: boolean;
  published: boolean;
};

const catalog = (curatedPublic as CatalogArtwork[]).filter(
  (artwork) =>
    artwork.rightsApproved &&
    artwork.published &&
    artwork.priceCents !== null &&
    artwork.saleMode !== null,
);

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  const existingProducts = new Map<string, Stripe.Product>();

  for await (const product of stripe.products.list({
    active: true,
    limit: 100,
  })) {
    const artworkId = product.metadata.artwork_id;
    if (artworkId) existingProducts.set(artworkId, product);
  }

  for (const [index, artwork] of catalog.entries()) {
    if (artwork.priceCents === null || artwork.saleMode === null) continue;
    const existing = existingProducts.get(artwork.id);
    const product =
      existing ??
      (await stripe.products.create({
        name: artwork.title,
        description: artwork.description,
        metadata: {
          artwork_id: artwork.id,
          artwork_slug: artwork.slug,
          sale_mode: artwork.saleMode,
          included_credits: String(commerceConfig.includedCreditsPerCover),
        },
      }));

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      type: "one_time",
      limit: 100,
    });
    let price = prices.data.find(
      (candidate) =>
        candidate.currency === commerceConfig.currency &&
        candidate.unit_amount === artwork.priceCents,
    );

    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: artwork.priceCents,
        currency: commerceConfig.currency,
        metadata: {
          artwork_id: artwork.id,
          artwork_slug: artwork.slug,
        },
      });
      await stripe.products.update(product.id, { default_price: price.id });
    }

    console.log(
      `[${index + 1}/${catalog.length}] ${artwork.slug} → ${product.id} / ${price.id}`,
    );
  }

  console.log(`Seeded ${catalog.length} ARTCOVR products.`);
}

seedProducts().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});