import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SKIPPED_ENVIRONMENT_GAP = 78;
const API_STARTUP_TIMEOUT_MS = 60_000;
const API_HEALTH_POLL_MS = 250;
const API_STOP_TIMEOUT_MS = 5_000;
const POSTGRES_START_TIMEOUT_SECONDS = 30;
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

function isLoopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

function withoutDatabaseEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => key !== "DATABASE_URL" && !/^PG[A-Z0-9_]*$/.test(key),
    ),
  );
}

export function disposableDatabaseEnvironment(env, databaseUrl) {
  const database = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !isLoopbackHost(database.hostname) ||
    !database.port
  ) {
    throw new Error("Disposable PostgreSQL must use a loopback TCP connection.");
  }
  return {
    ...withoutDatabaseEnvironment(env),
    DATABASE_URL: databaseUrl,
  };
}

function postgresToolEnvironment(env) {
  return {
    PATH: env.PATH ?? process.env.PATH ?? "",
    HOME: env.HOME ?? tmpdir(),
    LANG: env.LANG ?? "C",
  };
}

function runPostgresCommand(
  command,
  args,
  phase,
  { runCommand = spawnSync, env = process.env } = {},
) {
  const result = runCommand(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: postgresToolEnvironment(env),
  });
  if (result.error || result.status !== 0) {
    const code =
      result.error?.code ??
      (result.status === null ? result.signal ?? "unknown" : result.status);
    throw new Error(`Disposable PostgreSQL ${phase} failed (code ${code}).`);
  }
  return result;
}

export async function startDisposablePostgres(
  env = process.env,
  { runCommand = spawnSync, makeTempDirectory = mkdtemp } = {},
) {
  const rootDir = await makeTempDirectory(
    join(tmpdir(), "artcovr-clerk-privacy-"),
  );
  const dataDir = join(rootDir, "data");
  const socketDir = join(rootDir, "socket");
  const logFile = join(rootDir, "postgres.log");
  let port;
  const databaseName = `clerk_privacy_${randomUUID().replaceAll("-", "")}`;
  let serverMayBeRunning = false;
  let cluster = { rootDir, dataDir, socketDir, logFile, databaseName };
  try {
    port = await findAvailableLoopbackPort();
    cluster = { ...cluster, port };
    await mkdir(socketDir);
    runPostgresCommand(
      "initdb",
      [
        "--pgdata",
        dataDir,
        "--username=postgres",
        "--auth=trust",
        "--no-locale",
        "--encoding=UTF8",
      ],
      "initialization",
      { runCommand, env },
    );
    serverMayBeRunning = true;
    runPostgresCommand(
      "pg_ctl",
      [
        "--pgdata",
        dataDir,
        "--log",
        logFile,
        "--options",
        `-h 127.0.0.1 -p ${port} -k ${socketDir} -c listen_addresses=127.0.0.1`,
        "--wait",
        "--timeout",
        String(POSTGRES_START_TIMEOUT_SECONDS),
        "start",
      ],
      "startup",
      { runCommand, env },
    );
    runPostgresCommand(
      "createdb",
      [
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--username",
        "postgres",
        databaseName,
      ],
      "database creation",
      { runCommand, env },
    );
    return {
      ...cluster,
      databaseUrl: `postgresql://postgres@127.0.0.1:${port}/${databaseName}`,
    };
  } catch (error) {
    const partialCluster = { ...cluster, serverMayBeRunning };
    const teardown = await stopDisposablePostgres(partialCluster, {
      runCommand,
      removeDirectory: rm,
      env,
    });
    if (!teardown.ok) {
      const primary =
        error instanceof Error ? error.message : "unknown startup failure";
      throw new Error(`${primary}; ${teardown.error}`);
    }
    throw error;
  }
}

