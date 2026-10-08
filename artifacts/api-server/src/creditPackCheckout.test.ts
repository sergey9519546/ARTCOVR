import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { artcovrCreditPackPurchases, db } from "@workspace/db";
import { commerceConfig } from "./commerce-config";
import { requireAuth } from "./middlewares/auth";
import {
  createCreditPackCheckoutHandler,
  createCreditPackCheckoutStatusHandler,
} from "./routes/commerce";

const database = new URL(process.env.DATABASE_URL ?? "");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) &&
    /^\/artcovr_(check|test)(?:[_-][a-z0-9_-]+)?$/i.test(database.pathname),
  "Credit pack checkout tests require an explicitly named disposable loopback database.",
);

function withFakeAuth(app: express.Express) {
  app.use(express.json());
  app.use((req, _res, next) => {
    const auth = Object.assign(
      () => ({
        userId: req.header("x-test-user") ?? null,
        tokenType: "session_token",
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as unknown as { auth: typeof auth }).auth = auth;
    next();
  });
}

function creditPrice(): Stripe.Price {
  return {
    id: "price_generation_credit_test",
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    created: 1,
    currency: commerceConfig.currency,
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: {},
    nickname: null,
    product: "prod_generation_credit_test",
    recurring: null,
    tax_behavior: "unspecified",
    tiers_mode: null,
    transform_quantity: null,
    type: "one_time",
    unit_amount: commerceConfig.creditPriceCents,
    unit_amount_decimal: null,
  };
}

async function withHttpServer(
  app: express.Express,
  callback: (origin: string) => Promise<void>,
) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("credit checkout uses server pricing and retries the same owner's open session", async () => {
  const userId = `credit-checkout-user-${randomUUID()}`;
  const idempotencyKey = randomUUID();
  const sessionId = `cs_credit_checkout_${randomUUID()}`;
  const checkoutUrl = `https://checkout.stripe.test/${sessionId}`;
  const created: Array<{ input: Record<string, unknown>; idempotencyKey: string }> = [];
  const retrieved: string[] = [];
  const app = express();
  withFakeAuth(app);
  app.post(
    "/credit-checkout",
    requireAuth,
    createCreditPackCheckoutHandler({
      getStripePriceForCreditUnit: async () => creditPrice(),
      createCheckoutSession: async (input, key) => {
        created.push({
          input: input as unknown as Record<string, unknown>,
          idempotencyKey: key,
        });
        return {
          id: sessionId,
          url: checkoutUrl,
          status: "open",
        } as Stripe.Checkout.Session;
      },
      retrieveCheckoutSession: async (id) => {
        retrieved.push(id);
        return { id, url: checkoutUrl, status: "open" } as Stripe.Checkout.Session;
      },
      logCheckoutFailure: () => {},
    }),
  );

  let purchaseId: string | undefined;
  try {
    await withHttpServer(app, async (origin) => {
      const checkout = async (caller: string) =>
        fetch(`${origin}/credit-checkout`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-test-user": caller,
          },
          body: JSON.stringify({ credits: 6, idempotencyKey }),
        });

      const firstResponse = await checkout(userId);
      assert.equal(firstResponse.status, 200);
      const first = await firstResponse.json() as Record<string, unknown>;
      purchaseId = String(first.creditPackPurchaseId);
      assert.equal(first.checkoutUrl, checkoutUrl);
      assert.equal(first.credits, 6);
      assert.equal(first.amountCents, commerceConfig.creditPriceCents * 6);

      assert.equal(created.length, 1);
      assert.equal(created[0].idempotencyKey, `credit-pack:${idempotencyKey}`);
      assert.equal(created[0].input.priceId, "price_generation_credit_test");
      assert.equal(created[0].input.quantity, 6);
      assert.deepEqual(created[0].input.metadata, {
        purchase_type: "image_generation_credit",
        credit_pack_purchase_id: purchaseId,
        credits: "6",
        unit_amount_cents: String(commerceConfig.creditPriceCents),
        currency: commerceConfig.currency,
      });
      assert.match(String(created[0].input.successUrl), /my-images\?credit_checkout=return/);
      assert.match(String(created[0].input.cancelUrl), /my-images\?credit_checkout=cancelled/);

      const [purchase] = await db
        .select()
        .from(artcovrCreditPackPurchases)
        .where(eq(artcovrCreditPackPurchases.idempotencyKey, idempotencyKey));
      assert.equal(purchase.id, purchaseId);
      assert.equal(purchase.clerkUserId, userId);
      assert.equal(purchase.credits, 6);
      assert.equal(purchase.amountCents, commerceConfig.creditPriceCents * 6);
      assert.equal(purchase.status, "reserved");
      assert.equal(purchase.stripeCheckoutSessionId, sessionId);

      const retryResponse = await checkout(userId);
      assert.equal(retryResponse.status, 200);
      const retry = await retryResponse.json() as Record<string, unknown>;
      assert.equal(retry.creditPackPurchaseId, purchaseId);
      assert.equal(retry.checkoutUrl, checkoutUrl);
      assert.equal(created.length, 1, "a retry must not create a second Stripe session");
      assert.deepEqual(retrieved, [sessionId]);

      const otherUserResponse = await checkout(`different-user-${randomUUID()}`);
      assert.equal(otherUserResponse.status, 409);
      assert.equal(created.length, 1);
      assert.deepEqual(retrieved, [sessionId]);
    });
  } finally {
    if (purchaseId) {
      await db
        .delete(artcovrCreditPackPurchases)
        .where(eq(artcovrCreditPackPurchases.id, purchaseId));
    }
  }
});

test("credit checkout status is private and scoped to its signed-in owner", async () => {
  const userId = `credit-status-user-${randomUUID()}`;
  const purchaseId = `credit_pack_${randomUUID()}`;
  const sessionId = `cs_credit_status_${randomUUID()}`;
  const app = express();
  withFakeAuth(app);
  app.get(
    "/credit-checkout/:sessionId",
    requireAuth,
    createCreditPackCheckoutStatusHandler(),
  );

  try {
    await db.insert(artcovrCreditPackPurchases).values({
      id: purchaseId,
      clerkUserId: userId,
      stripeCheckoutSessionId: sessionId,
      idempotencyKey: randomUUID(),
      credits: 2,
      amountCents: commerceConfig.creditPriceCents * 2,
      currency: commerceConfig.currency,
      status: "paid",
      paidAt: new Date(),
    });
    await withHttpServer(app, async (origin) => {
      const response = await fetch(`${origin}/credit-checkout/${sessionId}`, {
        headers: { "x-test-user": userId },
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
      assert.deepEqual(await response.json(), { status: "paid", credits: 2 });

      const foreignResponse = await fetch(
        `${origin}/credit-checkout/${sessionId}`,
        { headers: { "x-test-user": `other-${randomUUID()}` } },
      );
      assert.equal(foreignResponse.status, 404);
      assert.deepEqual(await foreignResponse.json(), {
        code: "credit_pack_checkout_not_found",
        message: "That credit checkout was not found.",
      });
    });
  } finally {
    await db
      .delete(artcovrCreditPackPurchases)
      .where(eq(artcovrCreditPackPurchases.id, purchaseId));
  }
});
