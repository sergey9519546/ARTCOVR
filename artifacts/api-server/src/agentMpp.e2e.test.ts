import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { and, desc, eq, gte } from "drizzle-orm";
import { Receipt } from "mppx";
import { Mppx, stripe } from "mppx/client";
import { artcovrCreditLedger, artcovrOrders, db } from "@workspace/db";
import app from "./app";
import { getPublicArtworkBySlug } from "./catalog";
import { refundPaymentIntent } from "./stripeClient";

const enabled = process.env.ARTCOVR_RUN_STRIPE_MPP_E2E === "1";

async function createTestGrantedToken(input: {
  secretKey: string;
  expiresAt: number;
  maxAmountCents: number;
}) {
  const body = new URLSearchParams({
    payment_method: "pm_card_visa",
    "usage_limits[currency]": "usd",
    "usage_limits[expires_at]": String(input.expiresAt),
    "usage_limits[max_amount]": String(input.maxAmountCents),
  });
  const response = await fetch(
    "https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${input.secretKey}:`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2026-04-22.preview",
      },
      body,
    },
  );
  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(
      `Stripe test SPT creation failed (${response.status}): ${payload.error?.message ?? "missing token ID"}`,
    );
  }
  return payload.id;
}

test(
  "real Stripe test-mode MPP purchase delivers one image and cleans up",
  { skip: !enabled ? "Set ARTCOVR_RUN_STRIPE_MPP_E2E=1 to opt in." : false },
  async () => {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    const profileId = process.env.STRIPE_PROFILE_ID?.trim();
    const artworkSlug = process.env.ARTCOVR_TEST_ARTWORK_SLUG?.trim();
    if (process.env.NODE_ENV === "production") {
      throw new Error("The agent MPP E2E check refuses to run in production.");
    }
    if (!secretKey || !secretKey.startsWith("sk_test_")) {
      throw new Error(
        "The agent MPP E2E check requires an explicit STRIPE_SECRET_KEY beginning with sk_test_.",
      );
    }
    if (!profileId) {
      throw new Error("STRIPE_PROFILE_ID is required for the agent MPP E2E check.");
    }
    if (!artworkSlug) {
      throw new Error(
        "ARTCOVR_TEST_ARTWORK_SLUG is required so the paid test fixture is explicit.",
      );
    }
    const artwork = getPublicArtworkBySlug(artworkSlug);
    if (!artwork?.priceCents || !artwork.saleMode) {
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

    const orderIds: string[] = [];
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
                secretKey,
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
      if (orders[0]?.id) orderIds.push(orders[0].id);

      const grants = await db
        .select({ id: artcovrCreditLedger.id })
        .from(artcovrCreditLedger)
        .where(eq(artcovrCreditLedger.orderId, orders[0]!.id));
      assert.equal(grants.length, 1);
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
            `agent-mpp-e2e-cleanup:${order.paymentIntentId}`,
          );
        }
      }
      for (const orderId of orderIds) {
        await db.delete(artcovrCreditLedger).where(eq(artcovrCreditLedger.orderId, orderId));
        await db.delete(artcovrOrders).where(eq(artcovrOrders.id, orderId));
      }
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (previousOrigin === undefined) delete process.env.ARTCOVR_PUBLIC_ORIGIN;
      else process.env.ARTCOVR_PUBLIC_ORIGIN = previousOrigin;
    }
  },
);