export async function stopDisposablePostgres(
  cluster,
  {
    runCommand = spawnSync,
    removeDirectory = rm,
    env = process.env,
  } = {},
) {
  if (cluster.serverMayBeRunning !== false) {
    const stop = (mode) =>
      runCommand(
        "pg_ctl",
        [
          "--pgdata",
          cluster.dataDir,
          "--mode",
          mode,
          "--wait",
          "--timeout",
          String(POSTGRES_START_TIMEOUT_SECONDS),
          "stop",
        ],
        {
          cwd: workspaceRoot,
          encoding: "utf8",
          stdio: "pipe",
          env: postgresToolEnvironment(env),
        },
      );
    let result = stop("fast");
    if (result.error || result.status !== 0) {
      result = stop("immediate");
      if (result.error || result.status !== 0) {
        const status = runCommand(
          "pg_ctl",
          ["--pgdata", cluster.dataDir, "status"],
          {
            cwd: workspaceRoot,
            encoding: "utf8",
            stdio: "pipe",
            env: postgresToolEnvironment(env),
          },
        );
        if (status.error || status.status === 0) {
          const code =
            result.error?.code ??
            (result.status === null
              ? result.signal ?? "unknown"
              : result.status);
          return {
            ok: false,
            error: `PostgreSQL could not be stopped safely (code ${code}); temporary files were retained.`,
          };
        }
      }
    }
  }
  try {
    await removeDirectory(cluster.rootDir, { recursive: true, force: true });
    return { ok: true, action: "stopped-and-removed" };
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "unknown";
    return { ok: false, error: `PostgreSQL temporary files could not be removed (code ${code}).` };
  }
}

export function migrateDisposableDatabase(
  env,
  { runCommand = spawnSync } = {},
) {
  const childEnv = disposableDatabaseEnvironment(env, env.DATABASE_URL);
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = runCommand(
    pnpm,
    ["--filter", "@workspace/db", "run", "migrate"],
    {
      cwd: workspaceRoot,
      env: childEnv,
      stdio: "inherit",
      encoding: "utf8",
    },
  );
  if (result.error || result.status !== 0) {
    const code =
      result.error?.code ??
      (result.status === null ? result.signal ?? "unknown" : result.status);
    throw new Error(`Disposable database migration failed (code ${code}).`);
  }
}

async function findAvailableLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!address || typeof address === "string") {
    throw new Error("Could not reserve a disposable API port.");
  }
  return address.port;
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    let timeout;
    const onExit = () => settle(true);
    const onClose = () => settle(true);
    const settle = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      resolve(exited);
    };
    timeout = setTimeout(() => settle(false), timeoutMs);
    child.once("exit", onExit);
    child.once("close", onClose);
  });
}

export async function stopDisposableApi(
  child,
  { stopTimeoutMs = API_STOP_TIMEOUT_MS } = {},
) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { ok: true, action: "already-exited" };
  }

  let termError;
  try {
    child.kill("SIGTERM");
  } catch (error) {
    termError = error instanceof Error ? error.message : String(error);
  }
  const stoppedAfterTerm = await waitForChildExit(child, stopTimeoutMs);
  if (stoppedAfterTerm) {
    return {
      ok: true,
      action: "sigterm",
      ...(termError ? { warning: termError } : {}),
    };
  }

  let killError;
  try {
    child.kill("SIGKILL");
  } catch (error) {
    killError = error instanceof Error ? error.message : String(error);
  }
  const stoppedAfterKill = await waitForChildExit(child, stopTimeoutMs);
  if (stoppedAfterKill) {
    return {
      ok: true,
      action: "sigkill",
      ...(killError ? { warning: killError } : {}),
    };
  }
  return {
    ok: false,
    error:
      killError ??
      `process did not exit after SIGTERM and SIGKILL within ${stopTimeoutMs * 2}ms`,
  };
}

export async function waitForApiHealth(
  baseUrl,
  child,
  {
    startupTimeoutMs = API_STARTUP_TIMEOUT_MS,
    healthPollMs = API_HEALTH_POLL_MS,
    fetchHealth = fetch,
  } = {},
) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastFailure = "no health response";
  let childError;
  const onChildError = (error) => {
    childError = error;
  };
  child.once("error", onChildError);
  try {
    while (Date.now() < deadline) {
      if (childError) {
        throw new Error(
          `Disposable API startup failed during process readiness: ${childError.message}`,
        );
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Disposable API exited during process readiness (status ${
            child.exitCode ?? child.signalCode
          }).`,
        );
      }
      try {
        const response = await fetchHealth(`${baseUrl}/api/healthz`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (response.status === 200) return;
        lastFailure = `HTTP ${response.status}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, healthPollMs));
    }
  } finally {
    child.removeListener("error", onChildError);
  }
  throw new Error(
    `Disposable API readiness timed out after ${startupTimeoutMs}ms; final health failure: ${lastFailure}.`,
  );
}

