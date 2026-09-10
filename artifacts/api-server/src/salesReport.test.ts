import assert from "node:assert/strict";
import test from "node:test";
import { buildOwnerSalesReport } from "./salesReport";

const range = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-09-11T00:00:00.000Z"),
};

test("owner sales report aggregates verified payments, refunds, credits, and funnel rates", () => {
  const report = buildOwnerSalesReport({
    range,
    orders: [
      {
        id: "order-a",
        artworkId: "art-a",
        artworkSlug: "alpha",
        amountCents: 1_000,
        refundedCents: 1_000,
        status: "refunded",
        paidAt: new Date("2026-09-02T12:00:00.000Z"),
        refundedAt: new Date("2026-09-08T12:00:00.000Z"),
      },
      {
        id: "order-b",
        artworkId: "art-b",
        artworkSlug: "beta",
        amountCents: 2_000,
        refundedCents: 0,
        status: "paid",
        paidAt: new Date("2026-09-03T12:00:00.000Z"),
        refundedAt: null,
      },
      {
        id: "order-c",
        artworkId: "art-c",
        artworkSlug: "gamma",
        amountCents: 3_000,
        refundedCents: 3_000,
        status: "refunded",
        paidAt: new Date("2026-08-01T12:00:00.000Z"),
        refundedAt: new Date("2026-09-05T12:00:00.000Z"),
      },
    ],
    refundEvents: [
      {
        orderId: "order-a",
        artworkId: "art-a",
        artworkSlug: "alpha",
        amountCents: 1_000,
        refundedAt: new Date("2026-09-08T12:00:00.000Z"),
      },
      {
        orderId: "order-c",
        artworkId: "art-c",
        artworkSlug: "gamma",
        amountCents: 3_000,
        refundedAt: new Date("2026-09-05T12:00:00.000Z"),
      },
    ],
    ledgerEntries: [
      {
        artworkId: "art-a",
        artworkSlug: "alpha",
        entryType: "grant",
        amount: 4,
        createdAt: new Date("2026-09-02T12:00:00.000Z"),
      },
      {
        artworkId: "art-a",
        artworkSlug: "alpha",
        entryType: "spend",
        amount: -1,
        createdAt: new Date("2026-09-03T12:00:00.000Z"),
      },
      {
        artworkId: "art-a",
        artworkSlug: "alpha",
        entryType: "release",
        amount: 1,
        createdAt: new Date("2026-09-04T12:00:00.000Z"),
      },
      {
        artworkId: "art-c",
        artworkSlug: "gamma",
        entryType: "revoke",
        amount: -3,
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
      },
    ],
    funnelEvents: [
      {
        artworkId: "art-a",
        eventType: "product_viewed",
        orderId: null,
        createdAt: new Date("2026-09-02T12:00:00.000Z"),
      },
      {
        artworkId: "art-b",
        eventType: "product_viewed",
        orderId: null,
        createdAt: new Date("2026-09-03T12:00:00.000Z"),
      },
      {
        artworkId: "art-c",
        eventType: "product_viewed",
        orderId: null,
        createdAt: new Date("2026-09-04T12:00:00.000Z"),
      },
      {
        artworkId: "art-a",
        eventType: "product_viewed",
        orderId: null,
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
      },
      {
        artworkId: "art-a",
        eventType: "checkout_started",
        orderId: "order-a",
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
      },
      {
        artworkId: "art-b",
        eventType: "checkout_started",
        orderId: "order-b",
        createdAt: new Date("2026-09-06T12:00:00.000Z"),
      },
    ],
  });

  assert.deepEqual(report.summary, {
    paidOrders: 2,
    grossRevenueCents: 3_000,
    refunds: 2,
    refundedCents: 4_000,
    netRevenueCents: -1_000,
  });
  assert.deepEqual(report.credits, {
    granted: 4,
    spent: 1,
    released: 1,
    revoked: 3,
  });
  assert.deepEqual(report.funnel, {
    productViews: 4,
    checkoutStarts: 2,
    paidOrders: 2,
    checkoutRate: 0.5,
    paidRate: 1,
  });
  assert.deepEqual(
    report.topArtworks.map((artwork) => ({
      slug: artwork.artworkSlug,
      purchases: artwork.purchases,
      gross: artwork.grossRevenueCents,
      refunded: artwork.refundedCents,
      credits: artwork.creditsUsed,
    })),
    [
      { slug: "beta", purchases: 1, gross: 2_000, refunded: 0, credits: 0 },
      { slug: "alpha", purchases: 1, gross: 1_000, refunded: 1_000, credits: 1 },
      { slug: "gamma", purchases: 0, gross: 0, refunded: 3_000, credits: 0 },
    ],
  );
  assert.deepEqual(report.range, { from: "2026-09-01", to: "2026-09-10" });
});

