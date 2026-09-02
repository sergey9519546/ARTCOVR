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
  createOrderValues,
  expireStaleExclusiveReservations,
  fulfillCheckoutSession,
} from "./commerceService";

function orderValues(input: {
  id: string;
  artworkId: string;
  idempotencyKey: string;
  status?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  reservationExpiresAt?: Date;
}) {
  return {
    ...createOrderValues({
      id: input.id,
      clerkUserId: `user_${input.id}`,
      artworkId: input.artworkId,
      artworkSlug: `slug-${input.artworkId}`,
      amountCents: 10_000,
      saleMode: "exclusive",
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