export async function startDisposableApi(
  env,
  { spawnProcess = spawn } = {},
) {
  const port = await findAvailableLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(
    `Disposable API startup: launching on isolated port ${port} (readiness phase: process startup).`,
  );
  const childEnv = {
    ...disposableDatabaseEnvironment(env, env.DATABASE_URL),
    NODE_ENV: "development",
    REPLIT_ENVIRONMENT: "development",
    PORT: String(port),
    ARTCOVR_SKIP_STRIPE_INIT: "1",
    ARTCOVR_PUBLIC_ORIGIN: baseUrl,
    ARTCOVR_STOREFRONT_ORIGINS: baseUrl,
    CLERK_PUBLISHABLE_KEY:
      env.CLERK_PUBLISHABLE_KEY ?? env.VITE_CLERK_PUBLISHABLE_KEY,
  };
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawnProcess(
    pnpm,
    ["--filter", "@workspace/api-server", "run", "dev"],
    {
      cwd: workspaceRoot,
      env: childEnv,
      stdio: "inherit",
    },
  );
  console.log(
    `Disposable API readiness: waiting for database health on isolated port ${port} (readiness phase: database).`,
  );
  return { baseUrl, child, port };
}

function runDevelopmentSmoke(
  env,
  baseUrl,
  disposableApi,
  { spawnProcess = spawnSync } = {},
) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const smokeArgs = [
    "--filter",
    "@workspace/api-server",
    "exec",
    "tsx",
    "src/developmentSmoke.ts",
    "--dev-smoke",
    "--base-url",
    baseUrl,
  ];
  if (disposableApi) smokeArgs.push("--origin", disposableApi.baseUrl);
  return spawnProcess(pnpm, smokeArgs, {
    env: {
      ...disposableDatabaseEnvironment(env, env.DATABASE_URL),
      REPLIT_ENVIRONMENT: "development",
      ...(disposableApi
        ? {
            ARTCOVR_PUBLIC_ORIGIN: disposableApi.baseUrl,
            ARTCOVR_STOREFRONT_ORIGINS: disposableApi.baseUrl,
          }
        : {}),
    },
    stdio: ["ignore", "inherit", "pipe"],
    encoding: "utf8",
  });
}

export function clerkPrivacySmokePreflight(env) {
  if (env.REPLIT_DEPLOYMENT === "1" || env.NODE_ENV === "production") {
    return {
      kind: "rejected",
      reason: "the Clerk privacy smoke is development-only and cannot run in production",
    };
  }

  const liveKey = env.CLERK_SECRET_KEY && !env.CLERK_SECRET_KEY.startsWith("sk_test_");
  const livePublishable =
    (env.VITE_CLERK_PUBLISHABLE_KEY ?? env.CLERK_PUBLISHABLE_KEY) &&
    !(env.VITE_CLERK_PUBLISHABLE_KEY ?? env.CLERK_PUBLISHABLE_KEY).startsWith(
      "pk_test_",
    );
  if (liveKey || livePublishable) {
    return {
      kind: "rejected",
      reason: "live Clerk keys are refused; provide matching sk_test_/pk_test_ keys",
    };
  }

  if (env.ARTCOVR_DEV_SMOKE_BASE_URL) {
    return {
      kind: "rejected",
      reason:
        "configured API targets are refused; the Clerk privacy smoke always starts its own local API",
    };
  }

  const missing = [];
  if (!env.CLERK_SECRET_KEY) missing.push("CLERK_SECRET_KEY");
  if (!(env.VITE_CLERK_PUBLISHABLE_KEY ?? env.CLERK_PUBLISHABLE_KEY)) {
    missing.push("VITE_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY");
  }
  if (missing.length) {
    return {
      kind: "skipped",
      reason: `missing test-only environment: ${missing.join(", ")}`,
    };
  }

  return {
    kind: "ready",
    baseUrl: `http://127.0.0.1:${env.PORT ?? "8080"}`,
  };
}

