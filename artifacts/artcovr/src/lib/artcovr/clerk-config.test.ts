import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionClerkKey,
  isDevelopmentClerkKey,
} from "./clerk-config";

test("recognizes development Clerk publishable keys without exposing their value", () => {
  assert.equal(isDevelopmentClerkKey("pk_test_example"), true);
  assert.equal(isDevelopmentClerkKey("pk_live_example"), false);
  assert.equal(isDevelopmentClerkKey(undefined), false);
});

test("rejects missing and development Clerk keys for production", () => {
  assert.throws(
    () => assertProductionClerkKey(undefined),
    /required for production builds/,
  );
  assert.throws(
    () => assertProductionClerkKey("pk_test_example"),
    /live Clerk publishable key/,
  );
});

test("accepts a live Clerk publishable key for production", () => {
  assert.equal(assertProductionClerkKey("pk_live_example"), "pk_live_example");
});