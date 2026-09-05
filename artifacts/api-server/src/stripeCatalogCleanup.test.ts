import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type Stripe from "stripe";
import type { PublicCatalogArtwork } from "./catalog";
import {
  buildStripeCatalogCleanupReport,
  cleanupStripeCatalog,
  compareStripeCanonicalSelections,
  loadCatalogSnapshot,
  stripeCatalogCleanupIdempotencyKey,
  STRIPE_CATALOG_DEACTIVATION_CONFIRMATION,
  type StripeCatalogSnapshot,
} from "./stripeCatalogCleanup";
import { runStripeCatalogCleanupCli } from "./stripeCatalogCleanupCli";
import {
  acquireStripeCatalogCleanupLease,
  StripeCatalogCleanupLeaseError,
} from "./stripeCatalogCleanupLease";

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

  const afterReport = buildStripeCatalogCleanupReport(
    {
      ...snapshot(
        [
          canonicalProduct,
          { ...duplicateProduct, active: false, default_price: null },
        ],
        new Map([
          [
            canonicalProduct.id,
            [price("price_canonical", canonicalProduct.id, 1)],
          ],
          [
            duplicateProduct.id,
            [{ ...price("price_duplicate", duplicateProduct.id, 2), active: false }],
          ],
        ]),
      ),
    },
    [artwork],
    "dry_run",
  );
  assert.deepEqual(
    compareStripeCanonicalSelections(
      report.canonicalSelection.after,
      afterReport.canonicalSelection.after,
    ),
    {
      before: report.canonicalSelection.after,
      after: afterReport.canonicalSelection.after,
      changes: [],
    },
  );
});

test("an interrupted cleanup resumes from a fresh audit without repeating completed mutations", async () => {
  const canonicalProduct = product(
    "prod_resume_canonical",
    1,
    "price_resume_canonical",
  );
  let duplicateProduct = product(
    "prod_resume_duplicate",
    2,
    "price_resume_duplicate",
  );
  const canonicalPrice = price(
    "price_resume_canonical",
    canonicalProduct.id,
    1,
  );
  let duplicatePrice = price(
    "price_resume_duplicate",
    duplicateProduct.id,
    2,
  );
  const calls: Array<{
    category: "default_price" | "price" | "product";
    objectId: string;
    idempotencyKey: string | undefined;
  }> = [];

  const audit = async () =>
    buildStripeCatalogCleanupReport(
      {
        ...snapshot(
          [canonicalProduct, duplicateProduct],
          new Map([
            [canonicalProduct.id, [canonicalPrice]],
            [duplicateProduct.id, [duplicatePrice]],
          ]),
        ),
        defaultPriceReferences:
          duplicateProduct.default_price && duplicateProduct.active
            ? [
                {
                  kind: "default_price" as const,
                  objectId: duplicateProduct.id,
                  priceId: String(duplicateProduct.default_price),
                  productId: duplicateProduct.id,
                  active: true,
                  historical: false,
                },
              ]
            : [],
      },
      [artwork],
      "dry_run",
    );
  const dependencies = {
    audit,
    acquireLease: async () => ({
      details: {
        operationId: "test_resume",
        pid: null,
        acquiredAt: new Date(0).toISOString(),
        expiresAt: new Date(60_000).toISOString(),
      },
      refresh: async () => {},
      release: async () => {},
    }),
    updateProduct: async (
      productId: string,
      input: { defaultPrice?: string | null; active?: boolean },
      idempotencyKey?: string,
    ) => {
      calls.push({
        category: "default_price",
        objectId: productId,
        idempotencyKey,
      });
      duplicateProduct = {
        ...duplicateProduct,
        default_price: input.defaultPrice ?? null,
      };
      return duplicateProduct;
    },
    deactivatePrice: async (
      priceId: string,
      idempotencyKey?: string,
    ) => {
      calls.push({ category: "price", objectId: priceId, idempotencyKey });
      duplicatePrice = { ...duplicatePrice, active: false };
      return duplicatePrice;
    },
    deactivateProduct: async (
      productId: string,
      idempotencyKey?: string,
    ) => {
      calls.push({ category: "product", objectId: productId, idempotencyKey });
      duplicateProduct = { ...duplicateProduct, active: false };
      return duplicateProduct;
    },
  };

  const interrupted = await cleanupStripeCatalog(
    {
      confirmation: STRIPE_CATALOG_DEACTIVATION_CONFIRMATION,
      maxMutations: 1,
    },
    dependencies,
  );

  assert.equal(interrupted.mode, "interrupted");
  assert.deepEqual(interrupted.progress, {
    status: "interrupted",
    totalMutations: 3,
    completedMutations: 1,
    lastCompletedMutation: {
      category: "default_price",
      objectId: duplicateProduct.id,
    },
    interruptionReason:
      "Mutation limit reached after 1 of 3; rerun the cleanup to resume.",
  });
  assert.deepEqual(interrupted.deactivated?.defaultPrices, [
    {
      productId: duplicateProduct.id,
      priceId: duplicatePrice.id,
    },
  ]);

  const resumed = await cleanupStripeCatalog(
    {
      confirmation: STRIPE_CATALOG_DEACTIVATION_CONFIRMATION,
    },
    dependencies,
  );

  assert.equal(resumed.mode, "deactivated");
  assert.equal(resumed.progress.status, "completed");
  assert.equal(resumed.progress.totalMutations, 2);
  assert.equal(resumed.progress.completedMutations, 2);
  assert.deepEqual(resumed.deactivated, {
    prices: [duplicatePrice.id],
    products: [duplicateProduct.id],
    defaultPrices: [],
  });
  assert.deepEqual(calls, [
    {
      category: "default_price",
      objectId: duplicateProduct.id,
      idempotencyKey: stripeCatalogCleanupIdempotencyKey(
        "default_price",
        duplicateProduct.id,
      ),
    },
    {
      category: "price",
      objectId: duplicatePrice.id,
      idempotencyKey: stripeCatalogCleanupIdempotencyKey(
        "price",
        duplicatePrice.id,
      ),
    },
    {
      category: "product",
      objectId: duplicateProduct.id,
      idempotencyKey: stripeCatalogCleanupIdempotencyKey(
        "product",
        duplicateProduct.id,
      ),
    },
  ]);
});