export async function runClerkPrivacySmoke(
  env = process.env,
  {
    startDatabase = startDisposablePostgres,
    migrateDatabase = migrateDisposableDatabase,
    stopDatabase = stopDisposablePostgres,
    startApi = startDisposableApi,
    waitForHealth = waitForApiHealth,
    runSmoke = runDevelopmentSmoke,
    stopApi = stopDisposableApi,
    log = console.log,
    error = console.error,
    warn = console.warn,
  } = {},
) {
  const decision = clerkPrivacySmokePreflight(env);
  if (decision.kind === "skipped") {
    error(
      `CLERK PRIVACY SMOKE SKIPPED (environment gap): ${decision.reason}`,
    );
    return SKIPPED_ENVIRONMENT_GAP;
  }
  if (decision.kind === "rejected") {
    error(`CLERK PRIVACY SMOKE REJECTED: ${decision.reason}`);
    return 2;
  }

  let disposableDatabase;
  let disposableApi;
  let smokeStatus = 1;
  try {
    disposableDatabase = await startDatabase(env);
    const isolatedEnv = disposableDatabaseEnvironment(
      env,
      disposableDatabase.databaseUrl,
    );
    log("Disposable PostgreSQL cluster ready; only its local database will be migrated.");
    await migrateDatabase(isolatedEnv);
    log("Disposable database migrations complete.");

    disposableApi = await startApi(isolatedEnv);
    decision.baseUrl = disposableApi.baseUrl;
    await waitForHealth(disposableApi.baseUrl, disposableApi.child);
    log(
      `Disposable API readiness complete: database health is ready on isolated port ${disposableApi.port}.`,
    );

    const result = await runSmoke(isolatedEnv, decision.baseUrl, disposableApi);
    if (result.error) {
      error(`CLERK PRIVACY SMOKE FAILED TO START: ${result.error.message}`);
      smokeStatus = 1;
    } else {
      smokeStatus = result.status ?? 1;
      if (smokeStatus !== 0 && result.stderr) {
        const output = Buffer.isBuffer(result.stderr)
          ? result.stderr.toString("utf8")
          : String(result.stderr);
        if (output.trim()) {
          error(`CLERK PRIVACY SMOKE FAILED: ${output.trim()}`);
        }
      }
    }
  } catch (smokeError) {
    const message =
      smokeError instanceof Error ? smokeError.message : String(smokeError);
    error(`CLERK PRIVACY SMOKE FAILED: ${message}`);
    smokeStatus = 1;
  } finally {
    if (disposableApi) {
      try {
        const teardown = await stopApi(disposableApi.child);
        if (!teardown.ok) {
          error(
            `CLERK PRIVACY SMOKE TEARDOWN FAILED: ${teardown.error}`,
          );
          if (smokeStatus === 0) smokeStatus = 1;
        } else {
          log(
            `Disposable API teardown complete: ${teardown.action} (isolated port ${disposableApi.port}).`,
          );
          if (teardown.warning) {
            warn(
              `Disposable API teardown warning: ${teardown.warning}`,
            );
          }
        }
      } catch (teardownError) {
        const message =
          teardownError instanceof Error
            ? teardownError.message
            : String(teardownError);
        error(`CLERK PRIVACY SMOKE TEARDOWN FAILED: ${message}`);
        if (smokeStatus === 0) smokeStatus = 1;
      }
    }
    if (disposableDatabase) {
      try {
        const teardown = await stopDatabase(disposableDatabase);
        if (!teardown.ok) {
          error(`CLERK PRIVACY DATABASE TEARDOWN FAILED: ${teardown.error}`);
          smokeStatus = 1;
        } else {
          log(
            "Disposable PostgreSQL teardown complete: stopped and removed its temporary cluster.",
          );
        }
      } catch (teardownError) {
        const message =
          teardownError instanceof Error
            ? teardownError.message
            : String(teardownError);
        error(`CLERK PRIVACY DATABASE TEARDOWN FAILED: ${message}`);
        smokeStatus = 1;
      }
    }
    log(
      `CLERK PRIVACY SMOKE RESULT: ${
        smokeStatus === 0 ? "passed" : `failed (exit ${smokeStatus})`
      }`,
    );
  }
  return smokeStatus;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runClerkPrivacySmoke().then((status) => {
    process.exitCode = status;
  });
}
