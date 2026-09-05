import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import type { PublicCatalogArtwork } from "./catalog";
import {
  buildStripeCatalogCleanupReport,
  type StripeCatalogSnapshot,
} from "./stripeCatalogCleanup";
import { runStripeCatalogCleanupCli } from "./stripeCatalogCleanupCli";

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
  assert.deepEqual(report.artworks[0]?.defaultPriceActions, []);
  assert.deepEqual(report.progress, {
    status: "not_started",
    totalMutations: 2,
    completedMutations: 0,
    lastCompletedMutation: null,
  });
});

test("cleanup report clears a redundant default before deactivating its price", () => {
  const canonicalProduct = product("prod_canonical", 1, "price_canonical");
  const duplicateProduct = product("prod_duplicate", 2, "price_duplicate");
  const report = buildStripeCatalogCleanupReport(
    {
      ...snapshot(
        [canonicalProduct, duplicateProduct],
        new Map([
          [
            canonicalProduct.id,
            [price("price_canonical", canonicalProduct.id, 1)],
          ],
          [
            duplicateProduct.id,
            [price("price_duplicate", duplicateProduct.id, 2)],
          ],
        ]),
      ),
      defaultPriceReferences: [
        {
          kind: "default_price",
          objectId: duplicateProduct.id,
          priceId: "price_duplicate",
          productId: duplicateProduct.id,
          active: true,
          historical: false,
        },
      ],
    },
    [artwork],
    "dry_run",
  );

  assert.deepEqual(report.artworks[0]?.defaultPriceActions, [
    {
      productId: duplicateProduct.id,
      priceId: "price_duplicate",
      action: "clear",
      replacementPriceId: null,
      reasons: ["redundant_default_price"],
    },
  ]);
  assert.deepEqual(report.artworks[0]?.blockedPrices, []);
  assert.deepEqual(report.artworks[0]?.deactivatablePriceIds, [
    "price_duplicate",
  ]);
  assert.equal(report.readiness.protectedDuplicateDefaultPriceReferences, 0);
});

test("cleanup report blocks duplicate prices used by live Stripe objects", () => {
  const canonicalProduct = product("prod_old", 1, "price_old");
  const duplicateProduct = product("prod_duplicate", 2);
  const duplicatePrice = price("price_duplicate", duplicateProduct.id, 2);
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
      defaultPriceReferences: [
        {
          kind: "default_price",
          objectId: duplicateProduct.id,
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
      reasons: ["default_price_reference", "open_checkout_session"],
    },
  ]);
  assert.deepEqual(report.artworks[0]?.defaultPriceActions, [
    {
      productId: duplicateProduct.id,
      priceId: duplicatePrice.id,
      action: "protect",
      replacementPriceId: null,
      reasons: ["default_price_reference", "open_checkout_session"],
    },
  ]);
  assert.equal(report.readiness.protectedDuplicateDefaultPriceReferences, 1);
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
  assert.deepEqual(report.reconciliation.alerts, [
    {
      orderId: "order_historical",
      stripeCheckoutSessionId: "cs_complete",
      diagnosis: "missing_from_connected_account",
      severity: "error",
    },
  ]);
});

test("cleanup report distinguishes active, expired, and completed checkout protection", () => {
  const canonicalProduct = product("prod_old", 1, "price_old");
  const duplicateProduct = product("prod_duplicate", 2);
  const duplicatePrice = price("price_duplicate", duplicateProduct.id, 2);
  const report = buildStripeCatalogCleanupReport(
    {
      ...snapshot(
        [canonicalProduct, duplicateProduct],
        new Map([
          [canonicalProduct.id, [price("price_old", canonicalProduct.id, 1)]],
          [duplicateProduct.id, [duplicatePrice]],
        ]),
      ),
      checkoutSessionIds: ["cs_open", "cs_expired", "cs_complete"],
      checkoutSessionProtection: new Map([
        ["cs_open", "active"],
        ["cs_expired", "expired"],
        ["cs_complete", "completed"],
      ]),
      checkoutReferences: [
        {
          kind: "checkout_session",
          objectId: "cs_open",
          priceId: duplicatePrice.id,
          productId: duplicateProduct.id,
          active: true,
          historical: false,
          checkoutSessionProtectionStatus: "active",
        },
        {
          kind: "checkout_session",
          objectId: "cs_expired",
          priceId: duplicatePrice.id,
          productId: duplicateProduct.id,
          active: false,
          historical: true,
          checkoutSessionProtectionStatus: "expired",
        },
        {
          kind: "checkout_session",
          objectId: "cs_complete",
          priceId: duplicatePrice.id,
          productId: duplicateProduct.id,
          active: false,
          historical: true,
          checkoutSessionProtectionStatus: "completed",
        },
      ],
    },
    [artwork],
    "dry_run",
  );

  assert.deepEqual(report.referenceCounts.checkoutSessionProtection, {
    active: 1,
    expired: 1,
    completed: 1,
  });
  assert.deepEqual(report.artworks[0]?.deactivatablePriceIds, []);
  assert.deepEqual(report.artworks[0]?.blockedPrices, [
    {
      id: duplicatePrice.id,
      reasons: ["open_checkout_session"],
    },
  ]);
  assert.equal(report.artworks[0]?.canonicalProductId, canonicalProduct.id);
  assert.equal(report.artworks[0]?.canonicalPriceId, "price_old");
});

