import assert from "node:assert/strict";
import test from "node:test";
import { shouldRotateCheckoutKey } from "./checkout-errors.ts";

test("checkout mode failures rotate the idempotency key", () => {
  assert.equal(
    shouldRotateCheckoutKey({ code: "stripe_checkout_mode_mismatch" }),
    true,
  );
  assert.equal(
    shouldRotateCheckoutKey({ code: "stripe_connection_mode_mismatch" }),
    true,
  );
  assert.equal(
    shouldRotateCheckoutKey({ code: "stripe_connection_mode_unverified" }),
    true,
  );
  assert.equal(shouldRotateCheckoutKey({ code: "invalid_request" }), false);
});
