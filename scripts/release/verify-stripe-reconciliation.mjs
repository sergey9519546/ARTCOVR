import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const result = spawnSync(
  "pnpm",
  ["--filter", "@workspace/api-server", "run", "stripe:catalog:reconcile"],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`Stripe reconciliation could not start: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `Stripe reconciliation release check FAILED with exit code ${result.status ?? "unknown"}.`,
  );
  process.exit(result.status ?? 1);
}

console.log(
  "Stripe reconciliation release check OK: no unresolved live-order references.",
);