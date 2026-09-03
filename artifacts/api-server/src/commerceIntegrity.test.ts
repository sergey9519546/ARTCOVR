import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
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
import { checkoutReturnUrls } from "./routes/commerce";

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

test("simultaneous exclusive reservations create only one active order", async () => {
  const suffix = randomUUID();
  const artworkId = `concurrent-${suffix}`;
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
  const artworkId = `guest-claim-${suffix}`;
  const orderId = `order-guest-${suffix}`;
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
  const artworkId = `expired-${suffix}`;
  const orderId = `order-expired-${suffix}`;

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
  const artworkId = `paid-conflict-${suffix}`;
  const soldOrderId = `order-sold-${suffix}`;
  const lateOrderId = `order-late-${suffix}`;
  const sessionId = `cs_${suffix}`;
  const paymentIntentId = `pi_${suffix}`;
  const eventId = `evt_${suffix}`;
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
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
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
    assert.equal(webhook?.status, "processed");
  } finally {
    await db
      .delete(artcovrCreditLedger)
      .where(eq(artcovrCreditLedger.orderId, lateOrderId));
    await db
      .delete(artcovrWebhookEvents)
      .where(eq(artcovrWebhookEvents.id, eventId));
    await db
      .delete(artcovrOrders)
      .where(
        and(
          eq(artcovrOrders.artworkId, artworkId),
          inArray(artcovrOrders.id, [soldOrderId, lateOrderId]),
        ),
      );
  }
});