import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type Stripe from "stripe";
import { eq, inArray } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrCreditPackPurchases,
  artcovrOrders,
  artcovrRefundEvents,
  artcovrWebhookEvents,
  db,
} from "@workspace/db";
import { createOrderValues, fulfillCheckoutSession } from "./commerceService";
import {
  getPurchaseCreditBalance,
  listUserCreditActivity,
  releasePurchaseCredit,
  spendPurchaseCredit,
} from "./creditService";

async function fixture(credits = 3, paymentIntentStored = true) {
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
    stripePaymentIntentId: paymentIntentStored ? paymentIntentId : null,
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

  async function fulfill(
    event: Stripe.Event,
    retrieveSession: (id: string) => Promise<Stripe.Checkout.Session | null> = async () => null,
  ) {
    eventIds.push(event.id);
    await fulfillCheckoutSession(event, {
      expectedLivemode: false,
      retrieveCheckoutSessionForPaymentIntent: retrieveSession,
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
    sessionId,
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

function refundBeforeFulfillmentEvent(
  paymentIntentId: string,
  amount: number,
  overrides: Record<string, unknown> = {},
): Stripe.Event {
  return {
    id: `evt_early_refund_${randomUUID()}`,
    type: "charge.refunded",
    livemode: false,
    data: { object: {
      id: `ch_early_${randomUUID()}`,
      payment_intent: paymentIntentId,
      livemode: false,
      amount,
      currency: "usd",
      amount_refunded: amount,
      refunded: true,
      refunds: { data: [{ id: `re_early_${randomUUID()}`, amount, created: Math.floor(Date.now() / 1000) }] },
      ...overrides,
    } },
  } as unknown as Stripe.Event;
}

test("a full refund before Checkout fulfillment cannot grant pack credits on later deliveries", async () => {
  const f = await fixture(3, false);
  try {
    const completed = f.sessionEvent(`evt_early_paid_${randomUUID()}`, "checkout.session.completed", { status: "complete" });
    const canonical = completed.data.object as Stripe.Checkout.Session;
    let lookups = 0;
    const retrieve = async (pi: string) => {
      assert.equal(pi, f.paymentIntentId);
      lookups++;
      return canonical;
    };
    const refunded = refundBeforeFulfillmentEvent(f.paymentIntentId, 450);
    await f.fulfill(refunded, retrieve);
    await f.fulfill(refunded, retrieve);
    await f.fulfill({ ...refunded, id: `evt_early_redelivery_${randomUUID()}` }, retrieve);
    await f.fulfill(completed);
    await f.fulfill(f.sessionEvent(`evt_early_async_${randomUUID()}`, "checkout.session.async_payment_succeeded"));
    const [purchase] = await db.select().from(artcovrCreditPackPurchases)
      .where(eq(artcovrCreditPackPurchases.id, f.id));
    assert.equal(purchase.status, "refunded");
    assert.equal(purchase.stripePaymentIntentId, f.paymentIntentId);
    assert.equal(purchase.refundedCents, 450);
    assert.equal(await f.balance(), 0);
    const ledger = await db.select().from(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, f.id));
    assert.equal(ledger.some((row) => row.entryType === "grant"), false);
    const refunds = await db.select().from(artcovrRefundEvents).where(eq(artcovrRefundEvents.orderId, f.id));
    assert.equal(refunds.length, 1);
    assert.equal(lookups, 1);
  } finally {
    await f.cleanup();
  }
});

test("partial refund before fulfillment preserves the established paid credit policy", async () => {
  const f = await fixture(3, false);
  try {
    const completed = f.sessionEvent(`evt_partial_early_paid_${randomUUID()}`, "checkout.session.completed", { status: "complete" });
    await f.fulfill(
      refundBeforeFulfillmentEvent(f.paymentIntentId, 450, {
        refunded: false,
        amount_refunded: 150,
        refunds: { data: [{ id: `re_partial_early_${randomUUID()}`, amount: 150 }] },
      }),
      async () => completed.data.object as Stripe.Checkout.Session,
    );
    await f.fulfill(completed);
    const [purchase] = await db.select().from(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, f.id));
    assert.equal(purchase.status, "paid");
    assert.equal(purchase.refundedCents, 150);
    assert.equal(await f.balance(), 3);
  } finally {
    await f.cleanup();
  }
});

test("unbound refunds reject wrong mode, amount, currency, owner binding, and payment binding", async () => {
  const invalidSessions: Array<Record<string, unknown>> = [
    { livemode: true },
    { amount_total: 1 },
    { currency: "eur" },
    { client_reference_id: "other_purchase" },
    { payment_intent: "pi_other" },
    { metadata: { purchase_type: "image_generation_credit", credit_pack_purchase_id: "other_purchase" } },
  ];
  for (const overrides of invalidSessions) {
    const f = await fixture(2, false);
    try {
      const session = f.sessionEvent(`evt_invalid_session_${randomUUID()}`, "checkout.session.completed", { status: "complete", ...overrides }).data.object as Stripe.Checkout.Session;
      const refund = refundBeforeFulfillmentEvent(f.paymentIntentId, 300);
      await f.fulfill(refund, async () => session);
      const [purchase] = await db.select().from(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, f.id));
      assert.equal(purchase.status, "reserved");
      assert.equal(purchase.stripePaymentIntentId, null);
      assert.equal(purchase.refundedCents, 0);
      const [receipt] = await db.select().from(artcovrWebhookEvents).where(eq(artcovrWebhookEvents.id, refund.id));
      assert.equal(receipt.status, "rejected");
      assert.equal(await f.balance(), 0);
    } finally {
      await f.cleanup();
    }
  }
});

test("unbound refunds validate charge amount and currency as well as the canonical session", async () => {
  for (const overrides of [{ amount: 299 }, { currency: "eur" }, { amount_refunded: 301 }]) {
    const f = await fixture(2, false);
    try {
      const session = f.sessionEvent(`evt_invalid_charge_session_${randomUUID()}`, "checkout.session.completed", { status: "complete" }).data.object as Stripe.Checkout.Session;
      const refund = refundBeforeFulfillmentEvent(f.paymentIntentId, 300, overrides);
      await f.fulfill(refund, async () => session);
      const [purchase] = await db.select().from(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, f.id));
      assert.equal(purchase.status, "reserved");
      assert.equal(purchase.stripePaymentIntentId, null);
      assert.equal(purchase.refundedCents, 0);
      const [receipt] = await db.select().from(artcovrWebhookEvents).where(eq(artcovrWebhookEvents.id, refund.id));
      assert.equal(receipt.status, "rejected");
    } finally {
      await f.cleanup();
    }
  }
});

