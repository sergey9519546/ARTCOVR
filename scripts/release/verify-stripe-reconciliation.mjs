import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");

export function runStripeReconciliationReleaseCheck({
  spawn = spawnSync,
  log = console.log,
  error = console.error,
  cwd = root,
  env = process.env,
  platform = process.platform,
} = {}) {
  const args = ["--filter", "@workspace/api-server", "run", "stripe:catalog:reconcile"];
  // pnpm supplies the path to its JavaScript entry point when invoking a
  // package script. Run that exact CLI without a shell. A direct invocation
  // uses the platform launcher; the Windows command is entirely static.
  const cliPath = env.npm_execpath;
  const command = cliPath ? process.execPath : platform === "win32" ? "cmd.exe" : "pnpm";
  const commandArgs = cliPath
    ? [cliPath, ...args]
    : platform === "win32"
      ? ["/d", "/s", "/c", "pnpm --filter @workspace/api-server run stripe:catalog:reconcile"]
      : args;
  const result = spawn(
    command,
    commandArgs,
    {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runStripeReconciliationReleaseCheck();
}
