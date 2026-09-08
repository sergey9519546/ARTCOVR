import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type Stripe from "stripe";
import { eq, inArray } from "drizzle-orm";
import { artcovrCreditLedger, artcovrOrders, artcovrWebhookEvents, db } from "@workspace/db";
import { fulfillCheckoutSession } from "./commerceService";
import { getPurchaseCreditBalance, getUserCreditBalance, listPurchaseCreditBalances, releasePurchaseCredit, spendPurchaseCredit } from "./creditService";

async function fixture() {
  const id = randomUUID();
  const userId = `user-credit-${id}`;
  const events: string[] = [];
  await db.insert(artcovrOrders).values({ id, clerkUserId: userId, artworkId: id,
    artworkSlug: id, idempotencyKey: id, stripePaymentIntentId: `pi_${id}`,
    stripeCheckoutSessionId: `cs_${id}`, amountCents: 3500, includedCredits: 2,
    saleMode: "repeatable", licenseTerms: "test", status: "paid", paidAt: new Date() });
  await db.insert(artcovrCreditLedger).values({ id: `grant_${id}`, clerkUserId: userId,
    accountKey: userId, orderId: id, amount: 2, entryType: "grant", reason: "test", sourceId: `grant:${id}` });
  return { id, userId, events,
    balance: () => getPurchaseCreditBalance(db, userId, id),
    async refund(refunded = true, livemode = false) {
      const eventId = `evt_${randomUUID()}`; events.push(eventId);
      await fulfillCheckoutSession({ id: eventId, type: "charge.refunded", livemode,
        data: { object: { payment_intent: `pi_${id}`, livemode, refunded,
          refunds: { data: [{ id: `re_${id}` }] } } } } as Stripe.Event,
        { expectedLivemode: false, refundPaymentIntent: async () => { throw new Error("Unexpected payment mutation"); } });
    },
    async cleanup() {
      await db.delete(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, id));
      await db.delete(artcovrOrders).where(eq(artcovrOrders.id, id));
      if (events.length) await db.delete(artcovrWebhookEvents).where(inArray(artcovrWebhookEvents.id, events));
    },
  };
}

test("partial refunds and wrong-mode refunds do not revoke a complete purchase", async () => {
  const f = await fixture();
  try {
    await f.refund(false);
    await f.refund(true, true);
    assert.equal(await f.balance(), 2);
    const [order] = await db.select().from(artcovrOrders).where(eq(artcovrOrders.id, f.id));
    assert.equal(order.status, "paid");
    assert.equal(order.accessRevokedAt, null);
  } finally { await f.cleanup(); }
});

test("credit releases require a real spend and are idempotent", async () => {
  const f = await fixture();
  const input = { userId: f.userId, purchaseId: f.id, generationId: randomUUID() };
  try {
    await db.transaction((tx) => releasePurchaseCredit(tx, { ...input, reason: "unspent legacy failure" }));
    assert.equal(await f.balance(), 2);
    await db.transaction((tx) => spendPurchaseCredit(tx, input));
    assert.equal(await f.balance(), 1);
    await Promise.all([1, 2].map(() => db.transaction((tx) => releasePurchaseCredit(tx, { ...input, reason: "failed" }))));
    assert.equal(await f.balance(), 2);
  } finally { await f.cleanup(); }
});

test("a late provider failure cannot resurrect refunded credits", async () => {
  const f = await fixture();
  const input = { userId: f.userId, purchaseId: f.id, generationId: randomUUID() };
  try {
    await db.transaction((tx) => spendPurchaseCredit(tx, input));
    await f.refund();
    await db.transaction((tx) => releasePurchaseCredit(tx, { ...input, reason: "late failure" }));
    assert.equal(await f.balance(), 0);
  } finally { await f.cleanup(); }
});

test("concurrent spends cannot exceed a purchase balance", async () => {
  const f = await fixture();
  try {
    const spent = await Promise.all([1, 2, 3].map(() => db.transaction((tx) => spendPurchaseCredit(tx,
      { userId: f.userId, purchaseId: f.id, generationId: randomUUID() }))));
    assert.equal(spent.filter(Boolean).length, 2);
    assert.equal(await f.balance(), 0);
  } finally { await f.cleanup(); }
});

test("legacy account keys cannot expose another explicit owner's credits", async () => {
  const f = await fixture();
  const foreign = `foreign-${randomUUID()}`;
  try {
    await db.update(artcovrCreditLedger).set({ accountKey: foreign }).where(eq(artcovrCreditLedger.orderId, f.id));
    assert.equal(await getPurchaseCreditBalance(db, foreign, f.id), 0);
    assert.equal(await getUserCreditBalance(db, foreign), 0);
    assert.deepEqual(await listPurchaseCreditBalances(db, foreign), []);
    assert.equal(await f.balance(), 2);
  } finally { await f.cleanup(); }
});

test("a delayed paid-checkout event cannot undo a refund", async () => {
  const f = await fixture();
  try {
    await f.refund();
    const eventId = `evt_${randomUUID()}`; f.events.push(eventId);
    await fulfillCheckoutSession({ id: eventId, type: "checkout.session.completed", livemode: false,
      data: { object: { id: `cs_${f.id}`, livemode: false, payment_status: "paid" } } } as Stripe.Event,
      { expectedLivemode: false, refundPaymentIntent: async () => { throw new Error("Unexpected payment mutation"); } });
    const [order] = await db.select().from(artcovrOrders).where(eq(artcovrOrders.id, f.id));
    assert.equal(order.status, "refunded");
    assert.equal(await f.balance(), 0);
  } finally { await f.cleanup(); }
});
