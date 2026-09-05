import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrOrders,
  artcovrWebhookEvents,
  db,
} from "@workspace/db";
import {
  checkoutReservationMs,
  claimGuestPurchases,
  createOrderValues,
  expireStaleExclusiveReservations,
  fulfillCheckoutSession,
} from "./commerceService";
import {
  checkoutReturnUrls,
  createCheckoutHandler,
} from "./routes/commerce";
import { getPublicCatalog } from "./catalog";
import { StripeCheckoutModeError } from "./stripeClient";

function orderValues(input: {
  id: string;
  artworkId: string;
  idempotencyKey: string;
  status?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  reservationExpiresAt?: Date;
  clerkUserId?: string | null;
  customerEmail?: string | null;
  saleMode?: "exclusive" | "repeatable";
}) {
  return {
    ...createOrderValues({
      id: input.id,
      clerkUserId:
        input.clerkUserId === undefined
          ? `user_${input.id}`
          : input.clerkUserId,
      customerEmail: input.customerEmail,
      artworkId: input.artworkId,
      artworkSlug: `slug-${input.artworkId}`,
      amountCents: 10_000,
      saleMode: input.saleMode ?? "exclusive",
      idempotencyKey: input.idempotencyKey,
      reservationExpiresAt:
        input.reservationExpiresAt ??
        new Date(Date.now() + checkoutReservationMs),
    }),
    status: input.status ?? "reserved",
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId,
  };
}

test("checkout return URLs use the configured public origin, never a forwarded host", () => {
  const urls = checkoutReturnUrls(
    "midnight-cover",
    "https://artcovr.example",
  );

  assert.equal(
    urls.successUrl,
    "https://artcovr.example/checkout/midnight-cover?status=success&session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(
    urls.cancelUrl,
    "https://artcovr.example/checkout/midnight-cover?status=cancelled",
  );
  assert.equal(urls.successUrl.includes("forwarded"), false);
});

