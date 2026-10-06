import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { artcovrFunnelEvents, artcovrOrders, db } from "@workspace/db";
import { getPublicCatalog } from "./catalog";
import { createOrderValues } from "./commerceService";
import { createCheckoutHandler } from "./routes/commerce";

test("checkout retry tokens remain bound to the original signed-in buyer or guest email", async (t) => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) &&
      /^\/artcovr_(check|test)(?:[_-][a-z0-9_-]+)?$/i.test(database.pathname),
    "Checkout replay tests require an explicitly named disposable loopback database.",
  );
  const artwork = getPublicCatalog().find((item) => item.saleMode === "repeatable");
  assert.ok(artwork && artwork.priceCents !== null && artwork.saleMode === "repeatable");
  const priceCents = artwork.priceCents;
  const cases = [
    { name: "a different signed-in user cannot retrieve the checkout", owner: "user-owner", caller: "user-other", email: "buyer@example.test", allowed: false },
    { name: "an anonymous caller cannot reuse a signed-in checkout even with the same email", owner: "user-owner", caller: null, email: "buyer@example.test", allowed: false },
    { name: "a signed-in caller cannot adopt a guest checkout through an unverified submitted email", owner: null, caller: "user-other", email: "buyer@example.test", allowed: false },
    { name: "a guest with a different email cannot retrieve the checkout", owner: null, caller: null, email: "other@example.test", allowed: false },
    { name: "the original signed-in user can retry without changing order ownership or email", owner: "user-owner", caller: "user-owner", email: "new@example.test", allowed: true },
    { name: "the original anonymous guest can retry with a normalized matching email", owner: null, caller: null, email: "  BUYER@EXAMPLE.TEST  ", allowed: true },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const suffix = randomUUID();
      const orderId = `order-replay-${suffix}`;
      const idempotencyKey = randomUUID();
      const sessionId = `cs_test_replay_${suffix}`;
      const checkoutUrl = `https://checkout.stripe.test/${sessionId}`;
      let retrievals = 0;
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req, _res, next) => {
        const auth = Object.assign(
          () => ({ userId: scenario.caller, tokenType: "session_token" }),
          { [Symbol.for("@clerk/express.auth")]: true },
        );
        (req as unknown as { auth: typeof auth }).auth = auth;
        next();
      });
      testApp.post("/checkout", createCheckoutHandler({
        retrieveCheckoutSession: async (id) => {
          retrievals += 1;
          assert.equal(id, sessionId);
          return { id, url: checkoutUrl, livemode: false } as Stripe.Checkout.Session;
        },
        getStripePriceForArtwork: async () => { throw new Error("A retry must never request a new price."); },
        createCheckoutSession: async () => { throw new Error("A retry must never create a new session."); },
        logCheckoutFailure: () => {},
      }));
      const server = createServer(testApp);
      let listening = false;

      try {
        await db.insert(artcovrOrders).values({
          ...createOrderValues({
            id: orderId,
            clerkUserId: scenario.owner,
            customerEmail: "buyer@example.test",
            artworkId: artwork.id,
            artworkSlug: artwork.slug,
            amountCents: priceCents,
            saleMode: "repeatable",
            idempotencyKey,
            reservationExpiresAt: new Date(Date.now() + 31 * 60_000),
          }),
          stripeCheckoutSessionId: sessionId,
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        listening = true;
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const response = await fetch(`http://127.0.0.1:${address.port}/checkout`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artworkId: artwork.id, idempotencyKey, email: scenario.email }),
        });
        const body = await response.json() as Record<string, unknown>;
        assert.equal(response.status, scenario.allowed ? 200 : 409);
        assert.equal(retrievals, scenario.allowed ? 1 : 0);
        if (scenario.allowed) {
          assert.equal(body.purchaseId, orderId);
          assert.equal(body.checkoutUrl, checkoutUrl);
        } else {
          assert.equal(body.code, "idempotency_conflict");
          assert.equal(body.purchaseId, undefined);
          assert.equal(body.checkoutUrl, undefined);
        }
        const [preserved] = await db.select().from(artcovrOrders).where(eq(artcovrOrders.id, orderId));
        assert.equal(preserved?.clerkUserId, scenario.owner);
        assert.equal(preserved?.customerEmail, "buyer@example.test");
        assert.equal(preserved?.status, "reserved");
        assert.equal(preserved?.stripeCheckoutSessionId, sessionId);
        const funnel = await db.select().from(artcovrFunnelEvents).where(eq(artcovrFunnelEvents.orderId, orderId));
        assert.equal(funnel.length, scenario.allowed ? 1 : 0);
      } finally {
        if (listening) {
          await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        }
        await db.delete(artcovrFunnelEvents).where(eq(artcovrFunnelEvents.orderId, orderId));
        await db.delete(artcovrOrders).where(eq(artcovrOrders.id, orderId));
      }
    });
  }
});