test("owner sales report does not create a false funnel for an empty period", () => {
  const report = buildOwnerSalesReport({
    range,
    orders: [],
    refundEvents: [],
    ledgerEntries: [],
    funnelEvents: [],
  });

  assert.deepEqual(report.summary, {
    paidOrders: 0,
    grossRevenueCents: 0,
    refunds: 0,
    refundedCents: 0,
    netRevenueCents: 0,
  });
  assert.deepEqual(report.funnel, {
    productViews: 0,
    checkoutStarts: 0,
    paidOrders: 0,
    checkoutRate: 0,
    paidRate: 0,
  });
  assert.deepEqual(report.topArtworks, []);
});

test("owner sales report counts partial refunds from refund events", () => {
  const report = buildOwnerSalesReport({
    range,
    orders: [
      {
        id: "partial-order",
        artworkId: "art-partial",
        artworkSlug: "partial",
        amountCents: 5_000,
        refundedCents: 2_000,
        status: "paid",
        paidAt: new Date("2026-09-04T12:00:00.000Z"),
        refundedAt: null,
      },
    ],
    refundEvents: [
      {
        orderId: "partial-order",
        artworkId: "art-partial",
        artworkSlug: "partial",
        amountCents: 1_250,
        refundedAt: new Date("2026-09-07T12:00:00.000Z"),
      },
      {
        orderId: "partial-order",
        artworkId: "art-partial",
        artworkSlug: "partial",
        amountCents: 750,
        refundedAt: new Date("2026-09-08T12:00:00.000Z"),
      },
    ],
    ledgerEntries: [],
    funnelEvents: [],
  });

  assert.deepEqual(report.summary, {
    paidOrders: 1,
    grossRevenueCents: 5_000,
    refunds: 2,
    refundedCents: 2_000,
    netRevenueCents: 3_000,
  });
});

test("funnel paid conversion follows linked checkout cohorts, not all payments in the date range", () => {
  const report = buildOwnerSalesReport({
    range,
    orders: [
      {
        id: "cohort-paid",
        artworkId: "art-cohort",
        artworkSlug: "cohort",
        amountCents: 1_000,
        refundedCents: 0,
        status: "paid",
        paidAt: new Date("2026-09-04T12:00:00.000Z"),
        refundedAt: null,
      },
      {
        id: "cohort-unpaid",
        artworkId: "art-cohort",
        artworkSlug: "cohort",
        amountCents: 1_000,
        refundedCents: 0,
        status: "paid",
        paidAt: new Date("2026-09-12T12:00:00.000Z"),
        refundedAt: null,
      },
      {
        id: "untracked-paid",
        artworkId: "art-other",
        artworkSlug: "other",
        amountCents: 1_000,
        refundedCents: 0,
        status: "paid",
        paidAt: new Date("2026-09-05T12:00:00.000Z"),
        refundedAt: null,
      },
    ],
    refundEvents: [],
    ledgerEntries: [],
    funnelEvents: [
      {
        eventType: "product_viewed",
        artworkId: "art-cohort",
        orderId: null,
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
      },
      {
        eventType: "checkout_started",
        artworkId: "art-cohort",
        orderId: "cohort-paid",
        createdAt: new Date("2026-09-05T12:01:00.000Z"),
      },
      {
        eventType: "checkout_started",
        artworkId: "art-cohort",
        orderId: "cohort-unpaid",
        createdAt: new Date("2026-09-05T12:02:00.000Z"),
      },
    ],
  });

  assert.equal(report.funnel.productViews, 1);
  assert.equal(report.funnel.checkoutStarts, 2);
  assert.equal(report.funnel.paidOrders, 1);
  assert.equal(report.funnel.paidRate, 0.5);
});