test("the cleanup operation lease is exclusive and safely expires", async () => {
  const directory = await mkdtemp(join(tmpdir(), "artcovr-cleanup-lease-"));
  const leasePath = join(directory, "lease.json");
  let nowMs = Date.parse("2026-09-05T12:00:00.000Z");
  const now = () => new Date(nowMs);

  try {
    const first = await acquireStripeCatalogCleanupLease({
      leasePath,
      ttlMs: 1_000,
      operationId: "cleanup_first",
      pid: 101,
      now,
    });

    await assert.rejects(
      acquireStripeCatalogCleanupLease({
        leasePath,
        ttlMs: 1_000,
        operationId: "cleanup_second",
        pid: 202,
        now,
      }),
      (error: unknown) => {
        assert.ok(error instanceof StripeCatalogCleanupLeaseError);
        assert.deepEqual(error.activeOperation, first.details);
        return true;
      },
    );

    nowMs += 1_001;
    const second = await acquireStripeCatalogCleanupLease({
      leasePath,
      ttlMs: 1_000,
      operationId: "cleanup_second",
      pid: 202,
      now,
    });
    await first.release();
    await second.refresh();
    await second.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the cleanup CLI reports an active lease as retryable", async () => {
  const diagnostics: string[] = [];
  const activeOperation = {
    operationId: "cleanup_active",
    pid: 404,
    acquiredAt: "2026-09-05T12:00:00.000Z",
    expiresAt: "2026-09-05T12:30:00.000Z",
  };

  const exitCode = await runStripeCatalogCleanupCli({
    args: ["--confirm-deactivate"],
    cleanup: async () => {
      throw new StripeCatalogCleanupLeaseError(activeOperation);
    },
    log: () => {
      throw new Error("A busy cleanup must not emit a cleanup report.");
    },
    error: (message) => diagnostics.push(message),
  });

  assert.equal(exitCode, 75);
  assert.match(
    diagnostics.join("\n"),
    /cleanup already active: operation cleanup_active; pid 404; acquired 2026-09-05T12:00:00.000Z; lease expires 2026-09-05T12:30:00.000Z/,
  );
  assert.match(diagnostics.join("\n"), /Retry after the lease expires/);
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
  assert.deepEqual(report.canonicalSelection.changes, []);
  assert.equal(
    report.canonicalSelection.after[0]?.canonicalPriceId,
    canonicalProduct.default_price,
  );
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

test("canonical selection comparisons expose changed checkout IDs", () => {
  const before = [
    {
      artworkId: artwork.id,
      slug: artwork.slug,
      canonicalProductId: "prod_before",
      canonicalPriceId: "price_before",
    },
  ];
  const after = [
    {
      artworkId: artwork.id,
      slug: artwork.slug,
      canonicalProductId: "prod_after",
      canonicalPriceId: "price_after",
    },
  ];

  assert.deepEqual(compareStripeCanonicalSelections(before, after), {
    before,
    after,
    changes: [
      {
        artworkId: artwork.id,
        slug: artwork.slug,
        before: before[0],
        after: after[0],
      },
    ],
  });
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

for (const fixture of [
  {
    stripeStatus: "open",
    reportStatus: "active",
    protectsDuplicates: true,
  },
  {
    stripeStatus: "expired",
    reportStatus: "expired",
    protectsDuplicates: false,
  },
  {
    stripeStatus: "complete",
    reportStatus: "completed",
    protectsDuplicates: false,
  },
] as const) {
  test(`production snapshot mapping treats ${fixture.stripeStatus} Checkout sessions as ${fixture.reportStatus}`, async () => {
    const canonicalProduct = product(
      `prod_${fixture.stripeStatus}_canonical`,
      1,
      `price_${fixture.stripeStatus}_canonical`,
    );
    const duplicateProduct = product(
      `prod_${fixture.stripeStatus}_duplicate`,
      2,
    );
    const canonicalPrice = price(
      `price_${fixture.stripeStatus}_canonical`,
      canonicalProduct.id,
      1,
    );
    const duplicatePrices = [
      price(
        `price_${fixture.stripeStatus}_duplicate_a`,
        duplicateProduct.id,
        2,
      ),
      price(
        `price_${fixture.stripeStatus}_duplicate_b`,
        duplicateProduct.id,
        3,
      ),
    ];
    const checkoutSession = {
      id: `cs_${fixture.stripeStatus}_multi_line`,
      object: "checkout.session",
      livemode: false,
      status: fixture.stripeStatus,
      line_items: {
        object: "list",
        data: duplicatePrices.map(
          (stripePrice, index) =>
            ({
              id: `li_${fixture.stripeStatus}_${index}`,
              object: "item",
              price: stripePrice,
            }) as Stripe.LineItem,
        ),
        has_more: false,
        url: `/v1/checkout/sessions/cs_${fixture.stripeStatus}_multi_line/line_items`,
      },
    } as Stripe.Checkout.Session;

    const catalogSnapshot = await loadCatalogSnapshot({
      listProducts: async () => [canonicalProduct, duplicateProduct],
      listCheckoutSessions: async () => [checkoutSession],
      listPaymentLinks: async () => [],
      listPrices: async (productId) =>
        productId === canonicalProduct.id ? [canonicalPrice] : duplicatePrices,
      loadHistoricalOrders: async () => [],
    });
    const report = buildStripeCatalogCleanupReport(
      catalogSnapshot,
      [artwork],
      "dry_run",
    );

    assert.deepEqual(
      catalogSnapshot.checkoutSessionProtection,
      new Map([[checkoutSession.id, fixture.reportStatus]]),
    );
    assert.equal(catalogSnapshot.checkoutReferences.length, 2);
    assert.ok(
      catalogSnapshot.checkoutReferences.every(
        (reference) =>
          reference.checkoutSessionProtectionStatus === fixture.reportStatus,
      ),
    );
    assert.equal(report.referenceCounts.checkoutSessions, 1);
    assert.deepEqual(report.referenceCounts.checkoutSessionProtection, {
      active: fixture.reportStatus === "active" ? 1 : 0,
      expired: fixture.reportStatus === "expired" ? 1 : 0,
      completed: fixture.reportStatus === "completed" ? 1 : 0,
    });
    assert.deepEqual(
      report.artworks[0]?.deactivatablePriceIds,
      fixture.protectsDuplicates
        ? []
        : duplicatePrices.map((stripePrice) => stripePrice.id),
    );
    assert.deepEqual(
      report.artworks[0]?.blockedPrices.map((blocked) => blocked.id),
      fixture.protectsDuplicates
        ? duplicatePrices.map((stripePrice) => stripePrice.id)
        : [],
    );
    assert.equal(
      report.artworks[0]?.canonicalProductId,
      canonicalProduct.id,
    );
    assert.equal(report.artworks[0]?.canonicalPriceId, canonicalPrice.id);
  });
}

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
  stripeAccountMode: StripeCatalogSnapshot["stripeAccountMode"] = "live",
) {
  return buildStripeCatalogCleanupReport(
    {
      ...snapshot([], new Map()),
      stripeAccountMode,
      historicalOrders,
    },
    [],
    "dry_run",
  );
}

test("ambiguous Stripe account modes keep absent sessions unresolved", async () => {
  for (const accountMode of ["mixed", "unknown"] as const) {
    const missingOrderId = `order_missing_${accountMode}`;
    const ambiguousTestOrderId = `order_test_${accountMode}`;
    const report = reconciliationReport(
      [
        {
          id: missingOrderId,
          artworkId: artwork.id,
          status: "paid",
          stripeCheckoutSessionId: `cs_missing_${accountMode}`,
          stripePaymentIntentId: `pi_missing_${accountMode}`,
        },
        {
          id: ambiguousTestOrderId,
          artworkId: artwork.id,
          status: "expired",
          stripeCheckoutSessionId: `cs_test_${accountMode}`,
          stripePaymentIntentId: null,
        },
      ],
      accountMode,
    );
    const output: string[] = [];
    const diagnostics: string[] = [];

    assert.deepEqual(
      report.historicalOrders.map((order) => ({
        id: order.id,
        diagnosis: order.checkoutSessionDiagnosis,
      })),
      [
        {
          id: missingOrderId,
          diagnosis: "missing_from_connected_account",
        },
        {
          id: ambiguousTestOrderId,
          diagnosis: "missing_from_connected_account",
        },
      ],
    );
    assert.deepEqual(report.reconciliation.staleTestDataOrderIds, []);
    assert.deepEqual(report.reconciliation.unresolvedOrderIds, [
      missingOrderId,
      ambiguousTestOrderId,
    ]);
    assert.ok(
      report.reconciliation.alerts.every(
        (alert) =>
          alert.diagnosis === "missing_from_connected_account" &&
          alert.severity === "error",
      ),
    );

    const exitCode = await runStripeCatalogCleanupCli({
      args: ["--reconcile-only"],
      audit: async () => report,
      log: (message) => output.push(message),
      error: (message) => diagnostics.push(message),
    });

    assert.equal(exitCode, 2);
    assert.match(
      diagnostics.join("\n"),
      new RegExp(
        `Stripe reconciliation ERROR: order ${missingOrderId} \\(missing_from_connected_account; checkout session cs_missing_${accountMode}; connected account mode ${accountMode}\\)`,
      ),
    );
    assert.match(
      diagnostics.join("\n"),
      /Stripe reconciliation failed: 2 unresolved live-order reference/,
    );
    assert.doesNotMatch(
      diagnostics.join("\n"),
      /Stripe reconciliation warning/,
    );
    assert.match(output[0] ?? "", new RegExp(`"${accountMode}"`));
  }
});

test("reconciliation CLI accepts and reports an order without a Stripe session ID", async () => {
  const report = reconciliationReport([
    {
      id: "order_without_session",
      artworkId: artwork.id,
      status: "expired",
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
    },
  ]);
  const output: string[] = [];
  const diagnostics: string[] = [];

  assert.deepEqual(report.historicalOrders, [
    {
      id: "order_without_session",
      artworkId: artwork.id,
      status: "expired",
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      checkoutSessionFound: false,
      checkoutSessionDiagnosis: "missing_session_id",
    },
  ]);
  assert.deepEqual(report.reconciliation.unmatchedCheckoutSessionOrderIds, []);
  assert.deepEqual(report.reconciliation.staleTestDataOrderIds, []);
  assert.deepEqual(report.reconciliation.unresolvedOrderIds, []);
  assert.deepEqual(report.reconciliation.alerts, []);

  const exitCode = await runStripeCatalogCleanupCli({
    args: ["--reconcile-only"],
    audit: async () => report,
    log: (message) => output.push(message),
    error: (message) => diagnostics.push(message),
  });

  assert.equal(exitCode, 0);
  assert.match(output[0] ?? "", /"id": "order_without_session"/);
  assert.match(
    output[0] ?? "",
    /"checkoutSessionDiagnosis": "missing_session_id"/,
  );
  assert.doesNotMatch(
    diagnostics.join("\n"),
    /Stripe reconciliation (?:warning|ERROR|failed)/,
  );
});

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
