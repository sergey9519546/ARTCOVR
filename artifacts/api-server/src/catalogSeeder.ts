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
import {
  matchingStripePriceCandidates,
  productsForArtwork,
  selectStripePriceCandidate,
  type StripePriceCandidate,
} from "./stripeCatalog";

export async function seedStripeCatalog() {
  const existingProducts = await listStripeProducts();
  const catalog = getPublicCatalog();
  let createdProducts = 0;
  let createdPrices = 0;
  let duplicateProductArtworkIds = 0;
  let duplicatePriceArtworkIds = 0;
  let checkoutReady = 0;

  for (const artwork of catalog) {
    if (artwork.priceCents === null || artwork.saleMode === null) continue;

    let artworkProducts = productsForArtwork(existingProducts, artwork.id);
    if (!artworkProducts.length) {
      const product = await createStripeProduct(
        {
          name: artwork.title,
          description: artwork.title,
          metadata: {
            artwork_id: artwork.id,
            artwork_slug: artwork.slug,
            sale_mode: artwork.saleMode,
            included_credits: String(commerceConfig.includedCreditsPerCover),
          },
        },
        `artcovr-product-${artwork.id}`,
      );
      existingProducts.push(product);
      artworkProducts = [product];
      createdProducts++;
    }
    if (artworkProducts.length > 1) duplicateProductArtworkIds++;

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
    const matchingCandidates = matchingStripePriceCandidates(
      artwork,
      candidates,
    );
    if (matchingCandidates.length > 1) duplicatePriceArtworkIds++;

    let selected = selectStripePriceCandidate(artwork, candidates);
    if (!selected) {
      const product = artworkProducts[0];
      const price = await createStripePrice(
        {
          productId: product.id,
          amountCents: artwork.priceCents,
          currency: commerceConfig.currency,
          metadata: {
            artwork_id: artwork.id,
            artwork_slug: artwork.slug,
          },
        },
        `artcovr-price-${artwork.id}-${commerceConfig.currency}-${artwork.priceCents}`,
      );
      selected = { product, price };
      createdPrices++;
    }

    const defaultPrice =
      typeof selected.product.default_price === "string"
        ? selected.product.default_price
        : selected.product.default_price?.id;
    if (defaultPrice !== selected.price.id) {
      await updateStripeProduct(selected.product.id, {
        defaultPrice: selected.price.id,
      });
    }
    checkoutReady++;
  }

  return {
    total: catalog.length,
    checkoutReady,
    createdProducts,
    createdPrices,
    duplicateProductArtworkIds,
    duplicatePriceArtworkIds,
  };
}