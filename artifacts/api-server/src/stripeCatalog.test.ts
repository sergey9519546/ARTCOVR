import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import type { PublicCatalogArtwork } from "./catalog";
import {
  productsForArtwork,
  selectStripePriceCandidate,
  type StripePriceCandidate,
} from "./stripeCatalog";

const artwork: PublicCatalogArtwork = {
  id: "art_test",
  slug: "test-cover",
  title: "Test Cover",
  priceCents: 3_500,
  saleMode: "repeatable",
  rightsApproved: true,
  published: true,
};

function product(
  id: string,
  created: number,
  defaultPrice: string | null = null,
): Stripe.Product {
  return {
    id,
    object: "product",
    active: true,
    created,
    default_price: defaultPrice,
    description: null,
    images: [],
    livemode: false,
    marketing_features: [],
    metadata: { artwork_id: artwork.id },
    name: artwork.title,
    package_dimensions: null,
    shippable: null,
    statement_descriptor: null,
    tax_code: null,
    type: "service",
    unit_label: null,
    updated: created,
    url: null,
  };
}

function price(
  id: string,
  productId: string,
  amount: number,
  created: number,
): Stripe.Price {
  return {
    id,
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    created,
    currency: "usd",
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: {},
    nickname: null,
    product: productId,
    recurring: null,
    tax_behavior: "unspecified",
    tiers_mode: null,
    transform_quantity: null,
    type: "one_time",
    unit_amount: amount,
    unit_amount_decimal: null,
  };
}

test("checkout finds a valid price on any duplicate artwork product", () => {
  const staleProduct = product("prod_stale", 1, "price_stale");
  const readyProduct = product("prod_ready", 2, "price_ready");
  const candidates: StripePriceCandidate[] = [
    {
      product: staleProduct,
      price: price("price_stale", staleProduct.id, 1_000, 1),
    },
    {
      product: readyProduct,
      price: price("price_ready", readyProduct.id, 3_500, 2),
    },
  ];

  assert.equal(
    selectStripePriceCandidate(artwork, candidates)?.price.id,
    "price_ready",
  );
});

test("checkout prefers a matching default price when duplicates exist", () => {
  const olderProduct = product("prod_older", 1);
  const defaultProduct = product("prod_default", 2, "price_default");
  const candidates: StripePriceCandidate[] = [
    {
      product: olderProduct,
      price: price("price_older", olderProduct.id, 3_500, 1),
    },
    {
      product: defaultProduct,
      price: price("price_default", defaultProduct.id, 3_500, 2),
    },
  ];

  assert.equal(
    selectStripePriceCandidate(artwork, candidates)?.price.id,
    "price_default",
  );
});

test("artwork products are grouped deterministically", () => {
  const unrelated = product("prod_unrelated", 0);
  unrelated.metadata.artwork_id = "another_artwork";

  assert.deepEqual(
    productsForArtwork(
      [product("prod_newer", 2), unrelated, product("prod_older", 1)],
      artwork.id,
    ).map(({ id }) => id),
    ["prod_older", "prod_newer"],
  );
});
