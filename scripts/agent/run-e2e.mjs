/**
 * Own the Playwright dev server lifecycle explicitly.
 *
 * Playwright's `webServer` wrapper can leave Next's grandchild process running
 * on Windows after every assertion has passed. That leaked process keeps the
 * port and `next-build/dev/lock`, making the next run reuse the wrong worktree
 * or hang during teardown. This runner starts each requested storefront mode
 * on its own fresh local port, points Playwright at it, and terminates only the
 * process trees it spawned. The default gate certifies public and staging in
 * separate server processes so neither projection can stand in for the other.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const START_TIMEOUT_MS = 120_000;
const RUNNER_MODE_OPTION = "--artcovr-mode";
const APP_MODES = ["public", "staging"];

function parseArguments(args) {
  let requestedMode = "all";
  const playwrightArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === RUNNER_MODE_OPTION) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${RUNNER_MODE_OPTION} requires public, staging, or all.`);
      }
      requestedMode = value;
      index += 1;
      continue;
    }
    if (argument.startsWith(`${RUNNER_MODE_OPTION}=`)) {
      requestedMode = argument.slice(RUNNER_MODE_OPTION.length + 1);
      continue;
    }
    playwrightArgs.push(argument);
  }

  if (![...APP_MODES, "all"].includes(requestedMode)) {
    throw new Error(
      `Invalid ${RUNNER_MODE_OPTION} value "${requestedMode}"; use public, staging, or all.`,
    );
  }

  return {
    modes: requestedMode === "all" ? APP_MODES : [requestedMode],
    playwrightArgs,
  };
}

function run(command, args, options) {
  const child = spawn(command, args, options);
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return { child, completed };
}

function isChildRunning(child) {
  return Boolean(child.pid) && child.exitCode === null && child.signalCode === null;
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("Could not allocate a local port for Playwright.");
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isChildRunning(child)) {
      const status = child.exitCode !== null
        ? `code ${child.exitCode}`
        : `signal ${child.signalCode ?? "unknown"}`;
      throw new Error(`Next dev server exited before readiness (${status}).`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {
      // Cold compilation and connection refusal are expected while Next starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next dev server did not become ready within ${START_TIMEOUT_MS / 1000}s.`);
}

async function waitForChildExit(child, timeoutMs = 5_000) {
  if (!isChildRunning(child)) return true;
  return new Promise((resolve) => {
    let timer;
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    child.once("exit", onExit);
    timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    if (!isChildRunning(child)) finish(true);
  });
}

async function waitForPortRelease(port, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const available = await new Promise((resolve) => {
      const probe = createServer();
      probe.unref();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => {
        probe.close(() => resolve(true));
      });
    });
    if (available) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function terminateOwnedTree(child, { label, port } = {}) {
  const pid = child.pid;

  // An exited ChildProcess no longer proves ownership of its numeric PID. In
  // particular, never hand an exited PID to taskkill: Windows may already have
  // reused it for an unrelated process.
  if (pid && isChildRunning(child)) {
    if (process.platform === "win32") {
      let killed = false;
      try {
        // The live-child guard is intentionally adjacent to taskkill. It is the
        // last ownership check available before asking Windows to walk the tree.
        if (isChildRunning(child)) {
          const killer = run("taskkill", ["/PID", String(pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
            shell: false,
          });
          const result = await killer.completed;
          killed = result.code === 0;
        }
      } catch {
        // Restricted shells may deny taskkill. The retained ChildProcess handle
        // remains the safe fallback for the process itself.
      }
      if (!killed && isChildRunning(child)) child.kill("SIGTERM");
    } else {
      try {
        // Both Next and Playwright are spawned detached on POSIX, so the
        // negative PID addresses only the process group this runner created.
        process.kill(-pid, "SIGTERM");
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
      if (!(await waitForChildExit(child))) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch (error) {
          if (error?.code !== "ESRCH") throw error;
        }
      }
    }
  }

  if (port && !(await waitForPortRelease(port))) {
    throw new Error(`Owned ${label ?? "process"} tree ${pid ?? "unknown"} left port ${port} open.`);
  }
}

function runPlaywright(baseUrl, mode, playwrightArgs) {
  const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
  return run(process.execPath, [playwrightCli, "test", ...playwrightArgs], {
    cwd: projectRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      PLAYWRIGHT_ARTCOVR_MODE: mode,
      PLAYWRIGHT_BASE_URL: baseUrl,
    },
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
}

async function main() {
  const { modes, playwrightArgs } = parseArguments(process.argv.slice(2));
  const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
  if (externalBaseUrl && modes.length !== 1) {
    throw new Error(
      `PLAYWRIGHT_BASE_URL can certify only one explicit mode; pass ${RUNNER_MODE_OPTION}=public or ${RUNNER_MODE_OPTION}=staging.`,
    );
  }
  if (process.env.PLAYWRIGHT_PORT && modes.length !== 1) {
    throw new Error(
      `PLAYWRIGHT_PORT can pin only one explicit mode; omit it for the dual-mode gate.`,
    );
  }

  let activeServer;
  let activePlaywright;
  let interruptedSignal;
  let resolveInterrupt;
  const interrupted = new Promise((resolve) => {
    resolveInterrupt = resolve;
  });
  const interrupt = (signal) => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    resolveInterrupt(signal);
  };
  const onSigint = () => interrupt("SIGINT");
  const onSigterm = () => interrupt("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    let failed = false;
    for (const mode of modes) {
      if (interruptedSignal) break;

      let baseUrl = externalBaseUrl;
      try {
        if (!baseUrl) {
          const port = process.env.PLAYWRIGHT_PORT
            ? Number(process.env.PLAYWRIGHT_PORT)
            : await unusedPort();
          if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
            throw new Error(`Invalid PLAYWRIGHT_PORT: ${process.env.PLAYWRIGHT_PORT}`);
          }
          baseUrl = `http://127.0.0.1:${port}`;
          const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
          const isStaging = mode === "staging";
          activeServer = {
            ...run(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
              cwd: projectRoot,
              detached: process.platform !== "win32",
              env: {
                ...process.env,
                ARTCOVR_ALLOW_INDEXING: isStaging ? "0" : "1",
                NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING: isStaging ? "1" : "0",
                NEXT_PUBLIC_SITE_URL: baseUrl,
              },
              stdio: "inherit",
              windowsHide: true,
              shell: false,
            }),
            port,
          };

          const startup = await Promise.race([
            waitForServer(baseUrl, activeServer.child).then(() => "ready"),
            interrupted.then(() => "interrupted"),
          ]);
          if (startup === "interrupted") break;
        }

        console.log(`\n=== ARTCOVR Playwright: ${mode} mode ===`);
        activePlaywright = runPlaywright(baseUrl, mode, playwrightArgs);
        const outcome = await Promise.race([
          activePlaywright.completed.then((result) => ({ type: "completed", result })),
          interrupted.then(() => ({ type: "interrupted" })),
        ]);
        if (outcome.type === "interrupted") break;
        if (outcome.result.code !== 0) failed = true;
      } finally {
        if (interruptedSignal && activePlaywright) {
          await terminateOwnedTree(activePlaywright.child, { label: `Playwright (${mode})` });
        }
        activePlaywright = undefined;
        if (activeServer) {
          await terminateOwnedTree(activeServer.child, {
            label: `Next (${mode})`,
            port: activeServer.port,
          });
        }
        activeServer = undefined;
      }
    }
    if (failed) process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    if (interruptedSignal && activePlaywright) {
      await terminateOwnedTree(activePlaywright.child, { label: "Playwright" });
    }
    if (activeServer) {
      await terminateOwnedTree(activeServer.child, { label: "Next", port: activeServer.port });
    }
    if (interruptedSignal) {
      process.exitCode = interruptedSignal === "SIGINT" ? 130 : 143;
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
