import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  clerkPrivacySmokePreflight,
  stopDisposableApi,
  waitForApiHealth,
} from "./verify-clerk-privacy.mjs";

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

test("Clerk privacy readiness errors preserve the final health probe failure", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;

  let attempts = 0;
  await assert.rejects(
    waitForApiHealth("http://127.0.0.1:4321", child, {
      startupTimeoutMs: 100,
      healthPollMs: 0,
      fetchHealth: async () => {
        attempts += 1;
        if (attempts === 1) return { status: 503 };
        throw new Error("connect ECONNREFUSED 127.0.0.1:4321");
      },
    }),
    /final health failure: connect ECONNREFUSED 127\.0\.0\.1:4321/,
  );
});

test("Clerk privacy teardown reports when the disposable API ignores both signals", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => true;

  await assert.deepEqual(
    await stopDisposableApi(child, { stopTimeoutMs: 1 }),
    {
      ok: false,
      error: "process did not exit after SIGTERM and SIGKILL within 2ms",
    },
  );
});
