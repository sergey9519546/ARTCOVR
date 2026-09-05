import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import type {
  PublicCatalogArtwork,
} from "./catalog";
import {
  buildStripeCatalogCleanupReport,
  type StripeCatalogSnapshot,
} from "./stripeCatalogCleanup";

const artwork: PublicCatalogArtwork = {
  id: "art_cleanup_test",
  slug: "cleanup-test",
  title: "Cleanup Test",
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
    description: artwork.title,
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

function price(id: string, productId: string, created: number): Stripe.Price {
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
    metadata: { artwork_id: artwork.id },
    nickname: null,
    product: productId,
    recurring: null,
    tax_behavior: "unspecified",
    tiers_mode: null,
    transform_quantity: null,
    type: "one_time",
    unit_amount: artwork.priceCents,
    unit_amount_decimal: null,
  };
}

function snapshot(
  products: Stripe.Product[],
  pricesByProduct: Map<string, Stripe.Price[]>,
): StripeCatalogSnapshot {
  return {
    products,
    pricesByProduct,
    checkoutSessionIds: [],
    stripeAccountMode: "unknown",
    checkoutReferences: [],
    paymentLinkReferences: [],
    defaultPriceReferences: [],
    historicalOrders: [],
  };
}

test("cleanup report chooses the checkout canonical and eligible duplicates", () => {
  const canonicalProduct = product("prod_old", 1, "price_old");
  const duplicateProduct = product("prod_duplicate", 2);
  const report = buildStripeCatalogCleanupReport(
    snapshot(
      [canonicalProduct, duplicateProduct],
      new Map([
        [canonicalProduct.id, [price("price_old", canonicalProduct.id, 1)]],
        [
          duplicateProduct.id,
          [price("price_duplicate", duplicateProduct.id, 2)],
        ],
      ]),
    ),
    [artwork],
    "dry_run",
  );

  assert.equal(report.readiness.readyArtworkCount, 1);
  assert.equal(report.artworks[0]?.canonicalProductId, canonicalProduct.id);
  assert.equal(report.artworks[0]?.canonicalPriceId, "price_old");
  assert.deepEqual(report.artworks[0]?.redundantPriceIds, ["price_duplicate"]);
  assert.deepEqual(report.artworks[0]?.deactivatablePriceIds, [
    "price_duplicate",
  ]);
  assert.deepEqual(report.artworks[0]?.deactivatableProductIds, [
    duplicateProduct.id,
  ]);
});

test("cleanup report blocks duplicate prices used by live Stripe objects", () => {
  const canonicalProduct = product("prod_old", 1, "price_old");
  const duplicateProduct = product("prod_duplicate", 2);
  const duplicatePrice = price(
    "price_duplicate",
    duplicateProduct.id,
    2,
  );
  const report = buildStripeCatalogCleanupReport(
    {
      ...snapshot(
        [canonicalProduct, duplicateProduct],
        new Map([
          [canonicalProduct.id, [price("price_old", canonicalProduct.id, 1)]],
          [duplicateProduct.id, [duplicatePrice]],
        ]),
      ),
      checkoutSessionIds: ["cs_open"],
      stripeAccountMode: "live",
      checkoutReferences: [
        {
          kind: "checkout_session",
          objectId: "cs_open",
          priceId: duplicatePrice.id,
          productId: duplicateProduct.id,
          active: true,
          historical: false,
        },
      ],
      historicalOrders: [
        {
          id: "order_historical",
          artworkId: artwork.id,
          status: "paid",
          stripeCheckoutSessionId: "cs_complete",
          stripePaymentIntentId: "pi_historical",
        },
      ],
    },
    [artwork],
    "dry_run",
  );

  assert.deepEqual(report.artworks[0]?.deactivatablePriceIds, []);
  assert.deepEqual(report.artworks[0]?.blockedPrices, [
    {
      id: duplicatePrice.id,
      reasons: ["open_checkout_session"],
    },
  ]);
  assert.equal(report.referenceCounts.checkoutSessions, 1);
  assert.equal(report.referenceCounts.historicalOrders, 1);
  assert.equal(report.historicalOrders[0]?.checkoutSessionFound, false);
  assert.equal(
    report.historicalOrders[0]?.checkoutSessionDiagnosis,
    "missing_from_connected_account",
  );
  assert.deepEqual(report.reconciliation.unresolvedOrderIds, [
    "order_historical",
  ]);
});

test("historical checkout sessions are reported but do not block cleanup", () => {
  const canonicalProduct = product("prod_old", 1, "price_old");
  const duplicateProduct = product("prod_duplicate", 2);
  const duplicatePrice = price(
    "price_duplicate",
    duplicateProduct.id,
    2,
  );
  const report = buildStripeCatalogCleanupReport(
    {
      ...snapshot(
        [canonicalProduct, duplicateProduct],
        new Map([
          [canonicalProduct.id, [price("price_old", canonicalProduct.id, 1)]],
          [duplicateProduct.id, [duplicatePrice]],
        ]),
      ),
      checkoutSessionIds: ["cs_complete"],
      stripeAccountMode: "live",
      checkoutReferences: [
        {
          kind: "checkout_session",
          objectId: "cs_complete",
          priceId: duplicatePrice.id,
          productId: duplicateProduct.id,
          active: false,
          historical: true,
        },
      ],
      historicalOrders: [
        {
          id: "order_historical",
          artworkId: artwork.id,
          status: "paid",
          stripeCheckoutSessionId: "cs_complete",
          stripePaymentIntentId: "pi_historical",
        },
      ],
    },
    [artwork],
    "dry_run",
  );

  assert.deepEqual(report.artworks[0]?.deactivatablePriceIds, [
    duplicatePrice.id,
  ]);
  assert.equal(report.referenceCounts.checkoutSessions, 1);
  assert.equal(report.historicalOrders[0]?.checkoutSessionFound, true);
  assert.equal(report.historicalOrders[0]?.checkoutSessionDiagnosis, "found");
});

test("cleanup report identifies test-mode orders as stale when the account is live", () => {
  const report = buildStripeCatalogCleanupReport(
    {
      ...snapshot([], new Map()),
      stripeAccountMode: "live",
      historicalOrders: [
        {
          id: "order_stale_test",
          artworkId: artwork.id,
          status: "expired",
          stripeCheckoutSessionId: "cs_test_stale",
          stripePaymentIntentId: null,
        },
      ],
    },
    [artwork],
    "dry_run",
  );

  assert.equal(
    report.historicalOrders[0]?.checkoutSessionDiagnosis,
    "stale_test_data",
  );
  assert.deepEqual(report.reconciliation.unmatchedCheckoutSessionOrderIds, [
    "order_stale_test",
  ]);
  assert.deepEqual(report.reconciliation.staleTestDataOrderIds, [
    "order_stale_test",
  ]);
  assert.deepEqual(report.reconciliation.unresolvedOrderIds, []);
});