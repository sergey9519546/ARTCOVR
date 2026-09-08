import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  classifyConfiguredTargetFailure,
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

test("Clerk privacy configured-target failures map stable categories", () => {
  const dnsError = Object.assign(
    new Error("getaddrinfo ENOTFOUND this-workspace.replit.dev"),
    { code: "ENOTFOUND" },
  );
  const timeoutError = Object.assign(
    new Error("The operation was aborted due to timeout"),
    { code: "ETIMEDOUT", name: "TimeoutError" },
  );
  const refusedError = Object.assign(
    new Error("connect ECONNREFUSED 127.0.0.1:4321"),
    { code: "ECONNREFUSED" },
  );

  assert.deepEqual(classifyConfiguredTargetFailure({ error: dnsError }), {
    category: "dns",
    detail: dnsError.message,
  });
  assert.deepEqual(classifyConfiguredTargetFailure({ error: timeoutError }), {
    category: "timeout",
    detail: timeoutError.message,
  });
  assert.deepEqual(classifyConfiguredTargetFailure({ error: refusedError }), {
    category: "connection-refused",
    detail: refusedError.message,
  });
  assert.deepEqual(
    classifyConfiguredTargetFailure({ status: 7 }),
    {
      category: "smoke",
      detail: "the smoke command exited with status 7",
    },
  );
});

test("Clerk privacy lifecycle leaves a configured shared API running", async () => {
  const configuredBaseUrl = "http://127.0.0.1:4321";
  const expectedStatus = 7;
  let receivedSmokeTarget;
  let receivedDisposableApi = "not-called";
  let stopApiCalls = 0;
  const errors = [];

  const result = await runClerkPrivacySmoke(
    {
      ...smokeEnv,
      ARTCOVR_DEV_SMOKE_BASE_URL: configuredBaseUrl,
    },
    {
      startApi: async () => {
        assert.fail("configured targets must not start a disposable API");
      },
      waitForHealth: async () => {
        assert.fail("configured targets must not run disposable API readiness");
      },
      runSmoke: async (_env, baseUrl, disposableApi) => {
        receivedSmokeTarget = baseUrl;
        receivedDisposableApi = disposableApi;
        return { error: undefined, status: expectedStatus };
      },
      stopApi: async () => {
        stopApiCalls += 1;
      },
      log: () => {},
      error: (message) => errors.push(message),
      warn: () => {},
    },
  );

  assert.equal(receivedSmokeTarget, configuredBaseUrl);
  assert.equal(receivedDisposableApi, undefined);
  assert.equal(stopApiCalls, 0);
  assert.equal(result, expectedStatus);
  assert.deepEqual(
    JSON.parse(
      errors
        .find((message) =>
          message.startsWith(
            "CLERK PRIVACY SMOKE CONFIGURED TARGET FAILURE: ",
          ),
        )
        .slice("CLERK PRIVACY SMOKE CONFIGURED TARGET FAILURE: ".length),
    ),
    {
      category: "smoke",
      detail: `the smoke command exited with status ${expectedStatus}`,
    },
  );
});

test("Clerk privacy smoke explains an unreachable configured target without touching its lifecycle", async () => {
  const configuredBaseUrl = "http://127.0.0.1:9";
  const errors = [];
  let smokeTarget;
  let startApiCalls = 0;
  let waitForHealthCalls = 0;
  let stopApiCalls = 0;

  const result = await runClerkPrivacySmoke(
    {
      ...smokeEnv,
      ARTCOVR_DEV_SMOKE_BASE_URL: configuredBaseUrl,
    },
    {
      startApi: async () => {
        startApiCalls += 1;
        assert.fail("configured targets must not start a disposable API");
      },
      waitForHealth: async () => {
        waitForHealthCalls += 1;
        assert.fail("configured targets must not run disposable API readiness");
      },
      runSmoke: async (_env, baseUrl) => {
        smokeTarget = baseUrl;
        try {
          await fetch(`${baseUrl}/api/healthz`, {
            signal: AbortSignal.timeout(1_000),
          });
          return { status: 0 };
        } catch (error) {
          return { error };
        }
      },
      stopApi: async () => {
        stopApiCalls += 1;
      },
      log: () => {},
      error: (message) => errors.push(message),
      warn: () => {},
    },
  );

  assert.equal(result, 1);
  assert.equal(smokeTarget, configuredBaseUrl);
  assert.equal(startApiCalls, 0);
  assert.equal(waitForHealthCalls, 0);
  assert.equal(stopApiCalls, 0);
  assert.match(
    errors.join("\n"),
    new RegExp(
      `CLERK PRIVACY SMOKE FAILED FOR CONFIGURED TARGET ${configuredBaseUrl.replaceAll(".", "\\.")}`,
    ),
  );
  assert.match(errors.join("\n"), /configured API may be unreachable/);
  assert.doesNotMatch(errors.join("\n"), /TEARDOWN FAILED|Disposable API startup/);
});

