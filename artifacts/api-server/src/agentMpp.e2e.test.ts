import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import type Stripe from "stripe";
import { and, desc, eq, gte } from "drizzle-orm";
import { Receipt } from "mppx";
import { Mppx, stripe } from "mppx/client";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  artcovrCreditLedger,
  artcovrOrders,
  artcovrRefundEvents,
  db,
} from "@workspace/db";
import app from "./app";
import { getPublicArtworkBySlug } from "./catalog";
import {
  assertStripeProxyMode,
  listStripeEvents,
  refundPaymentIntent,
} from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";

const enabled = process.env.ARTCOVR_RUN_STRIPE_MPP_E2E === "1";

async function stripeTestPost(path: string, body: URLSearchParams) {
  await assertStripeProxyMode();
  const response = await new ReplitConnectors().proxy("stripe", path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-04-22.preview",
    },
    body: body.toString(),
  });
  const payload = (await response.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      `Stripe test request failed (${response.status}): ${payload.error?.message ?? "unknown error"}`,
    );
  }
  return payload;
}

async function createTestGrantedToken(input: {
  expiresAt: number;
  maxAmountCents: number;
}) {
  const body = new URLSearchParams({
    payment_method: "pm_card_visa",
    "usage_limits[currency]": "usd",
    "usage_limits[expires_at]": String(input.expiresAt),
    "usage_limits[max_amount]": String(input.maxAmountCents),
  });
  const payload = await stripeTestPost(
    "/v1/test_helpers/shared_payment/granted_tokens",
    body,
  );
  if (!payload.id) {
    throw new Error("Stripe test SPT creation did not return a token ID.");
  }
  return payload.id;
}

async function waitForRefundEvent(
  paymentIntentId: string,
  createdAfter: Date,
) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const events = await listStripeEvents({
      type: "charge.refunded",
      createdAfter,
    });
    const match = events.find((event) => {
      const charge = event.data.object as Stripe.Charge;
      const eventPaymentIntent =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      return eventPaymentIntent === paymentIntentId;
    });
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Timed out waiting for Stripe's charge.refunded event.");
}

