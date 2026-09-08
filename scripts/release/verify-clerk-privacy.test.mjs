import assert from "node:assert/strict";
import test from "node:test";
import { clerkPrivacySmokePreflight } from "./verify-clerk-privacy.mjs";

test("Clerk privacy release check reports an environment gap without running", () => {
  const result = clerkPrivacySmokePreflight({ NODE_ENV: "development" });
  assert.deepEqual(result, {
    kind: "skipped",
    reason:
      "missing test-only environment: CLERK_SECRET_KEY, VITE_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY, DATABASE_URL",
  });
});

test("Clerk privacy release check rejects live keys and production", () => {
  assert.equal(
    clerkPrivacySmokePreflight({
      CLERK_SECRET_KEY: "sk_live_fixture",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
      DATABASE_URL: "postgresql://user:fixture@127.0.0.1/disposable",
      NODE_ENV: "development",
    }).kind,
    "rejected",
  );
  assert.equal(
    clerkPrivacySmokePreflight({
      CLERK_SECRET_KEY: "sk_test_fixture",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
      DATABASE_URL: "postgresql://user:fixture@127.0.0.1/disposable",
      NODE_ENV: "production",
    }).kind,
    "rejected",
  );
});

test("Clerk privacy release check derives a local API target only for test inputs", () => {
  assert.deepEqual(
    clerkPrivacySmokePreflight({
      CLERK_SECRET_KEY: "sk_test_fixture",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
      DATABASE_URL: "postgresql://user:fixture@127.0.0.1/disposable",
      NODE_ENV: "development",
      PORT: "4321",
    }),
    { kind: "ready", baseUrl: "http://127.0.0.1:4321" },
  );
});