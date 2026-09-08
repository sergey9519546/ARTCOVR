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

test("Clerk privacy release check rejects production and credential-bearing targets", () => {
  for (const baseUrl of [
    "https://artcovr.com",
    "https://other-workspace.replit.dev",
    "http://user:password@127.0.0.1:4321",
    "http://127.0.0.1:4321/api",
  ]) {
    assert.equal(
      clerkPrivacySmokePreflight({
        CLERK_SECRET_KEY: "sk_test_fixture",
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
        DATABASE_URL: "postgresql://user:fixture@127.0.0.1/disposable",
        NODE_ENV: "development",
        REPLIT_DEV_DOMAIN: "this-workspace.replit.dev",
        ARTCOVR_DEV_SMOKE_BASE_URL: baseUrl,
      }).kind,
      "rejected",
    );
  }
});

test("Clerk privacy release check allows this workspace's development target", () => {
  assert.deepEqual(
    clerkPrivacySmokePreflight({
      CLERK_SECRET_KEY: "sk_test_fixture",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
      DATABASE_URL: "postgresql://user:fixture@127.0.0.1/disposable",
      NODE_ENV: "development",
      REPLIT_DEV_DOMAIN: "this-workspace.replit.dev",
      ARTCOVR_DEV_SMOKE_BASE_URL:
        "https://this-workspace.replit.dev",
    }),
    {
      kind: "ready",
      baseUrl: "https://this-workspace.replit.dev",
    },
  );
});