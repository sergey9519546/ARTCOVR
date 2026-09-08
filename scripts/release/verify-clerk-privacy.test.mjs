import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  clerkPrivacySmokePreflight,
  runClerkPrivacySmoke,
  stopDisposableApi,
  waitForApiHealth,
} from "./verify-clerk-privacy.mjs";

const smokeEnv = {
  CLERK_SECRET_KEY: "sk_test_fixture",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  DATABASE_URL: "postgresql://user:fixture@127.0.0.1/disposable",
  NODE_ENV: "development",
};

function startHarness({ ignoreSigterm = false } = {}) {
  const signalHandler = ignoreSigterm
    ? "process.on('SIGTERM', () => {})"
    : "";
  return spawn(
    process.execPath,
    [
      "-e",
      `${signalHandler}; console.log('ready'); setInterval(() => {}, 1000);`,
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
}

async function waitForHarnessToStart(child) {
  await new Promise((resolve, reject) => {
    child.stdout.setEncoding("utf8");
    child.stdout.once("data", (output) => {
      if (output.includes("ready")) resolve();
      else reject(new Error(`unexpected harness output: ${output}`));
    });
    child.once("error", reject);
  });
}

function silentLifecycleOptions(child, { smokeStatus = 0, healthError } = {}) {
  return {
    startApi: async () => ({ baseUrl: "http://127.0.0.1:4321", child, port: 4321 }),
    waitForHealth: async () => {
      if (healthError) throw healthError;
    },
    runSmoke: async () => ({ error: undefined, status: smokeStatus }),
    log: () => {},
    error: () => {},
    warn: () => {},
  };
}

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

for (const scenario of [
  { name: "success", smokeStatus: 0 },
  { name: "smoke failure", smokeStatus: 1 },
  {
    name: "startup failure",
    smokeStatus: 0,
    healthError: new Error("database health failed"),
  },
]) {
  test(`Clerk privacy lifecycle stops the disposable API after ${scenario.name}`, async () => {
    const child = startHarness();
    await waitForHarnessToStart(child);

    const result = await runClerkPrivacySmoke(
      smokeEnv,
      silentLifecycleOptions(child, scenario),
    );

    assert.equal(result, scenario.smokeStatus === 0 && !scenario.healthError ? 0 : 1);
    assert.equal(child.signalCode, "SIGTERM");
    assert.equal(child.exitCode, null);
  });
}

test("Clerk privacy lifecycle force-stops a child that ignores graceful shutdown", async () => {
  const child = startHarness({ ignoreSigterm: true });
  await waitForHarnessToStart(child);

  const result = await runClerkPrivacySmoke(
    smokeEnv,
    {
      ...silentLifecycleOptions(child),
      stopApi: (apiChild) => stopDisposableApi(apiChild, { stopTimeoutMs: 10 }),
    },
  );

  assert.equal(result, 0);
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(child.exitCode, null);
});
