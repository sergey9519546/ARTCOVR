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
        artworkId: "art-a",
        artworkSlug: "alpha",
        amountCents: 1_000,
        status: "refunded",
        paidAt: new Date("2026-09-02T12:00:00.000Z"),
        refundedAt: new Date("2026-09-08T12:00:00.000Z"),
      },
      {
        artworkId: "art-b",
        artworkSlug: "beta",
        amountCents: 2_000,
        status: "paid",
        paidAt: new Date("2026-09-03T12:00:00.000Z"),
        refundedAt: null,
      },
      {
        artworkId: "art-c",
        artworkSlug: "gamma",
        amountCents: 3_000,
        status: "refunded",
        paidAt: new Date("2026-08-01T12:00:00.000Z"),
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
        createdAt: new Date("2026-09-02T12:00:00.000Z"),
      },
      {
        artworkId: "art-b",
        eventType: "product_viewed",
        createdAt: new Date("2026-09-03T12:00:00.000Z"),
      },
      {
        artworkId: "art-c",
        eventType: "product_viewed",
        createdAt: new Date("2026-09-04T12:00:00.000Z"),
      },
      {
        artworkId: "art-a",
        eventType: "product_viewed",
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
      },
      {
        artworkId: "art-a",
        eventType: "checkout_started",
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
      },
      {
        artworkId: "art-b",
        eventType: "checkout_started",
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