test("a refund during session-ID persistence retries instead of being ignored", async () => {
  const f = await fixture(2, false);
  try {
    const session = f.sessionEvent(`evt_pending_session_${randomUUID()}`, "checkout.session.completed", { status: "complete" }).data.object as Stripe.Checkout.Session;
    const refund = refundBeforeFulfillmentEvent(f.paymentIntentId, 300);
    await db.update(artcovrCreditPackPurchases).set({ stripeCheckoutSessionId: null })
      .where(eq(artcovrCreditPackPurchases.id, f.id));
    await assert.rejects(f.fulfill(refund, async () => session), /not yet persisted/);
    const receipts = await db.select().from(artcovrWebhookEvents).where(eq(artcovrWebhookEvents.id, refund.id));
    assert.equal(receipts.length, 0);
    await db.update(artcovrCreditPackPurchases).set({ stripeCheckoutSessionId: f.sessionId })
      .where(eq(artcovrCreditPackPurchases.id, f.id));
    await f.fulfill(refund, async () => session);
    const [purchase] = await db.select().from(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, f.id));
    assert.equal(purchase.status, "refunded");
  } finally {
    await f.cleanup();
  }
});

test("an unrelated refunded charge cannot revoke a purchase using forged charge metadata", async () => {
  const f = await fixture(2, false);
  try {
    const refund = refundBeforeFulfillmentEvent("pi_unrelated", 300, {
      metadata: { credit_pack_purchase_id: f.id, purchase_type: "image_generation_credit" },
    });
    await f.fulfill(refund, async () => null);
    const [purchase] = await db.select().from(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, f.id));
    assert.equal(purchase.status, "reserved");
    assert.equal(purchase.stripePaymentIntentId, null);
    assert.equal(purchase.refundedCents, 0);
  } finally {
    await f.cleanup();
  }
});