test("a fresh audit releases a duplicate after its checkout session expires", () => {
  const canonicalProduct = product("prod_old", 1, "price_old");
  const duplicateProduct = product("prod_duplicate", 2);
  const duplicatePrice = price("price_duplicate", duplicateProduct.id, 2);
  const products = [canonicalProduct, duplicateProduct];
  const pricesByProduct = new Map([
    [canonicalProduct.id, [price("price_old", canonicalProduct.id, 1)]],
    [duplicateProduct.id, [duplicatePrice]],
  ]);

  const activeReport = buildStripeCatalogCleanupReport(
    {
      ...snapshot(products, pricesByProduct),
      checkoutSessionIds: ["cs_checkout"],
      checkoutSessionProtection: new Map([["cs_checkout", "active"]]),
      checkoutReferences: [
        {
          kind: "checkout_session",
          objectId: "cs_checkout",
          priceId: duplicatePrice.id,
          productId: duplicateProduct.id,
          active: true,
          historical: false,
          checkoutSessionProtectionStatus: "active",
        },
      ],
    },
    [artwork],
    "dry_run",
  );
  assert.deepEqual(activeReport.artworks[0]?.deactivatablePriceIds, []);

  const expiredReport = buildStripeCatalogCleanupReport(
    {
      ...snapshot(products, pricesByProduct),
      checkoutSessionIds: ["cs_checkout"],
      checkoutSessionProtection: new Map([["cs_checkout", "expired"]]),
      checkoutReferences: [
        {
          kind: "checkout_session",
          objectId: "cs_checkout",
          priceId: duplicatePrice.id,
          productId: duplicateProduct.id,
          active: false,
          historical: true,
          checkoutSessionProtectionStatus: "expired",
        },
      ],
    },
    [artwork],
    "dry_run",
  );
  assert.deepEqual(expiredReport.artworks[0]?.deactivatablePriceIds, [
    duplicatePrice.id,
  ]);
  assert.deepEqual(expiredReport.artworks[0]?.deactivatableProductIds, [
    duplicateProduct.id,
  ]);
  assert.equal(expiredReport.artworks[0]?.canonicalProductId, canonicalProduct.id);
  assert.equal(expiredReport.artworks[0]?.canonicalPriceId, "price_old");
});

test("historical checkout sessions are reported but do not block cleanup", () => {
  const canonicalProduct = product("prod_old", 1, "price_old");
  const duplicateProduct = product("prod_duplicate", 2);
  const duplicatePrice = price("price_duplicate", duplicateProduct.id, 2);
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
  assert.deepEqual(report.reconciliation.alerts, [
    {
      orderId: "order_stale_test",
      stripeCheckoutSessionId: "cs_test_stale",
      diagnosis: "stale_test_data",
      severity: "warning",
    },
  ]);
});

function reconciliationReport(
  historicalOrders: StripeCatalogSnapshot["historicalOrders"],
) {
  return buildStripeCatalogCleanupReport(
    {
      ...snapshot([], new Map()),
      stripeAccountMode: "live",
      historicalOrders,
    },
    [],
    "dry_run",
  );
}

test("reconciliation CLI fails and diagnoses each unresolved order", async () => {
  const report = reconciliationReport([
    {
      id: "order_unknown_session",
      artworkId: artwork.id,
      status: "paid",
      stripeCheckoutSessionId: "cs_unknown_session",
      stripePaymentIntentId: "pi_unknown_session",
    },
    {
      id: "order_stale_test",
      artworkId: artwork.id,
      status: "expired",
      stripeCheckoutSessionId: "cs_test_stale",
      stripePaymentIntentId: null,
    },
  ]);
  const output: string[] = [];
  const diagnostics: string[] = [];

  const exitCode = await runStripeCatalogCleanupCli({
    args: ["--reconcile-only"],
    audit: async () => report,
    log: (message) => output.push(message),
    error: (message) => diagnostics.push(message),
  });

  assert.equal(exitCode, 2);
  assert.match(
    diagnostics.join("\n"),
    /Stripe reconciliation ERROR: order order_unknown_session \(missing_from_connected_account; checkout session cs_unknown_session; connected account mode live\)/,
  );
  assert.match(
    diagnostics.join("\n"),
    /Stripe reconciliation warning: order order_stale_test \(stale_test_data; checkout session cs_test_stale; connected account mode live\)/,
  );
  assert.match(
    diagnostics.join("\n"),
    /Stripe reconciliation failed: 1 unresolved live-order reference/,
  );
  assert.match(output[0] ?? "", /order_unknown_session/);
  assert.match(output[0] ?? "", /order_stale_test/);
});

