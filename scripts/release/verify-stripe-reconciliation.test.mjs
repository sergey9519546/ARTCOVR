import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runStripeReconciliationReleaseCheck,
} from "./verify-stripe-reconciliation.mjs";

function fakeSpawn(result) {
  return (...args) => {
    args.push(result);
    return result;
  };
}

test("release reconciliation reports a child-process startup failure", () => {
  const diagnostics = [];
  const exitCode = runStripeReconciliationReleaseCheck({
    spawn: fakeSpawn({ error: new Error("pnpm was not found"), status: null }),
    error: (message) => diagnostics.push(message),
    log: () => {
      throw new Error("A failed release check must not report success.");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(diagnostics, [
    "Stripe reconciliation could not start: pnpm was not found",
  ]);
});

test("release reconciliation propagates and reports a nonzero child exit", () => {
  const diagnostics = [];
  const exitCode = runStripeReconciliationReleaseCheck({
    spawn: fakeSpawn({ error: undefined, status: 2 }),
    error: (message) => diagnostics.push(message),
    log: () => {
      throw new Error("A failed release check must not report success.");
    },
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(diagnostics, [
    "Stripe reconciliation release check FAILED with exit code 2.",
  ]);
});

test("release reconciliation preserves the successful release message", () => {
  const messages = [];
  const exitCode = runStripeReconciliationReleaseCheck({
    spawn: fakeSpawn({ error: undefined, status: 0 }),
    log: (message) => messages.push(message),
    error: () => {
      throw new Error("A successful release check must not report failure.");
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(messages, [
    "Stripe reconciliation release check OK: no unresolved live-order references.",
  ]);
});

test("release reconciliation launches pnpm's exact CLI without shell interpolation", () => {
  let invocation;
  const cliPath = "C:/Tool directory/pnpm/bin/pnpm.cjs";
  assert.equal(runStripeReconciliationReleaseCheck({
    env: { npm_execpath: cliPath },
    spawn: (...args) => { invocation = args; return { status: 0 }; },
    log: () => {},
  }), 0);
  assert.equal(invocation[0], process.execPath);
  assert.deepEqual(invocation[1], [cliPath, "--filter", "@workspace/api-server", "run", "stripe:catalog:reconcile"]);
  assert.equal(invocation[2].shell, undefined);
});

test("direct Windows invocation uses a fixed command and hides its console", () => {
  let invocation;
  runStripeReconciliationReleaseCheck({
    env: {},
    platform: "win32",
    spawn: (...args) => { invocation = args; return { status: 0 }; },
    log: () => {},
  });
  assert.equal(invocation[0], "cmd.exe");
  assert.deepEqual(invocation[1], ["/d", "/s", "/c", "pnpm --filter @workspace/api-server run stripe:catalog:reconcile"]);
  assert.equal(invocation[2].windowsHide, true);
});

test("running the release script as a CLI actually runs the check and propagates failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "artcovr-release-cli-"));
  try {
    const cliPath = join(directory, "pnpm-fixture.mjs");
    await writeFile(cliPath, 'console.log("RECONCILIATION_CHILD_RAN"); process.exitCode = 17;');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./verify-stripe-reconciliation.mjs", import.meta.url))], {
      env: { ...process.env, npm_execpath: cliPath },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 17, result.stderr);
    assert.match(result.stdout, /RECONCILIATION_CHILD_RAN/);
    assert.match(result.stderr, /FAILED with exit code 17/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