test("failed canonical refund lookup rolls back its receipt so the same event can retry", async () => {
  const f = await fixture(2, false);
  try {
    const refund = refundBeforeFulfillmentEvent(f.paymentIntentId, 300);
    await assert.rejects(f.fulfill(refund, async () => { throw new Error("deterministic lookup failure"); }), /lookup failure/);
    const receipts = await db.select().from(artcovrWebhookEvents).where(eq(artcovrWebhookEvents.id, refund.id));
    assert.equal(receipts.length, 0);
    const session = f.sessionEvent(`evt_retry_session_${randomUUID()}`, "checkout.session.completed", { status: "complete" }).data.object as Stripe.Checkout.Session;
    await f.fulfill(refund, async () => session);
    const [purchase] = await db.select().from(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, f.id));
    assert.equal(purchase.status, "refunded");
  } finally {
    await f.cleanup();
  }
});

test("an artwork refund arriving before payment fulfillment blocks later entitlement", async () => {
  const id = randomUUID();
  const sessionId = `cs_artwork_early_${id}`;
  const paymentIntentId = `pi_artwork_early_${id}`;
  const artworkId = `artwork_early_${id}`;
  const completed = {
    id: `evt_artwork_early_paid_${id}`,
    type: "checkout.session.completed",
    livemode: false,
    data: { object: {
      id: sessionId, mode: "payment", status: "complete", payment_status: "paid",
      livemode: false, payment_intent: paymentIntentId, client_reference_id: id,
      amount_total: 10000, currency: "usd",
      metadata: { order_id: id, artwork_id: artworkId, sale_mode: "repeatable" },
    } },
  } as unknown as Stripe.Event;
  const refund = refundBeforeFulfillmentEvent(paymentIntentId, 10000);
  const eventIds = [refund.id, completed.id];
  await db.insert(artcovrOrders).values({
    ...createOrderValues({
      id, clerkUserId: `user_artwork_early_${id}`, artworkId, artworkSlug: `slug_${id}`,
      amountCents: 10000, saleMode: "repeatable", idempotencyKey: randomUUID(),
      reservationExpiresAt: new Date(Date.now() + 30 * 60_000),
    }),
    stripeCheckoutSessionId: sessionId,
  });
  const dependencies = {
    expectedLivemode: false,
    refundPaymentIntent: async () => { throw new Error("This test must not create a refund"); },
    retrieveCheckoutSessionForPaymentIntent: async (pi: string) => {
      assert.equal(pi, paymentIntentId);
      return completed.data.object as Stripe.Checkout.Session;
    },
  };
  try {
    await fulfillCheckoutSession(refund, dependencies);
    await fulfillCheckoutSession(completed, dependencies);
    const [order] = await db.select().from(artcovrOrders).where(eq(artcovrOrders.id, id));
    assert.equal(order.status, "refunded");
    assert.equal(order.stripePaymentIntentId, paymentIntentId);
    assert.equal(order.refundedCents, 10000);
    assert.ok(order.accessRevokedAt);
    assert.equal(order.entitlementExpiresAt, null);
    const ledger = await db.select().from(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, id));
    assert.equal(ledger.some((row) => row.entryType === "grant"), false);
  } finally {
    await db.delete(artcovrRefundEvents).where(eq(artcovrRefundEvents.orderId, id));
    await db.delete(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, id));
    await db.delete(artcovrOrders).where(eq(artcovrOrders.id, id));
    await db.delete(artcovrWebhookEvents).where(inArray(artcovrWebhookEvents.id, eventIds));
  }
});

