import assert from "node:assert/strict";
import test from "node:test";
import { ReplitConnectors } from "@replit/connectors-sdk";
import type Stripe from "stripe";
import {
  assertStripeProxyMode,
  assertStripeConnectionEnvironment,
  createCheckoutSession,
  expectedStripeLivemode,
  listStripeCheckoutSessions,
  retrieveCheckoutSessionForPaymentIntent,
  StripeConnectionModeError,
  StripeCheckoutModeError,
  validateCheckoutSessionMode,
} from "./stripeClient";

function checkoutSessionFixture(
  id: string,
  status: Stripe.Checkout.Session.Status,
): Stripe.Checkout.Session {
  return {
    id,
    livemode: false,
    status,
    line_items: {
      object: "list",
      data: [
        {
          id: `li_${id}`,
          object: "item",
          price: {
            id: `price_${id}`,
            object: "price",
            product: `prod_${id}`,
          } as Stripe.Price,
        } as Stripe.LineItem,
      ],
      has_more: false,
      url: `/v1/checkout/sessions/${id}/line_items`,
    },
  } as Stripe.Checkout.Session;
}

function session(livemode: boolean): Stripe.Checkout.Session {
  return {
    id: livemode ? "cs_live_example" : "cs_test_example",
    livemode,
  } as Stripe.Checkout.Session;
}

test("production expects live Stripe checkout sessions", () => {
  assert.equal(expectedStripeLivemode({ NODE_ENV: "production" }), true);
  assert.equal(expectedStripeLivemode({ NODE_ENV: "development" }), false);
  assert.equal(
    expectedStripeLivemode({
      NODE_ENV: "development",
      REPLIT_ENVIRONMENT: "production",
    }),
    false,
  );
  assert.equal(expectedStripeLivemode({ REPLIT_ENVIRONMENT: "production" }), true);
  assert.equal(expectedStripeLivemode({ REPLIT_ENVIRONMENT: "development" }), false);
});

test("Stripe connection binding must match the requested runtime environment", () => {
  assert.doesNotThrow(() =>
    assertStripeConnectionEnvironment({
      NODE_ENV: "development",
      REPLIT_ENVIRONMENT: "development",
    }),
  );
  assert.doesNotThrow(() =>
    assertStripeConnectionEnvironment({
      NODE_ENV: "production",
      REPLIT_ENVIRONMENT: "production",
    }),
  );
  assert.throws(
    () =>
      assertStripeConnectionEnvironment({
        NODE_ENV: "development",
        REPLIT_ENVIRONMENT: "production",
      }),
    /does not match requested runtime environment "development"/,
  );
  assert.throws(
    () =>
      assertStripeConnectionEnvironment({
        NODE_ENV: "production",
        REPLIT_ENVIRONMENT: "development",
      }),
    /does not match requested runtime environment "production"/,
  );
});

test("checkout mode validation accepts the expected account mode", () => {
  const liveSession = session(true);
  const testSession = session(false);

  assert.equal(validateCheckoutSessionMode(liveSession, true), liveSession);
  assert.equal(validateCheckoutSessionMode(testSession, false), testSession);
});

test("checkout mode validation rejects a session from the wrong account mode", () => {
  assert.throws(
    () => validateCheckoutSessionMode(session(false), true),
    (error: unknown) => {
      assert.ok(error instanceof StripeCheckoutModeError);
      assert.equal(error.code, "stripe_checkout_mode_mismatch");
      assert.equal(error.sessionId, "cs_test_example");
      assert.equal(error.expectedLivemode, true);
      assert.equal(error.actualLivemode, false);
      assert.match(error.message, /expected live mode/);
      return true;
    },
  );
});

