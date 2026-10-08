import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type Stripe from "stripe";
import { eq, inArray } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrCreditPackPurchases,
  artcovrRefundEvents,
  artcovrWebhookEvents,
  db,
} from "@workspace/db";
import { fulfillCheckoutSession } from "./commerceService";
import {
  getPurchaseCreditBalance,
  listUserCreditActivity,
  releasePurchaseCredit,
  spendPurchaseCredit,
} from "./creditService";

async function fixture(credits = 3) {
  const suffix = randomUUID();
  const id = `credit_pack_${suffix}`;
  const userId = `credit-pack-user-${suffix}`;
  const sessionId = `cs_credit_pack_${suffix}`;
  const paymentIntentId = `pi_credit_pack_${suffix}`;
  const eventIds: string[] = [];
  await db.insert(artcovrCreditPackPurchases).values({
    id,
    clerkUserId: userId,
    idempotencyKey: randomUUID(),
    stripeCheckoutSessionId: sessionId,
    stripePaymentIntentId: paymentIntentId,
    credits,
    amountCents: credits * 150,
    currency: "usd",
    status: "reserved",
    reservationExpiresAt: new Date(Date.now() + 30 * 60_000),
  });

  const sessionEvent = (
    eventId: string,
    type: "checkout.session.completed" | "checkout.session.async_payment_succeeded" =
      "checkout.session.completed",
    overrides: Record<string, unknown> = {},
  ) => ({
    id: eventId,
    type,
    livemode: false,
    data: {
      object: {
        id: sessionId,
        mode: "payment",
        livemode: false,
        client_reference_id: id,
        metadata: {
          purchase_type: "image_generation_credit",
          credit_pack_purchase_id: id,
          credits: String(credits),
          unit_amount_cents: "150",
          currency: "usd",
        },
        amount_total: credits * 150,
        currency: "usd",
        payment_status: "paid",
        payment_intent: paymentIntentId,
        customer: `cus_${suffix}`,
        created: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    },
  }) as unknown as Stripe.Event;

  async function fulfill(event: Stripe.Event) {
    eventIds.push(event.id);
    await fulfillCheckoutSession(event, {
      expectedLivemode: false,
      refundPaymentIntent: async () => {
        throw new Error("Credit pack lifecycle tests must not issue refunds.");
      },
    });
  }

  async function balance() {
    return getPurchaseCreditBalance(db, userId, id);
  }

  async function cleanup() {
    await db.delete(artcovrRefundEvents).where(eq(artcovrRefundEvents.orderId, id));
    await db.delete(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, id));
    await db.delete(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, id));
    if (eventIds.length) {
      await db
        .delete(artcovrWebhookEvents)
        .where(inArray(artcovrWebhookEvents.id, eventIds));
    }
  }

  return {
    id,
    userId,
    paymentIntentId,
    sessionEvent,
    fulfill,
    balance,
    cleanup,
  };
}

test("credit pack fulfillment grants once and includes safe account activity", async () => {
  const f = await fixture(4);
  try {
    const event = f.sessionEvent(`evt_credit_pack_${randomUUID()}`);
    await f.fulfill(event);
    await f.fulfill(event);
    await f.fulfill(
      f.sessionEvent(
        `evt_credit_pack_async_${randomUUID()}`,
        "checkout.session.async_payment_succeeded",
      ),
    );

    assert.equal(await f.balance(), 4);
    const [purchase] = await db
      .select()
      .from(artcovrCreditPackPurchases)
      .where(eq(artcovrCreditPackPurchases.id, f.id));
    assert.equal(purchase.status, "paid");

    const history = await listUserCreditActivity(db, f.userId);
    assert.equal(history.activities.length, 1);
    assert.equal(history.activities[0].purchaseId, f.id);
    assert.equal(history.activities[0].label, "Credits added");
    assert.equal(history.activities[0].amount, 4);
    assert.equal("reason" in history.activities[0], false);
  } finally {
    await f.cleanup();
  }
});

test("a mismatched credit checkout cannot grant credits", async () => {
  const f = await fixture(2);
  const eventId = `evt_credit_pack_mismatch_${randomUUID()}`;
  try {
    await f.fulfill(
      f.sessionEvent(eventId, "checkout.session.completed", {
        amount_total: 1,
      }),
    );
    assert.equal(await f.balance(), 0);
    const [purchase] = await db
      .select()
      .from(artcovrCreditPackPurchases)
      .where(eq(artcovrCreditPackPurchases.id, f.id));
    assert.equal(purchase.status, "reserved");
    const [event] = await db
      .select()
      .from(artcovrWebhookEvents)
      .where(eq(artcovrWebhookEvents.id, eventId));
    assert.equal(event.status, "rejected");
  } finally {
    await f.cleanup();
  }
});

test("partial refunds preserve credits and a full refund revokes only the remainder", async () => {
  const f = await fixture(3);
  const partialEventId = `evt_credit_pack_partial_${randomUUID()}`;
  const fullEventId = `evt_credit_pack_refund_${randomUUID()}`;
  try {
    await f.fulfill(f.sessionEvent(`evt_credit_pack_paid_${randomUUID()}`));
    const partialRefund = {
      id: `re_credit_pack_partial_${randomUUID()}`,
      amount: 150,
      created: Math.floor(Date.now() / 1000),
    };
    await f.fulfill({
      id: partialEventId,
      type: "charge.refunded",
      livemode: false,
      data: {
        object: {
          payment_intent: f.paymentIntentId,
          livemode: false,
          refunded: false,
          amount: 450,
          amount_refunded: 150,
          refunds: { data: [partialRefund] },
        },
      },
    } as unknown as Stripe.Event);
    assert.equal(await f.balance(), 3);

    const fullRefund = {
      id: `re_credit_pack_full_${randomUUID()}`,
      amount: 300,
      created: Math.floor(Date.now() / 1000),
    };
    await f.fulfill({
      id: fullEventId,
      type: "charge.refunded",
      livemode: false,
      data: {
        object: {
          payment_intent: f.paymentIntentId,
          livemode: false,
          refunded: true,
          amount: 450,
          amount_refunded: 450,
          refunds: { data: [partialRefund, fullRefund] },
        },
      },
    } as unknown as Stripe.Event);

    assert.equal(await f.balance(), 0);
    const [purchase] = await db
      .select()
      .from(artcovrCreditPackPurchases)
      .where(eq(artcovrCreditPackPurchases.id, f.id));
    assert.equal(purchase.status, "refunded");
    assert.equal(purchase.refundedCents, 450);
  } finally {
    await f.cleanup();
  }
});

test("failed generations release a paid pack credit once", async () => {
  const f = await fixture(2);
  const generationId = randomUUID();
  try {
    await f.fulfill(f.sessionEvent(`evt_credit_pack_paid_${randomUUID()}`));
    await db.transaction((tx) =>
      spendPurchaseCredit(tx, {
        userId: f.userId,
        purchaseId: f.id,
        generationId,
      }),
    );
    assert.equal(await f.balance(), 1);
    const release = () =>
      db.transaction((tx) =>
        releasePurchaseCredit(tx, {
          userId: f.userId,
          purchaseId: f.id,
          generationId,
          reason: "Deterministic test failure",
        }),
      );
    await Promise.all([release(), release()]);
    assert.equal(await f.balance(), 2);
  } finally {
    await f.cleanup();
  }
});