for (const fullSnapshotFirst of [false, true]) {
  test(`refund totals reconcile anonymous snapshots and identified refunds (${fullSnapshotFirst ? "full first" : "partial first"})`, async () => {
    const f = await fixture(3);
    try {
      await f.fulfill(f.sessionEvent(`evt_accounting_paid_${randomUUID()}`));
      const partialId = `re_accounting_partial_${randomUUID()}`;
      const remainingId = `re_accounting_remaining_${randomUUID()}`;
      const partial = { id: partialId, amount: 150, created: Math.floor(Date.now() / 1000) };
      const remaining = { id: remainingId, amount: 300, created: Math.floor(Date.now() / 1000) };
      const initial = refundBeforeFulfillmentEvent(f.paymentIntentId, 450, {
        refunded: fullSnapshotFirst,
        amount_refunded: fullSnapshotFirst ? 450 : 150,
        refunds: { data: [] },
      });
      await f.fulfill(initial);
      const initialRows = await db.select().from(artcovrRefundEvents).where(eq(artcovrRefundEvents.orderId, f.id));
      assert.equal(initialRows.length, 1);
      assert.equal(initialRows[0]!.stripeRefundId, null);
      assert.equal(initialRows[0]!.amountCents, fullSnapshotFirst ? 450 : 150);
      assert.equal(await f.balance(), fullSnapshotFirst ? 0 : 3);

      if (fullSnapshotFirst) {
        // An older partial snapshot exposes one real ID after the full total.
        await f.fulfill(refundBeforeFulfillmentEvent(f.paymentIntentId, 450, {
          refunded: false, amount_refunded: 150, refunds: { data: [partial] },
        }));
        const rows = await db.select().from(artcovrRefundEvents).where(eq(artcovrRefundEvents.orderId, f.id));
        assert.equal(rows.reduce((total, row) => total + row.amountCents, 0), 450);
        const [purchase] = await db.select().from(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, f.id));
        assert.equal(purchase.refundedCents, 450);
        assert.equal(purchase.status, "refunded");
        assert.equal(await f.balance(), 0);
      }

      const identifiedFull = refundBeforeFulfillmentEvent(f.paymentIntentId, 450, {
        refunds: { data: [partial, remaining] },
      });
      await f.fulfill(identifiedFull);
      await f.fulfill(identifiedFull);
      await f.fulfill({ ...identifiedFull, id: `evt_accounting_redelivery_${randomUUID()}` });
      // Old partial events must neither reduce totals nor resurrect credits.
      await f.fulfill(refundBeforeFulfillmentEvent(f.paymentIntentId, 450, {
        refunded: false, amount_refunded: 150, refunds: { data: [partial] },
      }));

      const rows = await db.select().from(artcovrRefundEvents).where(eq(artcovrRefundEvents.orderId, f.id));
      assert.equal(rows.reduce((total, row) => total + row.amountCents, 0), 450);
      assert.equal(rows.length, 3);
      assert.equal(rows.find((row) => row.id === initialRows[0]!.id)?.amountCents, 0);
      assert.equal(rows.find((row) => row.stripeRefundId === partialId)?.amountCents, 150);
      assert.equal(rows.find((row) => row.stripeRefundId === remainingId)?.amountCents, 300);
      const [purchase] = await db.select().from(artcovrCreditPackPurchases).where(eq(artcovrCreditPackPurchases.id, f.id));
      assert.equal(purchase.refundedCents, 450);
      assert.equal(purchase.status, "refunded");
      assert.equal(await f.balance(), 0);
      const ledger = await db.select().from(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, f.id));
      assert.equal(ledger.filter((row) => row.entryType === "revoke").length, 1);
    } finally {
      await f.cleanup();
    }
  });
}