test("development checkout is blocked before any Stripe write when the proxy is live", async (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });

  const requests: string[] = [];
  t.mock.method(
    ReplitConnectors.prototype,
    "proxy",
    async (_service: string, path: string, options: { method?: string }) => {
      requests.push(`${options.method ?? "GET"} ${path}`);
      return new Response(
        JSON.stringify({
          data: [{ id: "price_live_fixture", livemode: true }],
          has_more: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  );

  await assert.rejects(
    createCheckoutSession(
      {
        orderId: "order_test",
        priceId: "price_test",
        successUrl: "https://artcovr.com/return",
        cancelUrl: "https://artcovr.com/cancel",
        expiresAt: new Date(Date.now() + 60_000),
        metadata: {},
      },
      "checkout-test-idempotency",
    ),
    (error: unknown) =>
      error instanceof StripeConnectionModeError &&
      error.code === "stripe_connection_mode_mismatch",
  );
  assert.deepEqual(requests, ["GET /v1/prices?limit=1"]);
});

test("refund association filters by PI and fails closed on ambiguous sessions", async () => {
  const canonical = checkoutSessionFixture("cs_refund_association", "complete");
  const paths: string[] = [];
  const page = (data: Stripe.Checkout.Session[], has_more = false) =>
    ({ object: "list", data, has_more, url: "/v1/checkout/sessions" }) as Stripe.ApiList<Stripe.Checkout.Session>;
  assert.equal(
    await retrieveCheckoutSessionForPaymentIntent("pi_specific", async (path) => {
      paths.push(path);
      return page([canonical]);
    }),
    canonical,
  );
  const query = new URL(paths[0]!, "https://stripe.test");
  assert.equal(query.pathname, "/v1/checkout/sessions");
  assert.equal(query.searchParams.get("payment_intent"), "pi_specific");
  assert.equal(query.searchParams.get("limit"), "2");
  assert.equal(await retrieveCheckoutSessionForPaymentIntent("pi_unknown", async () => page([])), null);
  await assert.rejects(
    retrieveCheckoutSessionForPaymentIntent("pi_ambiguous", async () => page([canonical, canonical])),
    /Ambiguous/,
  );
  await assert.rejects(
    retrieveCheckoutSessionForPaymentIntent("pi_paginated", async () => page([canonical], true)),
    /Ambiguous/,
  );
});

test("Checkout session fixtures preserve lifecycle status, expanded prices, and pagination", async () => {
  const requests: string[] = [];
  const pages: Array<Stripe.ApiList<Stripe.Checkout.Session>> = [
    {
      object: "list",
      data: [
        checkoutSessionFixture("cs_open_fixture", "open"),
        checkoutSessionFixture("cs_expired_fixture", "expired"),
      ],
      has_more: true,
      url: "/v1/checkout/sessions",
    },
    {
      object: "list",
      data: [checkoutSessionFixture("cs_complete_fixture", "complete")],
      has_more: false,
      url: "/v1/checkout/sessions",
    },
  ];

  const sessions = await listStripeCheckoutSessions(async (path) => {
    requests.push(path);
    const page = pages.shift();
    assert.ok(page);
    return page;
  });

  assert.deepEqual(
    sessions.map(({ id, status }) => ({ id, status })),
    [
      { id: "cs_open_fixture", status: "open" },
      { id: "cs_expired_fixture", status: "expired" },
      { id: "cs_complete_fixture", status: "complete" },
    ],
  );
  assert.equal(
    (sessions[0]?.line_items?.data[0]?.price as Stripe.Price).product,
    "prod_cs_open_fixture",
  );
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const url = new URL(request, "https://stripe.test");
    assert.deepEqual(url.searchParams.getAll("expand[]"), [
      "data.line_items.data.price",
    ]);
  }
  assert.equal(
    new URL(requests[1] ?? "", "https://stripe.test").searchParams.get(
      "starting_after",
    ),
    "cs_expired_fixture",
  );
});

test("Stripe mode is rechecked after a successful mutation before another write", async (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
  let connectedLivemode = false;
  const requests: string[] = [];
  t.mock.method(ReplitConnectors.prototype, "proxy", async (_service: string, path: string, options: { method?: string }) => {
    const method = options.method ?? "GET";
    requests.push(`${method} ${path}`);
    let payload: unknown;
    if (method === "GET" && path === "/v1/prices?limit=1") {
      payload = { data: [{ id: "price_mode_recheck", livemode: connectedLivemode }], has_more: false };
    } else if (method === "POST" && path === "/v1/checkout/sessions") {
      payload = { id: "cs_mode_recheck", livemode: connectedLivemode, status: "open", url: "https://checkout.stripe.test/mode-recheck" };
    } else {
      throw new Error(`Unexpected Stripe boundary request: ${method} ${path}`);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const input = { orderId: "order_mode_recheck", priceId: "price_mode_recheck",
    successUrl: "https://artcovr.example/return", cancelUrl: "https://artcovr.example/cancel",
    expiresAt: new Date(Date.now() + 31 * 60_000), metadata: {} };
  const first = await createCheckoutSession(input, "mode-recheck-first");
  assert.equal(first.livemode, false);
  connectedLivemode = true;
  await assert.rejects(createCheckoutSession(input, "mode-recheck-second"), (error: unknown) => {
    assert.ok(error instanceof StripeConnectionModeError);
    assert.equal(error.code, "stripe_connection_mode_mismatch");
    assert.equal(error.expectedLivemode, false);
    assert.equal(error.actualLivemode, true);
    return true;
  });
  assert.deepEqual(requests, ["GET /v1/prices?limit=1", "POST /v1/checkout/sessions", "GET /v1/prices?limit=1"]);
});
