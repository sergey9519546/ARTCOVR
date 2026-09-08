import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKIPPED_ENVIRONMENT_GAP = 78;

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

  return {
    kind: "ready",
    baseUrl: env.ARTCOVR_DEV_SMOKE_BASE_URL ?? `http://127.0.0.1:${env.PORT ?? "8080"}`,
  };
}

export function runClerkPrivacySmoke(env = process.env) {
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

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    pnpm,
    [
      "--filter",
      "@workspace/api-server",
      "exec",
      "tsx",
      "src/developmentSmoke.ts",
      "--dev-smoke",
      "--base-url",
      decision.baseUrl,
    ],
    { env, stdio: "inherit" },
  );
  if (result.error) {
    console.error(
      `CLERK PRIVACY SMOKE FAILED TO START: ${result.error.message}`,
    );
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runClerkPrivacySmoke();
}