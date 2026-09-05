import assert from "node:assert/strict";
import test from "node:test";
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
