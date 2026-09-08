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
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(settle, timeoutMs);
    child.once("exit", settle);
    child.once("close", settle);
  });
}

async function stopDisposableApi(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await waitForChildExit(child, API_STOP_TIMEOUT_MS);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForChildExit(child, API_STOP_TIMEOUT_MS);
  }
}

async function waitForApiHealth(baseUrl, child) {
  const deadline = Date.now() + API_STARTUP_TIMEOUT_MS;
  let lastFailure = "no health response";
  let childError;
  const onChildError = (error) => {
    childError = error;
  };
  child.once("error", onChildError);
  try {
    while (Date.now() < deadline) {
      if (childError) {
        throw new Error(`Disposable API failed to start: ${childError.message}`);
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Disposable API exited before readiness (status ${child.exitCode ?? child.signalCode}).`,
        );
      }
      try {
        const response = await fetch(`${baseUrl}/api/healthz`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (response.status === 200) return;
        lastFailure = `HTTP ${response.status}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, API_HEALTH_POLL_MS));
    }
  } finally {
    child.removeListener("error", onChildError);
  }
  throw new Error(
    `Disposable API did not become healthy within ${API_STARTUP_TIMEOUT_MS}ms (${lastFailure}).`,
  );
}

async function startDisposableApi(env) {
  const port = await findAvailableLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
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
  return { baseUrl, child };
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
  try {
    const usesConfiguredTarget = Boolean(env.ARTCOVR_DEV_SMOKE_BASE_URL);
    if (usesConfiguredTarget) {
      console.log(`Using configured development API target ${decision.baseUrl}.`);
    } else {
      disposableApi = await startDisposableApi(env);
      decision.baseUrl = disposableApi.baseUrl;
      await waitForApiHealth(disposableApi.baseUrl, disposableApi.child);
      console.log(`Disposable development API is healthy at ${decision.baseUrl}.`);
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
      return 1;
    }
    return result.status ?? 1;
  } catch (error) {
    console.error(
      `CLERK PRIVACY SMOKE FAILED: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 1;
  } finally {
    if (disposableApi) {
      await stopDisposableApi(disposableApi.child);
      console.log("Disposable development API stopped.");
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runClerkPrivacySmoke().then((status) => {
    process.exitCode = status;
  });
}
