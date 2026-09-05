import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import {
  expectedStripeLivemode,
  StripeCheckoutModeError,
  validateCheckoutSessionMode,
} from "./stripeClient";

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