function webhookSignature(payload: Buffer, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

test(
  "real Stripe test-mode MPP purchase delivers, replays, and revokes one image",
  { skip: !enabled ? "Set ARTCOVR_RUN_STRIPE_MPP_E2E=1 to opt in." : false },
  async () => {
    const profileId = process.env.STRIPE_PROFILE_ID?.trim();
    const artworkSlug = process.env.ARTCOVR_TEST_ARTWORK_SLUG?.trim();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (
      process.env.NODE_ENV === "production" ||
      process.env.REPLIT_ENVIRONMENT === "production"
    ) {
      throw new Error("The agent MPP E2E check refuses to run in production.");
    }
    if (!profileId) {
      throw new Error("STRIPE_PROFILE_ID is required for the agent MPP E2E check.");
    }
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is required for the agent MPP E2E check.");
    }
    if (!artworkSlug) {
      throw new Error(
        "ARTCOVR_TEST_ARTWORK_SLUG is required so the paid test fixture is explicit.",
      );
    }
    const artwork = getPublicArtworkBySlug(artworkSlug);
    if (!artwork?.priceCents || artwork.saleMode !== "repeatable") {
      throw new Error(`ARTCOVR_TEST_ARTWORK_SLUG is not a purchasable artwork: ${artworkSlug}`);
    }

    const previousOrigin = process.env.ARTCOVR_PUBLIC_ORIGIN;
    process.env.STRIPE_PROFILE_ID = profileId;
    process.env.ARTCOVR_PUBLIC_ORIGIN = "http://127.0.0.1";
    const startedAt = new Date();
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("The agent MPP E2E server did not expose a TCP address.");
    }

    try {
      const endpoint = `http://127.0.0.1:${address.port}/api/agent/artworks/${artwork.slug}/image`;
      const challenge = await fetch(endpoint);
      assert.equal(challenge.status, 402);
      assert.match(challenge.headers.get("www-authenticate") ?? "", /Payment/);

      const client = Mppx.create({
        methods: [
          stripe.charge({
            paymentMethod: "pm_card_visa",
            createToken: ({ expiresAt }) =>
              createTestGrantedToken({
                expiresAt,
                maxAmountCents: 100_000,
              }),
          }),
        ],
      });
      try {
        const payment = await client.preparePayment(challenge, {
          request: { method: "GET" },
        });
        const credential = await payment.createCredential();
        const paidResponse = await fetch(
          endpoint,
          payment.setCredential({ method: "GET" }, credential),
        );
        assert.equal(paidResponse.status, 200);
        assert.match(paidResponse.headers.get("content-type") ?? "", /^image\//);
        assert.ok(paidResponse.headers.get("payment-receipt"));
        const receipt = Receipt.deserialize(
          paidResponse.headers.get("payment-receipt") ?? "",
        );
        assert.equal(receipt.status, "success");
        assert.match(receipt.reference, /^pi_/);
        const bytes = Buffer.from(await paidResponse.arrayBuffer());
        assert.ok(bytes.length > 100);
        assert.equal(bytes.includes(Buffer.from("storage.googleapis.com")), false);
        assert.equal(bytes.includes(Buffer.from("signedUrl")), false);

        const replay = await fetch(
          endpoint,
          payment.setCredential({ method: "GET" }, credential),
        );
        assert.ok(replay.status >= 400);
      } finally {
        Mppx.restore();
      }

      const orders = await db
        .select({
          id: artcovrOrders.id,
          paymentIntentId: artcovrOrders.stripePaymentIntentId,
          status: artcovrOrders.status,
        })
        .from(artcovrOrders)
        .where(
          and(
            eq(artcovrOrders.artworkSlug, artwork.slug),
            eq(artcovrOrders.salesChannel, "agent_mpp"),
            gte(artcovrOrders.createdAt, startedAt),
          ),
        )
        .orderBy(desc(artcovrOrders.createdAt));
      assert.equal(orders.length, 1);
      assert.equal(orders[0]?.status, "paid");
      assert.ok(orders[0]?.paymentIntentId);
      const orderId = orders[0]!.id;
      const paymentIntentId = orders[0]!.paymentIntentId;

      const grants = await db
        .select({ id: artcovrCreditLedger.id })
        .from(artcovrCreditLedger)
        .where(eq(artcovrCreditLedger.orderId, orderId));
      assert.equal(grants.length, 1);

      const refund = await refundPaymentIntent(
        { paymentIntentId, orderId },
        `agent-mpp-e2e-refund:${paymentIntentId}`,
      );
      assert.match(refund.id, /^re_/);

      const refundEvent = await waitForRefundEvent(paymentIntentId, startedAt);
      assert.equal(refundEvent.livemode, false);
      const webhookPayload = Buffer.from(JSON.stringify({ id: refundEvent.id }));
      const signature = webhookSignature(webhookPayload, webhookSecret);
      await WebhookHandlers.processWebhook(webhookPayload, signature);
      await WebhookHandlers.processWebhook(webhookPayload, signature);

      const [refundedOrder] = await db
        .select({
          status: artcovrOrders.status,
          accessRevokedAt: artcovrOrders.accessRevokedAt,
        })
        .from(artcovrOrders)
        .where(eq(artcovrOrders.id, orderId));
      assert.equal(refundedOrder?.status, "refunded");
      assert.ok(refundedOrder?.accessRevokedAt);

      const ledger = await db
        .select({
          entryType: artcovrCreditLedger.entryType,
          amount: artcovrCreditLedger.amount,
        })
        .from(artcovrCreditLedger)
        .where(eq(artcovrCreditLedger.orderId, orderId));
      assert.deepEqual(ledger, [
        { entryType: "grant", amount: 3 },
        { entryType: "revoke", amount: -3 },
      ]);

      const refundEvents = await db
        .select({
          id: artcovrRefundEvents.id,
          stripeRefundId: artcovrRefundEvents.stripeRefundId,
        })
        .from(artcovrRefundEvents)
        .where(eq(artcovrRefundEvents.orderId, orderId));
      assert.equal(refundEvents.length, 1);
      assert.ok(refundEvents[0]?.id.startsWith("refund"));
      if (refundEvents[0]?.stripeRefundId) {
        assert.equal(refundEvents[0].stripeRefundId, refund.id);
      }
    } finally {
      const cleanupOrders = await db
        .select({
          id: artcovrOrders.id,
          paymentIntentId: artcovrOrders.stripePaymentIntentId,
          status: artcovrOrders.status,
        })
        .from(artcovrOrders)
        .where(
          and(
            eq(artcovrOrders.artworkSlug, artwork.slug),
            eq(artcovrOrders.salesChannel, "agent_mpp"),
            gte(artcovrOrders.createdAt, startedAt),
          ),
        );
      for (const order of cleanupOrders) {
        if (order.paymentIntentId && order.status === "paid") {
          await refundPaymentIntent(
            { paymentIntentId: order.paymentIntentId, orderId: order.id },
            `agent-mpp-e2e-refund:${order.paymentIntentId}`,
          );
        }
      }
      for (const order of cleanupOrders) {
        await db
          .delete(artcovrRefundEvents)
          .where(eq(artcovrRefundEvents.orderId, order.id));
        await db.delete(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, order.id));
        await db.delete(artcovrOrders).where(eq(artcovrOrders.id, order.id));
      }
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (previousOrigin === undefined) delete process.env.ARTCOVR_PUBLIC_ORIGIN;
      else process.env.ARTCOVR_PUBLIC_ORIGIN = previousOrigin;
    }
  },
);