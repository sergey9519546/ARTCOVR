import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

export function runStripeReconciliationReleaseCheck({
  spawn = spawnSync,
  log = console.log,
  error = console.error,
  cwd = root,
  env = process.env,
} = {}) {
  const result = spawn(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "stripe:catalog:reconcile"],
    {
      cwd,
      env,
      stdio: "inherit",
    },
  );

  if (result.error) {
    error(`Stripe reconciliation could not start: ${result.error.message}`);
    return 1;
  }

  if (result.status !== 0) {
    const exitCode = result.status ?? 1;
    error(
      `Stripe reconciliation release check FAILED with exit code ${exitCode}.`,
    );
    return exitCode;
  }

  log(
    "Stripe reconciliation release check OK: no unresolved live-order references.",
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runStripeReconciliationReleaseCheck();
}