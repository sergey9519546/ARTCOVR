import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import {
  expectedStripeLivemode,
  listStripeCheckoutSessions,
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