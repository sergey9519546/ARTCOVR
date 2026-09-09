import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerSalesHandler, parseSalesReportRange } from "./sales";

function responseRecorder() {
  let statusCode = 200;
  let payload: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    set() {
      return response;
    },
    json(value: unknown) {
      payload = value;
      return response;
    },
  };
  return {
    response,
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    },
  };
}

function request(userId: string, query: Record<string, string> = {}) {
  return {
    clerkUserId: userId,
    query,
    log: {
      error() {},
      warn() {},
    },
  };
}

test("sales route denies a signed-in customer before loading aggregates", async (context) => {
  const previous = process.env.ARTCOVR_CURATION_USER_IDS;
  process.env.ARTCOVR_CURATION_USER_IDS = "owner-1";
  context.after(() => {
    if (previous === undefined) delete process.env.ARTCOVR_CURATION_USER_IDS;
    else process.env.ARTCOVR_CURATION_USER_IDS = previous;
  });

  let loaded = false;
  const handler = createOwnerSalesHandler(async () => {
    loaded = true;
    throw new Error("must not load");
  });
  const recorder = responseRecorder();
  await handler(request("customer-1") as never, recorder.response as never);

  assert.equal(recorder.statusCode, 403);
  assert.deepEqual(recorder.payload, {
    code: "sales_forbidden",
    message: "Explicit owner or administrator access is required for sales reporting.",
  });
  assert.equal(loaded, false);
});

test("sales route returns aggregate data only for an allowlisted owner", async (context) => {
  const previous = process.env.ARTCOVR_CURATION_USER_IDS;
  process.env.ARTCOVR_CURATION_USER_IDS = "owner-1";
  context.after(() => {
    if (previous === undefined) delete process.env.ARTCOVR_CURATION_USER_IDS;
    else process.env.ARTCOVR_CURATION_USER_IDS = previous;
  });

  let receivedRange: { from: Date; to: Date } | undefined;
  const handler = createOwnerSalesHandler(async (range) => {
    receivedRange = range;
    return {
      range: { from: "2026-09-01", to: "2026-09-10" },
      summary: {
        paidOrders: 1,
        grossRevenueCents: 1_000,
        refunds: 0,
        refundedCents: 0,
        netRevenueCents: 1_000,
      },
      credits: { granted: 4, spent: 0, released: 0, revoked: 0 },
      funnel: {
        productViews: 2,
        checkoutStarts: 1,
        paidOrders: 1,
        checkoutRate: 0.5,
        paidRate: 1,
      },
      topArtworks: [
        {
          artworkId: "art-1",
          artworkSlug: "one",
          title: "One",
          purchases: 1,
          grossRevenueCents: 1_000,
          refundedCents: 0,
          creditsUsed: 0,
        },
      ],
    };
  });
  const recorder = responseRecorder();
  await handler(
    request("owner-1", { from: "2026-09-01", to: "2026-09-10" }) as never,
    recorder.response as never,
  );

  assert.equal(recorder.statusCode, 200);
  assert.equal(receivedRange?.from.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(receivedRange?.to.toISOString(), "2026-09-11T00:00:00.000Z");
  assert.equal("customerEmail" in (recorder.payload as object), false);
  assert.equal("stripePaymentIntentId" in (recorder.payload as object), false);
});

test("sales range rejects invalid and overly broad windows", () => {
  assert.equal(
    parseSalesReportRange(
      { from: "2026-09-10", to: "2026-09-01" },
      new Date("2026-09-15T12:00:00.000Z"),
    ),
    null,
  );
  assert.equal(
    parseSalesReportRange(
      { from: "2025-01-01", to: "2026-09-01" },
      new Date("2026-09-15T12:00:00.000Z"),
    ),
    null,
  );
});