import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import type Stripe from "stripe";
import { eq, inArray } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrOrders,
  artcovrWebhookEvents,
  db,
} from "@workspace/db";
import { createOrderValues, fulfillCheckoutSession } from "./commerceService";
import { getPurchaseCreditBalance } from "./creditService";
import { WebhookHandlers } from "./webhookHandlers";
import { verifyStripeWebhookSignature } from "./webhookSecurity";

// This contract uses real signature verification and database fulfillment.
// Stripe event retrieval is controlled; it does not certify a live payment.
test("signed test-mode checkout fulfillment grants once across replay and a second success event", async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) &&
      /^\/artcovr_(check|test)(?:[_-][a-z0-9_-]+)?$/i.test(database.pathname),
    "Signed fulfillment tests require an explicitly named disposable loopback database.",
  );
  const suffix = randomUUID();
  const orderId = `order-signed-${suffix}`;
  const artworkId = `art-signed-${suffix}`;
  const userId = `user-signed-${suffix}`;
  const sessionId = `cs_test_signed_${suffix}`;
  const paymentIntentId = `pi_test_signed_${suffix}`;
  const completedId = `evt_signed_completed_${suffix}`;
  const asyncId = `evt_signed_async_${suffix}`;
  const signingSecret = `whsec_local_contract_${suffix}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const session = {
    id: sessionId,
    object: "checkout.session",
    livemode: false,
    payment_status: "paid",
    payment_intent: paymentIntentId,
    customer: `cus_test_signed_${suffix}`,
    customer_details: { email: "signed-contract@example.test" },
  } as Stripe.Checkout.Session;
  const event = (id: string, type: "checkout.session.completed" | "checkout.session.async_payment_succeeded"): Stripe.Event => ({
    id,
    object: "event",
    api_version: "2025-08-27.basil",
    created: timestamp,
    data: { object: session },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
  });
  const events = new Map([
    [completedId, event(completedId, "checkout.session.completed")],
    [asyncId, event(asyncId, "checkout.session.async_payment_succeeded")],
  ]);
  let retrievals = 0;
  const dependencies = {
    verifySignature: verifyStripeWebhookSignature,
    retrieveEvent: async (id: string) => {
      retrievals += 1;
      const result = events.get(id);
      assert.ok(result, "Only this contract's test-mode events may be retrieved.");
      return result;
    },
    fulfillSession: (received: Stripe.Event) =>
      fulfillCheckoutSession(received, {
        expectedLivemode: false,
        refundPaymentIntent: async () => {
          throw new Error("A repeatable test purchase must never call Stripe refunds.");
        },
      }),
    scheduleCatalogAudit: () => {},
  };
  const payload = (id: string) => Buffer.from(JSON.stringify({ id }));
  const signature = (body: Buffer) =>
    `t=${timestamp},v1=${createHmac("sha256", signingSecret)
      .update(`${timestamp}.${body.toString("utf8")}`, "utf8")
      .digest("hex")}`;

  try {
    await db.insert(artcovrOrders).values({
      ...createOrderValues({
        id: orderId,
        clerkUserId: userId,
        artworkId,
        artworkSlug: `signed-${suffix}`,
        amountCents: 3500,
        saleMode: "repeatable",
        idempotencyKey: suffix,
        reservationExpiresAt: new Date(Date.now() + 31 * 60_000),
      }),
      stripeCheckoutSessionId: sessionId,
    });
    const completed = payload(completedId);
    await assert.rejects(
      WebhookHandlers.processWebhook(
        completed,
        `t=${timestamp},v1=${"0".repeat(64)}`,
        signingSecret,
        dependencies,
      ),
      /signature is invalid/,
    );
    assert.equal(retrievals, 0, "An invalid signature must not fetch a Stripe event.");
    assert.equal((await db.select().from(artcovrWebhookEvents).where(eq(artcovrWebhookEvents.id, completedId))).length, 0);
    assert.equal((await db.select().from(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, orderId))).length, 0);

    await WebhookHandlers.processWebhook(completed, signature(completed), signingSecret, dependencies);
    await WebhookHandlers.processWebhook(completed, signature(completed), signingSecret, dependencies);
    const asyncBody = payload(asyncId);
    await WebhookHandlers.processWebhook(asyncBody, signature(asyncBody), signingSecret, dependencies);

    const [order] = await db.select().from(artcovrOrders).where(eq(artcovrOrders.id, orderId));
    assert.equal(order?.status, "paid");
    assert.equal(order?.clerkUserId, userId);
    assert.equal(order?.stripePaymentIntentId, paymentIntentId);
    assert.ok(order?.paidAt instanceof Date);
    assert.ok(order?.entitlementExpiresAt instanceof Date);
    assert.equal(order?.accessRevokedAt, null);
    const grants = await db.select().from(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, orderId));
    assert.equal(grants.length, 1);
    assert.equal(grants[0]?.entryType, "grant");
    assert.equal(grants[0]?.amount, order?.includedCredits);
    assert.equal(grants[0]?.clerkUserId, userId);
    assert.equal(grants[0]?.accountKey, userId);
    assert.equal(grants[0]?.sourceId, `checkout:${sessionId}`);
    assert.equal(await getPurchaseCreditBalance(db, userId, orderId), order?.includedCredits);
    assert.equal(await getPurchaseCreditBalance(db, `other-${userId}`, orderId), 0);
    const receipts = await db.select().from(artcovrWebhookEvents).where(inArray(artcovrWebhookEvents.id, [completedId, asyncId]));
    assert.equal(receipts.length, 2);
    assert.ok(receipts.every((receipt) => receipt.status === "processed"));
  } finally {
    await db.delete(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, orderId));
    await db.delete(artcovrWebhookEvents).where(inArray(artcovrWebhookEvents.id, [completedId, asyncId]));
    await db.delete(artcovrOrders).where(eq(artcovrOrders.id, orderId));
  }
});
