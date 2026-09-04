import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  StripeWebhookSignatureError,
  verifyStripeWebhookSignature,
} from "./webhookSecurity";

const secret = "whsec_release_test_secret";
const payload = Buffer.from(JSON.stringify({ id: "evt_release_probe" }));
const timestamp = 1_700_000_000;

function signatureFor(body: Buffer, at = timestamp) {
  return `t=${at},v1=${createHmac("sha256", secret)
    .update(`${at}.${body.toString("utf8")}`)
    .digest("hex")}`;
}

test("Stripe webhook signatures accept the exact raw body", () => {
  assert.equal(
    verifyStripeWebhookSignature(payload, signatureFor(payload), secret, timestamp),
    true,
  );
});

test("Stripe webhook signatures reject a changed body", () => {
  assert.throws(
    () =>
      verifyStripeWebhookSignature(
        Buffer.from(JSON.stringify({ id: "evt_changed" })),
        signatureFor(payload),
        secret,
        timestamp,
      ),
    StripeWebhookSignatureError,
  );
});

test("Stripe webhook signatures reject replayed timestamps and missing secrets", () => {
  assert.throws(
    () => verifyStripeWebhookSignature(payload, signatureFor(payload), secret, timestamp + 301),
    /outside the allowed time window/,
  );
  assert.throws(
    () => verifyStripeWebhookSignature(payload, signatureFor(payload), undefined, timestamp),
    /STRIPE_WEBHOOK_SECRET is required/,
  );
});