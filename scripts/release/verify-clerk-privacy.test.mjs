import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  clerkPrivacySmokePreflight,
  disposableDatabaseEnvironment,
  migrateDisposableDatabase,
  runClerkPrivacySmoke,
  startDisposablePostgres,
  stopDisposableApi,
  stopDisposablePostgres,
  waitForApiHealth,
} from "./verify-clerk-privacy.mjs";

const smokeEnv = {
  CLERK_SECRET_KEY: "sk_test_fixture",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  DATABASE_URL: "postgresql://customer.invalid/customer_data",
  PGHOST: "customer.invalid",
  PGPORT: "5432",
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

test("privacy verifier requires test Clerk keys but does not depend on inherited database settings", () => {
  assert.deepEqual(
    clerkPrivacySmokePreflight({ NODE_ENV: "development" }),
    {
      kind: "skipped",
      reason:
        "missing test-only environment: CLERK_SECRET_KEY, VITE_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY",
    },
  );

  assert.deepEqual(
    clerkPrivacySmokePreflight(smokeEnv),
    { kind: "ready", baseUrl: "http://127.0.0.1:8080" },
  );
  assert.deepEqual(
    clerkPrivacySmokePreflight({
      ...smokeEnv,
      PORT: "4321",
      DATABASE_URL: "postgresql://production.invalid/live",
    }),
    { kind: "ready", baseUrl: "http://127.0.0.1:4321" },
  );
});

test("privacy verifier rejects live keys, production, and every configured API target", () => {
  assert.equal(
    clerkPrivacySmokePreflight({
      ...smokeEnv,
      CLERK_SECRET_KEY: "sk_live_fixture",
    }).kind,
    "rejected",
  );
  assert.equal(
    clerkPrivacySmokePreflight({
      ...smokeEnv,
      NODE_ENV: "production",
    }).kind,
    "rejected",
  );
  for (const baseUrl of [
    "http://127.0.0.1:4321",
    "https://this-workspace.replit.dev",
    "https://artcovr.com",
  ]) {
    assert.deepEqual(
      clerkPrivacySmokePreflight({
        ...smokeEnv,
        ARTCOVR_DEV_SMOKE_BASE_URL: baseUrl,
      }),
      {
        kind: "rejected",
        reason:
          "configured API targets are refused; the Clerk privacy smoke always starts its own local API",
      },
    );
  }
});

test("child environments contain only the disposable loopback database target", () => {
  const databaseUrl = "postgresql://postgres@127.0.0.1:55439/clerk_privacy";
  const childEnv = disposableDatabaseEnvironment(
    {
      ...smokeEnv,
      PGDATABASE: "customer_data",
      PGUSER: "customer",
      PGPASSWORD: "not-used",
      OTHER_SETTING: "preserved",
    },
    databaseUrl,
  );

  assert.equal(childEnv.DATABASE_URL, databaseUrl);
  assert.equal(childEnv.OTHER_SETTING, "preserved");
  assert.equal(
    Object.keys(childEnv).some((key) => key.startsWith("PG")),
    false,
  );
  assert.throws(
    () =>
      disposableDatabaseEnvironment(
        smokeEnv,
        "postgresql://db.production.invalid/customer_data",
      ),
    /loopback TCP connection/,
  );
});

test("privacy lifecycle migrates and uses one fresh database before starting local API and smoke", async () => {
  const order = [];
  const seenEnvironments = [];
  const logs = [];
  const databaseUrl =
    "postgresql://postgres@127.0.0.1:55439/clerk_privacy_run";
  const child = new EventEmitter();
  child.exitCode = 0;
  child.signalCode = null;

  const result = await runClerkPrivacySmoke(smokeEnv, {
    startDatabase: async () => {
      order.push("start database");
      return { databaseUrl, rootDir: "/tmp/disposable-fixture" };
    },
    migrateDatabase: async (env) => {
      order.push("migrate");
      seenEnvironments.push(env);
    },
    startApi: async (env) => {
      order.push("start API");
      seenEnvironments.push(env);
      return { baseUrl: "http://127.0.0.1:4321", child, port: 4321 };
    },
    waitForHealth: async () => {
      order.push("health");
    },
    runSmoke: async (env) => {
      order.push("smoke");
      seenEnvironments.push(env);
      return { status: 0 };
    },
    stopApi: async () => {
      order.push("stop API");
      return { ok: true, action: "already-exited" };
    },
    stopDatabase: async () => {
      order.push("stop database");
      return { ok: true, action: "stopped-and-removed" };
    },
    log: (message) => logs.push(message),
    error: (message) => assert.fail(message),
    warn: () => {},
  });

  assert.equal(result, 0);
  assert.deepEqual(order, [
    "start database",
    "migrate",
    "start API",
    "health",
    "smoke",
    "stop API",
    "stop database",
  ]);
  for (const env of seenEnvironments) {
    assert.equal(env.DATABASE_URL, databaseUrl);
    assert.equal(env.PGHOST, undefined);
    assert.equal(env.PGPORT, undefined);
  }
  assert.ok(logs.includes("Disposable database migrations complete."));
  assert.ok(
    logs.includes(
      "Disposable PostgreSQL teardown complete: stopped and removed its temporary cluster.",
    ),
  );
});

test("privacy lifecycle always removes its database after migration failure and never starts the API", async () => {
  const order = [];
  const errors = [];
  const result = await runClerkPrivacySmoke(smokeEnv, {
    startDatabase: async () => ({
      databaseUrl: "postgresql://postgres@127.0.0.1:55439/clerk_privacy_run",
    }),
    migrateDatabase: async () => {
      order.push("migrate");
      throw new Error("migration failed (code 42)");
    },
    startApi: async () => {
      assert.fail("API must not start if local migrations fail");
    },
    stopDatabase: async () => {
      order.push("stop database");
      return { ok: true, action: "stopped-and-removed" };
    },
    error: (message) => errors.push(message),
    log: () => {},
    warn: () => {},
  });

  assert.equal(result, 1);
  assert.deepEqual(order, ["migrate", "stop database"]);
  assert.match(errors.join("\n"), /migration failed \(code 42\)/);
});

test("disposable PostgreSQL migrations ignore the inherited database and PG connection variables", async () => {
  const inheritedEnv = {
    ...process.env,
    DATABASE_URL: "postgresql://customer.invalid/customer_data",
    PGHOST: "customer.invalid",
    PGDATABASE: "customer_data",
    PGUSER: "customer",
  };
  const cluster = await startDisposablePostgres(inheritedEnv);
  try {
    migrateDisposableDatabase({
      ...inheritedEnv,
      DATABASE_URL: cluster.databaseUrl,
    });
    const result = spawnSync(
      "psql",
      [
        "--no-psqlrc",
        cluster.databaseUrl,
        "--tuples-only",
        "--no-align",
        "--command",
        "SELECT to_regclass('public.artcovr_orders') IS NOT NULL",
      ],
      { encoding: "utf8", stdio: "pipe" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "t");
  } finally {
    const teardown = await stopDisposablePostgres(cluster);
    assert.deepEqual(teardown, {
      ok: true,
      action: "stopped-and-removed",
    });
    assert.equal(existsSync(cluster.rootDir), false);
  }
});

test("API readiness preserves the last database health probe failure", async () => {
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

test("API teardown reports when the disposable API ignores both signals", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => true;

  assert.deepEqual(
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
  test(`privacy lifecycle stops the API after ${scenario.name}`, async () => {
    const child = startHarness();
    await waitForHarnessToStart(child);
    const logs = [];

    const result = await runClerkPrivacySmoke(smokeEnv, {
      startDatabase: async () => ({
        databaseUrl: "postgresql://postgres@127.0.0.1:55439/clerk_privacy_run",
      }),
      migrateDatabase: async () => {},
      startApi: async () => ({
        baseUrl: "http://127.0.0.1:4321",
        child,
        port: 4321,
      }),
      waitForHealth: async () => {
        if (scenario.healthError) throw scenario.healthError;
      },
      runSmoke: async () => ({ status: scenario.smokeStatus }),
      stopDatabase: async () => ({
        ok: true,
        action: "stopped-and-removed",
      }),
      log: (message) => logs.push(message),
      error: () => {},
      warn: () => {},
    });

    assert.equal(
      result,
      scenario.smokeStatus === 0 && !scenario.healthError ? 0 : 1,
    );
    assert.equal(child.signalCode, "SIGTERM");
    assert.ok(
      logs.includes(
        "Disposable API teardown complete: sigterm (isolated port 4321).",
      ),
    );
  });
}

test("API teardown force-stops a child that ignores graceful shutdown", async () => {
  const child = startHarness({ ignoreSigterm: true });
  await waitForHarnessToStart(child);
  const logs = [];

  const result = await runClerkPrivacySmoke(smokeEnv, {
    startDatabase: async () => ({
      databaseUrl: "postgresql://postgres@127.0.0.1:55439/clerk_privacy_run",
    }),
    migrateDatabase: async () => {},
    startApi: async () => ({
      baseUrl: "http://127.0.0.1:4321",
      child,
      port: 4321,
    }),
    waitForHealth: async () => {},
    runSmoke: async () => ({ status: 0 }),
    stopApi: (apiChild) =>
      stopDisposableApi(apiChild, { stopTimeoutMs: 10 }),
    stopDatabase: async () => ({
      ok: true,
      action: "stopped-and-removed",
    }),
    log: (message) => logs.push(message),
    error: () => {},
    warn: () => {},
  });

  assert.equal(result, 0);
  assert.equal(child.signalCode, "SIGKILL");
  assert.ok(
    logs.includes(
      "Disposable API teardown complete: sigkill (isolated port 4321).",
    ),
  );
});