for (const outage of [
  {
    name: "a DNS failure",
    reason: "DNS resolution failed (ENOTFOUND).",
    category: "dns",
  },
  {
    name: "a request timeout",
    reason: "Request timed out (TimeoutError).",
    category: "timeout",
  },
]) {
  test(`Clerk privacy smoke keeps ${outage.name} scoped to the configured target`, async () => {
    const configuredBaseUrl = "https://this-workspace.replit.dev";
    const errors = [];
    let smokeTarget;
    let startApiCalls = 0;
    let waitForHealthCalls = 0;
    let stopApiCalls = 0;

    const result = await runClerkPrivacySmoke(
      {
        ...smokeEnv,
        REPLIT_DEV_DOMAIN: "this-workspace.replit.dev",
        ARTCOVR_DEV_SMOKE_BASE_URL: configuredBaseUrl,
      },
      {
        startApi: async () => {
          startApiCalls += 1;
          assert.fail("configured targets must not start a disposable API");
        },
        waitForHealth: async () => {
          waitForHealthCalls += 1;
          assert.fail("configured targets must not run disposable API readiness");
        },
        runSmoke: async (_env, baseUrl) => {
          smokeTarget = baseUrl;
          return {
            status: 1,
            stderr: `Development smoke failed at health: ${outage.reason} Credentials and response bodies were withheld.`,
          };
        },
        stopApi: async () => {
          stopApiCalls += 1;
        },
        log: () => {},
        error: (message) => errors.push(message),
        warn: () => {},
      },
    );

    const output = errors.join("\n");
    assert.equal(result, 1);
    assert.equal(smokeTarget, configuredBaseUrl);
    assert.equal(startApiCalls, 0);
    assert.equal(waitForHealthCalls, 0);
    assert.equal(stopApiCalls, 0);
    assert.match(
      output,
      new RegExp(
        `CLERK PRIVACY SMOKE FAILED FOR CONFIGURED TARGET ${configuredBaseUrl.replaceAll(".", "\\.")}`,
      ),
    );
    assert.match(output, new RegExp(outage.reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(output, /configured API may be unreachable/);
    assert.deepEqual(
      JSON.parse(
        errors
          .find((message) =>
            message.startsWith(
              "CLERK PRIVACY SMOKE CONFIGURED TARGET FAILURE: ",
            ),
          )
          .slice("CLERK PRIVACY SMOKE CONFIGURED TARGET FAILURE: ".length),
      ),
      {
        category: outage.category,
        detail: `Development smoke failed at health: ${outage.reason} Credentials and response bodies were withheld.`,
      },
    );
    assert.doesNotMatch(output, /Disposable API startup|Disposable API readiness/);
    assert.doesNotMatch(output, /TEARDOWN FAILED|Disposable API teardown/);
  });
}

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
    const logs = [];

    const result = await runClerkPrivacySmoke(
      smokeEnv,
      {
        ...silentLifecycleOptions(child, scenario),
        log: (message) => logs.push(message),
      },
    );

    assert.equal(result, scenario.smokeStatus === 0 && !scenario.healthError ? 0 : 1);
    assert.equal(child.signalCode, "SIGTERM");
    assert.equal(child.exitCode, null);
    assert.ok(
      logs.includes(
        "Disposable API teardown complete: sigterm (isolated port 4321).",
      ),
    );
  });
}

test("Clerk privacy lifecycle force-stops a child that ignores graceful shutdown", async () => {
  const child = startHarness({ ignoreSigterm: true });
  await waitForHarnessToStart(child);
  const logs = [];

  const result = await runClerkPrivacySmoke(
    smokeEnv,
    {
      ...silentLifecycleOptions(child),
      stopApi: (apiChild) => stopDisposableApi(apiChild, { stopTimeoutMs: 10 }),
      log: (message) => logs.push(message),
    },
  );

  assert.equal(result, 0);
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(child.exitCode, null);
  assert.ok(
    logs.includes(
      "Disposable API teardown complete: sigkill (isolated port 4321).",
    ),
  );
});
