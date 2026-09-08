import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupDevelopmentSmokeFixtures,
  developmentSmokeFailureReason,
  developmentSmokeOptions,
  type DevelopmentSmokeCleanupDependencies,
} from "./developmentSmoke";

const environment = { CLERK_SECRET_KEY: "sk_test_fixture", VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture", DATABASE_URL: "postgresql://postgres:fixture@127.0.0.1:55439/disposable", NODE_ENV: "development" };
const args = ["--dev-smoke", "--base-url", "http://127.0.0.1:3001"];

test("development smoke requires explicit opt-in and never enables paid generation by default", () => {
  assert.throws(() => developmentSmokeOptions([], environment), /Requires --dev-smoke/);
  assert.equal(developmentSmokeOptions(args, environment).generate, false);
  assert.equal(developmentSmokeOptions([...args, "--generate"], environment).generate, true);
});

test("development smoke refuses live keys, production deployments, and remote databases", () => {
  assert.throws(() => developmentSmokeOptions(args, { ...environment, CLERK_SECRET_KEY: "sk_live_fixture" }), /test secret/);
  assert.throws(() => developmentSmokeOptions(args, { ...environment, VITE_CLERK_PUBLISHABLE_KEY: "pk_live_fixture" }), /test publishable/);
  assert.throws(() => developmentSmokeOptions(args, { ...environment, REPLIT_DEPLOYMENT: "1" }), /production/);
  assert.throws(() => developmentSmokeOptions(args, { ...environment, DATABASE_URL: "postgresql://user:fixture@production.example.com/db" }), /production databases/);
});

test("development smoke restricts token destinations and rejects credential-bearing URLs", () => {
  for (const base of ["https://artcovr.com", "https://other-workspace.replit.dev", "http://user:password@127.0.0.1", "http://127.0.0.1/path"]) {
    assert.throws(() => developmentSmokeOptions(["--dev-smoke", "--base-url", base], environment), /Target must/);
  }
  const replit = { ...environment, REPL_ID: "fixture", REPLIT_DEV_DOMAIN: "this-workspace.replit.dev", DATABASE_URL: "postgresql://user:fixture@helium/database" };
  assert.equal(developmentSmokeOptions(["--dev-smoke", "--base-url", "https://this-workspace.replit.dev"], replit).base, "https://this-workspace.replit.dev");
});

test("development smoke keeps DNS and timeout failures readable without exposing request details", () => {
  const dnsCause = Object.assign(
    new Error("getaddrinfo ENOTFOUND this-workspace.replit.dev"),
    { code: "ENOTFOUND" },
  );
  const timeoutCause = { name: "TimeoutError", message: "The operation was aborted due to timeout" };

  assert.equal(
    developmentSmokeFailureReason(
      Object.assign(new TypeError("fetch failed"), { cause: dnsCause }),
    ),
    "DNS resolution failed (ENOTFOUND).",
  );
  assert.equal(
    developmentSmokeFailureReason(timeoutCause),
    "Request timed out (TimeoutError).",
  );
  assert.equal(
    developmentSmokeFailureReason(new Error("unexpected response")),
    undefined,
  );
});

const cleanupInput = {
  runId: "smoke-run-fixture",
  users: ["user-0", "user-1"],
  sessions: ["session-0", "session-1"],
  orderIds: ["order-0", "order-1"],
  ledgerIds: ["ledger-0", "ledger-1"],
  generationIds: ["generation-0", "generation-1"],
};

function cleanupHarness(options: {
  failures?: string[];
  remaining?: Partial<Record<"generations" | "ledger" | "orders", string[]>>;
} = {}) {
  const calls: string[] = [];
  const failures = new Set(options.failures);
  const remaining = options.remaining ?? {};
  const operation = (name: string, result?: () => Promise<void>) => async () => {
    calls.push(name);
    if (failures.has(name)) throw new Error(`${name} failed`);
    await result?.();
  };
  const dependencies: DevelopmentSmokeCleanupDependencies = {
    timeoutRunningGenerations: operation("timeout generations"),
    listGenerations: async () => {
      calls.push("list generations");
      if (failures.has("list generations")) throw new Error("list generations failed");
      return [
        {
          id: "generation-0",
          artworkId: "artwork-0",
          cleanObjectKey: "generated/artwork-0/generation-0/clean.webp",
          previewObjectKey: null,
        },
        {
          id: "generation-1",
          artworkId: "artwork-1",
          cleanObjectKey: null,
          previewObjectKey: "generated/artwork-1/generation-1/preview.webp",
        },
      ];
    },
    removePrivate: operation("remove private images"),
    deleteGeneration: (id) => operation(`delete generation ${id}`)(),
    deleteLedger: operation("delete ledger"),
    deleteOrders: operation("delete orders"),
    remainingGenerationIds: async () => {
      calls.push("verify generations");
      if (failures.has("verify generations")) throw new Error("verify generations failed");
      return remaining.generations ?? [];
    },
    remainingLedgerIds: async () => {
      calls.push("verify ledger");
      if (failures.has("verify ledger")) throw new Error("verify ledger failed");
      return remaining.ledger ?? [];
    },
    remainingOrderIds: async () => {
      calls.push("verify orders");
      if (failures.has("verify orders")) throw new Error("verify orders failed");
      return remaining.orders ?? [];
    },
    revokeSession: (id) => operation(`revoke ${id}`)(),
    deleteUser: (id) => operation(`delete ${id}`)(),
    closePool: operation("close pool"),
  };
  return { calls, dependencies };
}

async function runFailedSmokePhase(
  phase: "seeding" | "API assertions",
  dependencies: DevelopmentSmokeCleanupDependencies,
) {
  try {
    try {
      throw new Error(`${phase} failed`);
    } finally {
      await cleanupDevelopmentSmokeFixtures(cleanupInput, dependencies);
    }
  } catch (error) {
    return error;
  }
}

test("cleanup still removes every fixture category after seeding or API assertions fail", async () => {
  for (const phase of ["seeding", "API assertions"] as const) {
    const harness = cleanupHarness();
    const error = await runFailedSmokePhase(phase, harness.dependencies);
    assert.match(String(error), new RegExp(`${phase} failed`));
    assert.deepEqual(harness.calls, [
      "timeout generations",
      "list generations",
      "remove private images",
      "delete generation generation-0",
      "remove private images",
      "delete generation generation-1",
      "delete ledger",
      "delete orders",
      "verify generations",
      "verify ledger",
      "verify orders",
      "revoke session-0",
      "revoke session-1",
      "delete user-0",
      "delete user-1",
      "close pool",
    ]);
  }
});

test("cleanup reports object-removal and leftover-generation failures but still removes accounts", async () => {
  const harness = cleanupHarness({
    failures: ["remove private images"],
    remaining: { generations: ["generation-0", "generation-1"] },
  });

  await assert.rejects(
    cleanupDevelopmentSmokeFixtures(cleanupInput, harness.dependencies),
    (error: Error) => {
      assert.match(
        error.message,
        /Cleanup incomplete for fixture generation objects, fixture generations; run marker smoke-run-fixture\./,
      );
      return true;
    },
  );
  assert.ok(harness.calls.includes("revoke session-0"));
  assert.ok(harness.calls.includes("delete user-1"));
  assert.ok(harness.calls.includes("close pool"));
});

test("cleanup attempts every category and reports all incomplete categories with its run marker", async () => {
  const harness = cleanupHarness({
    failures: [
      "timeout generations",
      "delete ledger",
      "delete orders",
      "verify generations",
      "verify ledger",
      "verify orders",
      "revoke session-0",
      "revoke session-1",
      "delete user-0",
      "delete user-1",
      "close pool",
    ],
  });

  await assert.rejects(
    cleanupDevelopmentSmokeFixtures(cleanupInput, harness.dependencies),
    (error: Error) => {
      assert.match(
        error.message,
        /Cleanup incomplete for fixture generation objects, fixture credit ledger, fixture orders, cleanup verification, Clerk session, Clerk test user, database connection; run marker smoke-run-fixture\./,
      );
      return true;
    },
  );
  assert.ok(harness.calls.includes("verify orders"));
  assert.ok(harness.calls.includes("delete user-1"));
});