test("reconciliation CLI succeeds for explicitly diagnosed stale test data", async () => {
  const report = reconciliationReport([
    {
      id: "order_stale_test",
      artworkId: artwork.id,
      status: "expired",
      stripeCheckoutSessionId: "cs_test_stale",
      stripePaymentIntentId: null,
    },
  ]);
  const output: string[] = [];
  const diagnostics: string[] = [];

  const exitCode = await runStripeCatalogCleanupCli({
    args: ["--reconcile-only"],
    audit: async () => report,
    log: (message) => output.push(message),
    error: (message) => diagnostics.push(message),
  });

  assert.equal(exitCode, 0);
  assert.match(
    output[0] ?? "",
    /"checkoutSessionDiagnosis": "stale_test_data"/,
  );
  assert.match(
    diagnostics.join("\n"),
    /Stripe reconciliation warning: order order_stale_test \(stale_test_data; checkout session cs_test_stale; connected account mode live\)/,
  );
  assert.doesNotMatch(diagnostics.join("\n"), /Stripe reconciliation failed/);
});

test("cleanup CLI reports resumable interruptions and passes a mutation budget", async () => {
  const report = {
    ...reconciliationReport([]),
    mode: "interrupted" as const,
    progress: {
      status: "interrupted" as const,
      totalMutations: 4,
      completedMutations: 2,
      lastCompletedMutation: {
        category: "price" as const,
        objectId: "price_duplicate",
      },
      interruptionReason:
        "Mutation limit reached after 2 of 4; rerun the cleanup to resume.",
    },
  };
  const diagnostics: string[] = [];
  let receivedMaxMutations: number | undefined;
  const exitCode = await runStripeCatalogCleanupCli({
    args: ["--confirm-deactivate", "--max-mutations", "2"],
    cleanup: async (options) => {
      receivedMaxMutations = options.maxMutations;
      options.onProgress?.(report.progress);
      return report;
    },
    log: () => {},
    error: (message) => diagnostics.push(message),
  });

  assert.equal(exitCode, 75);
  assert.equal(receivedMaxMutations, 2);
  assert.match(
    diagnostics.join("\n"),
    /Stripe catalog cleanup resumable interruption/,
  );
  assert.match(diagnostics.join("\n"), /last completed price\/price_duplicate/);
});

test("cleanup CLI reports completion separately from a dry run", async () => {
  const report = {
    ...reconciliationReport([]),
    mode: "deactivated" as const,
    progress: {
      status: "completed" as const,
      totalMutations: 0,
      completedMutations: 0,
      lastCompletedMutation: null,
    },
  };
  const diagnostics: string[] = [];
  const exitCode = await runStripeCatalogCleanupCli({
    args: ["--confirm-deactivate"],
    cleanup: async () => report,
    log: () => {},
    error: (message) => diagnostics.push(message),
  });

  assert.equal(exitCode, 0);
  assert.match(
    diagnostics.join("\n"),
    /Stripe catalog cleanup completed: 0\/0 mutations/,
  );
  assert.doesNotMatch(diagnostics.join("\n"), /Dry run only/);
});

test("cleanup CLI rejects an invalid mutation budget before running cleanup", async () => {
  let called = false;
  const diagnostics: string[] = [];
  const exitCode = await runStripeCatalogCleanupCli({
    args: ["--confirm-deactivate", "--max-mutations=0"],
    cleanup: async () => {
      called = true;
      throw new Error("cleanup should not run");
    },
    log: () => {},
    error: (message) => diagnostics.push(message),
  });

  assert.equal(exitCode, 1);
  assert.equal(called, false);
  assert.deepEqual(diagnostics, [
    "--max-mutations must be a positive integer.",
  ]);
});

test("cleanup CLI rejects a missing mutation budget value", async () => {
  let called = false;
  const diagnostics: string[] = [];
  const exitCode = await runStripeCatalogCleanupCli({
    args: ["--confirm-deactivate", "--max-mutations"],
    cleanup: async () => {
      called = true;
      throw new Error("cleanup should not run");
    },
    log: () => {},
    error: (message) => diagnostics.push(message),
  });

  assert.equal(exitCode, 1);
  assert.equal(called, false);
  assert.deepEqual(diagnostics, [
    "--max-mutations requires a positive integer.",
  ]);
});