test("a checkout mode mismatch preserves an expired, unpaid order and emits a diagnosis", async () => {
  const artwork = getPublicCatalog().find(
    (candidate) => candidate.saleMode === "repeatable",
  );
  assert.ok(artwork);
  const idempotencyKey = randomUUID();
  const rejectedSessionId = `cs_test_rejected_${idempotencyKey}`;
  const diagnoses: Array<Record<string, unknown>> = [];
  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    const auth = Object.assign(
      () => ({ userId: null, tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as unknown as { auth: typeof auth }).auth = auth;
    next();
  });
  testApp.post(
    "/checkout",
    createCheckoutHandler({
      getStripePriceForArtwork: async () =>
        ({ id: "price_test_mode_guard" }) as Stripe.Price,
      retrieveCheckoutSession: async () => {
        throw new Error("A new checkout must not retrieve an existing session.");
      },
      createCheckoutSession: async () => {
        throw new StripeCheckoutModeError(
          { id: rejectedSessionId, livemode: false },
          true,
        );
      },
      logCheckoutFailure: (details) => diagnoses.push(details),
    }),
  );
  const server = createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("The checkout test server did not expose a TCP address.");
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/checkout`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artworkId: artwork.id,
          email: "mode-mismatch@example.test",
          idempotencyKey,
        }),
      },
    );
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      code: "stripe_checkout_mode_mismatch",
      message: "Stripe could not open checkout. Please try again.",
    });

    const [order] = await db
      .select({ status: artcovrOrders.status })
      .from(artcovrOrders)
      .where(eq(artcovrOrders.id, orderId));
    assert.equal(order?.status, "expired");
  } finally {
    await db.delete(artcovrOrders).where(eq(artcovrOrders.id, orderId));
  }
});

test("a late conflicting exclusive payment is automatically refunded", async () => {
  const suffix = randomUUID();
  const artworkId = `test-mismatch-${suffix}`;
  const orderIds = [`order-a-${suffix}`, `order-b-${suffix}`];

  try {
    const results = await Promise.all(
      orderIds.map((id, index) =>
        db
          .insert(artcovrOrders)
          .values(
            orderValues({
              id,
              artworkId,
              idempotencyKey: `${index}${suffix.slice(1)}`,
            }),
          )
          .onConflictDoNothing()
          .returning({ id: artcovrOrders.id }),
      ),
    );

    assert.equal(results.flat().length, 1);
  } finally {
    await db
      .delete(artcovrOrders)
      .where(inArray(artcovrOrders.id, orderIds));
  }
});

test("guest purchases claim only for a matching verified email and move credits once", async () => {
  const suffix = randomUUID();
  const artworkId = `test-mismatch-${suffix}`;
  const orderId = `order-test-mismatch-${suffix}`;
  const ledgerId = `credit-guest-${suffix}`;
  const sourceId = `checkout:guest-${suffix}`;
  const buyerEmail = "buyer@example.test";

  try {
    await db.insert(artcovrOrders).values(
      orderValues({
        id: orderId,
        artworkId,
        idempotencyKey: suffix,
        status: "paid",
        clerkUserId: null,
        customerEmail: buyerEmail,
        saleMode: "repeatable",
      }),
    );
    await db.insert(artcovrCreditLedger).values({
      id: ledgerId,
      accountKey: buyerEmail,
      orderId,
      entryType: "grant",
      amount: 3,
      reason: "Cover purchase credit grant",
      sourceId,
    });

    const mismatched = await claimGuestPurchases("user-wrong", [
      "other@example.test",
    ]);
    assert.deepEqual(mismatched, { claimedOrderIds: [], claimedCredits: 0 });

    const claimed = await claimGuestPurchases("user-buyer", [
      "BUYER@EXAMPLE.TEST",
    ]);
    assert.deepEqual(claimed, {
      claimedOrderIds: [orderId],
      claimedCredits: 3,
    });

    const [claimedOrder] = await db
      .select({
        clerkUserId: artcovrOrders.clerkUserId,
        status: artcovrOrders.status,
      })
      .from(artcovrOrders)
      .where(eq(artcovrOrders.id, orderId));
    const [claimedCredit] = await db
      .select({ accountKey: artcovrCreditLedger.accountKey })
      .from(artcovrCreditLedger)
      .where(eq(artcovrCreditLedger.id, ledgerId));
    assert.deepEqual(claimedOrder, { clerkUserId: "user-buyer", status: "paid" });
    assert.deepEqual(claimedCredit, { accountKey: "user-buyer" });

    const competingClaim = await claimGuestPurchases("user-other", [
      buyerEmail,
    ]);
    const retry = await claimGuestPurchases("user-buyer", [buyerEmail]);
    assert.deepEqual(competingClaim, { claimedOrderIds: [], claimedCredits: 0 });
    assert.deepEqual(retry, { claimedOrderIds: [], claimedCredits: 0 });

    const grants = await db
      .select({
        accountKey: artcovrCreditLedger.accountKey,
        amount: artcovrCreditLedger.amount,
      })
      .from(artcovrCreditLedger)
      .where(eq(artcovrCreditLedger.orderId, orderId));
    assert.deepEqual(grants, [{ accountKey: "user-buyer", amount: 3 }]);
  } finally {
    await db
      .delete(artcovrCreditLedger)
      .where(eq(artcovrCreditLedger.id, ledgerId));
    await db.delete(artcovrOrders).where(eq(artcovrOrders.id, orderId));
  }
});

test("expired exclusive reservations are released before a new checkout", async () => {
  const suffix = randomUUID();
  const artworkId = `test-mismatch-${suffix}`;
  const orderId = `order-test-mismatch-${suffix}`;

  try {
    await db.insert(artcovrOrders).values(
      orderValues({
        id: orderId,
        artworkId,
        idempotencyKey: suffix,
        reservationExpiresAt: new Date(Date.now() - 60_000),
      }),
    );

    const expired = await expireStaleExclusiveReservations(artworkId);
    assert.deepEqual(expired, [{ id: orderId }]);

    const [order] = await db
      .select({ status: artcovrOrders.status })
      .from(artcovrOrders)
      .where(eq(artcovrOrders.id, orderId));
    assert.equal(order?.status, "expired");
  } finally {
    await db.delete(artcovrOrders).where(eq(artcovrOrders.id, orderId));
  }
});

test("a late conflicting exclusive payment is automatically refunded", async () => {
  const suffix = randomUUID();
  const artworkId = `test-mismatch-${suffix}`;
  const soldOrderId = `order-sold-${suffix}`;
  const lateOrderId = `order-late-${suffix}`;
  const sessionId = `cs_live_${suffix}`;
  const paymentIntentId = `pi_${suffix}`;
  const eventId = `evt_live_${suffix}`;
  const refundId = `re_${suffix}`;
  let refundCalls = 0;

  try {
    await db.insert(artcovrOrders).values([
      orderValues({
        id: soldOrderId,
        artworkId,
        idempotencyKey: randomUUID(),
        status: "paid",
        stripePaymentIntentId: `pi_sold_${suffix}`,
      }),
      orderValues({
        id: lateOrderId,
        artworkId,
        idempotencyKey: randomUUID(),
        status: "expired",
        stripeCheckoutSessionId: sessionId,
        reservationExpiresAt: new Date(Date.now() - 60_000),
      }),
    ]);

    const event = {
      id: eventId,
      livemode: false,
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          livemode: false,
          payment_status: "paid",
          payment_intent: paymentIntentId,
          customer: "cus_test",
          customer_details: { email: "buyer@example.test" },
        },
      },
    } as Stripe.Event;

    await fulfillCheckoutSession(event, {
      refundPaymentIntent: async (input, idempotencyKey) => {
        refundCalls += 1;
        assert.equal(input.paymentIntentId, paymentIntentId);
        assert.equal(input.orderId, lateOrderId);
        assert.equal(idempotencyKey, `exclusive-conflict:${lateOrderId}`);
        return { id: refundId } as Stripe.Refund;
      },
    });
    await fulfillCheckoutSession(event, {
      refundPaymentIntent: async () => {
        throw new Error("duplicate webhook must not refund twice");
      },
    });

    const [lateOrder] = await db
      .select()
      .from(artcovrOrders)
      .where(eq(artcovrOrders.id, lateOrderId));
    assert.equal(refundCalls, 1);
    assert.equal(lateOrder?.status, "refunded_conflict");
    assert.equal(lateOrder?.stripeRefundId, refundId);
    assert.ok(lateOrder?.refundedAt);

    const credits = await db
      .select({ id: artcovrCreditLedger.id })
      .from(artcovrCreditLedger)
      .where(eq(artcovrCreditLedger.orderId, lateOrderId));
    assert.deepEqual(credits, []);

    const [webhook] = await db
      .select({ status: artcovrWebhookEvents.status })
      .from(artcovrWebhookEvents)
      .where(eq(artcovrWebhookEvents.id, eventId));

    assert.equal(order?.status, "reserved");
    assert.equal(webhook?.status, "rejected");
  } finally {
    await db.delete(artcovrWebhookEvents).where(eq(artcovrWebhookEvents.id, eventId));
    await db.delete(artcovrOrders).where(eq(artcovrOrders.id, orderId));
  }
});
