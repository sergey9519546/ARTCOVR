import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKIPPED_ENVIRONMENT_GAP = 78;
const API_STARTUP_TIMEOUT_MS = 60_000;
const API_HEALTH_POLL_MS = 250;
const API_STOP_TIMEOUT_MS = 5_000;
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

function isLoopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

function isSafeDevelopmentTarget(rawBaseUrl, env) {
  try {
    const baseUrl = new URL(rawBaseUrl);
    const loopback = isLoopbackHost(baseUrl.hostname);
    const workspaceDevDomain =
      baseUrl.protocol === "https:" &&
      baseUrl.hostname.endsWith(".replit.dev") &&
      baseUrl.hostname === env.REPLIT_DEV_DOMAIN;
    return (
      (loopback || workspaceDevDomain) &&
      ["http:", "https:"].includes(baseUrl.protocol) &&
      !baseUrl.username &&
      !baseUrl.password &&
      baseUrl.pathname === "/" &&
      !baseUrl.search &&
      !baseUrl.hash
    );
  } catch {
    return false;
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

async function startDisposableApi(env) {
  const port = await findAvailableLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(
    `Disposable API startup: launching on isolated port ${port} (readiness phase: process startup).`,
  );
  const childEnv = {
    ...env,
    NODE_ENV: "development",
    PORT: String(port),
    ARTCOVR_SKIP_STRIPE_INIT: "1",
    ARTCOVR_PUBLIC_ORIGIN: baseUrl,
    ARTCOVR_STOREFRONT_ORIGINS: baseUrl,
    CLERK_PUBLISHABLE_KEY:
      env.CLERK_PUBLISHABLE_KEY ?? env.VITE_CLERK_PUBLISHABLE_KEY,
  };
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
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

  const missing = [];
  if (!env.CLERK_SECRET_KEY) missing.push("CLERK_SECRET_KEY");
  if (!(env.VITE_CLERK_PUBLISHABLE_KEY ?? env.CLERK_PUBLISHABLE_KEY)) {
    missing.push("VITE_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY");
  }
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (missing.length) {
    return {
      kind: "skipped",
      reason: `missing test-only environment: ${missing.join(", ")}`,
    };
  }

  const configuredBaseUrl = env.ARTCOVR_DEV_SMOKE_BASE_URL;
  if (configuredBaseUrl && !isSafeDevelopmentTarget(configuredBaseUrl, env)) {
    return {
      kind: "rejected",
      reason:
        "the Clerk privacy smoke target must be a loopback origin or this workspace's exact REPLIT_DEV_DOMAIN",
    };
  }

  return {
    kind: "ready",
    baseUrl: configuredBaseUrl ?? `http://127.0.0.1:${env.PORT ?? "8080"}`,
  };
}

export async function runClerkPrivacySmoke(env = process.env) {
  const decision = clerkPrivacySmokePreflight(env);
  if (decision.kind === "skipped") {
    console.error(
      `CLERK PRIVACY SMOKE SKIPPED (environment gap): ${decision.reason}`,
    );
    return SKIPPED_ENVIRONMENT_GAP;
  }
  if (decision.kind === "rejected") {
    console.error(`CLERK PRIVACY SMOKE REJECTED: ${decision.reason}`);
    return 2;
  }

  let disposableApi;
  let smokeStatus = 1;
  try {
    const usesConfiguredTarget = Boolean(env.ARTCOVR_DEV_SMOKE_BASE_URL);
    if (usesConfiguredTarget) {
      console.log(`Using configured development API target ${decision.baseUrl}.`);
    } else {
      disposableApi = await startDisposableApi(env);
      decision.baseUrl = disposableApi.baseUrl;
      await waitForApiHealth(disposableApi.baseUrl, disposableApi.child);
      console.log(
        `Disposable API readiness complete: database health is ready on isolated port ${disposableApi.port}.`,
      );
    }

    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const smokeArgs = [
      "--filter",
      "@workspace/api-server",
      "exec",
      "tsx",
      "src/developmentSmoke.ts",
      "--dev-smoke",
      "--base-url",
      decision.baseUrl,
    ];
    if (disposableApi) smokeArgs.push("--origin", disposableApi.baseUrl);
    const result = spawnSync(pnpm, smokeArgs, {
      env: disposableApi
        ? {
            ...env,
            ARTCOVR_PUBLIC_ORIGIN: disposableApi.baseUrl,
            ARTCOVR_STOREFRONT_ORIGINS: disposableApi.baseUrl,
          }
        : env,
      stdio: "inherit",
    });
    if (result.error) {
      console.error(
        `CLERK PRIVACY SMOKE FAILED TO START: ${result.error.message}`,
      );
      smokeStatus = 1;
    } else {
      smokeStatus = result.status ?? 1;
    }
  } catch (error) {
    console.error(
      `CLERK PRIVACY SMOKE FAILED: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    smokeStatus = 1;
  } finally {
    console.log(
      `CLERK PRIVACY SMOKE RESULT: ${
        smokeStatus === 0 ? "passed" : `failed (exit ${smokeStatus})`
      }`,
    );
    if (disposableApi) {
      try {
        const teardown = await stopDisposableApi(disposableApi.child);
        if (!teardown.ok) {
          console.error(
            `CLERK PRIVACY SMOKE TEARDOWN FAILED: ${teardown.error}`,
          );
          if (smokeStatus === 0) smokeStatus = 1;
        } else {
          console.log(
            `Disposable API teardown complete: ${teardown.action} (isolated port ${disposableApi.port}).`,
          );
          if (teardown.warning) {
            console.warn(
              `Disposable API teardown warning: ${teardown.warning}`,
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`CLERK PRIVACY SMOKE TEARDOWN FAILED: ${message}`);
        if (smokeStatus === 0) smokeStatus = 1;
      }
    }
  }
  return smokeStatus;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runClerkPrivacySmoke().then((status) => {
    process.exitCode = status;
  });
}
