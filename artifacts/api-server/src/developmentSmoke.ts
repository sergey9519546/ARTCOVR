import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

class SmokeError extends Error {}

// Explicitly opt in; this is not imported by the server or the normal test suite.
export function developmentSmokeOptions(args: string[], env: NodeJS.ProcessEnv) {
  const values = new Map<string, string>();
  let generate = false;
  let enabled = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dev-smoke") enabled = true;
    else if (args[i] === "--generate") generate = true;
    else if (["--base-url", "--origin", "--artwork-id"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) values.set(args[i], args[++i]);
    else throw new SmokeError("Unknown or incomplete smoke argument.");
  }
  if (!enabled) throw new SmokeError("Requires --dev-smoke --base-url <development API origin>. Add --generate only to authorize one real image edit.");
  if (!env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new SmokeError("Requires a Clerk test secret in CLERK_SECRET_KEY; live keys are refused.");
  const publishable = env.VITE_CLERK_PUBLISHABLE_KEY ?? env.CLERK_PUBLISHABLE_KEY;
  if (!publishable?.startsWith("pk_test_")) throw new SmokeError("Requires the matching Clerk test publishable key in the environment.");
  if (env.REPLIT_DEPLOYMENT === "1" || env.NODE_ENV === "production") throw new SmokeError("Run from a development workspace, never a production deployment.");
  const base = new URL(values.get("--base-url") ?? "invalid:");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  const replitDev = base.protocol === "https:" && base.hostname.endsWith(".replit.dev") && base.hostname === env.REPLIT_DEV_DOMAIN;
  if ((!local && !replitDev) || !["http:", "https:"].includes(base.protocol) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new SmokeError("Target must be a loopback origin or this workspace's exact REPLIT_DEV_DOMAIN.");
  let database: URL;
  try { database = new URL(env.DATABASE_URL ?? "invalid:"); } catch { throw new SmokeError("A development DATABASE_URL is required."); }
  const devDatabase = ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) || (database.hostname === "helium" && Boolean(env.REPL_ID));
  if (!devDatabase || !["postgres:", "postgresql:"].includes(database.protocol)) throw new SmokeError("Database must be local disposable PostgreSQL or Replit workspace helium. Remote production databases are refused.");
  const origin = new URL(values.get("--origin") ?? env.ARTCOVR_PUBLIC_ORIGIN ?? base.origin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new SmokeError("Origin must be an HTTP(S) origin without credentials or a path.");
  return { base: base.origin, origin: origin.origin, generate, artworkId: values.get("--artwork-id") };
}

// pnpm --filter @workspace/api-server exec tsx src/developmentSmoke.ts --dev-smoke --base-url http://127.0.0.1:3001
// Append --generate to spend one development model edit; --origin must match the API's configured storefront origin.
export async function runDevelopmentSmoke(args: string[]) {
  const options = developmentSmokeOptions(args, process.env);
  // Clerk's official testing-only POST /sessions creates a real session.
  // getToken(sessionId) uses POST /sessions/:id/tokens, without a JWT template.
  // https://github.com/clerk/openapi-specs/blob/main/bapi/2026-05-12.yml
  const { clerkClient } = await import("@clerk/express");
  const { db, pool, artcovrGenerations } = await import("@workspace/db");
  const { eq, inArray, and, sql } = await import("drizzle-orm");
  const { getPublicCatalog } = await import("./catalog");
  const { downloadPrivate, removePrivate } = await import("./lib/mediaStorage");
  const runId = randomUUID();
  const users: string[] = [];
  const sessions: string[] = [];
  const checks: string[] = [];
  const artifacts: string[] = [];
  const cleanupErrors: string[] = [];
  let step = "health";

  async function api(path: string, session?: string, body?: object) {
    const headers: Record<string, string> = { Origin: options.origin };
    // Refresh before each request: session JWTs are intentionally short-lived.
    if (session) headers.Authorization = `Bearer ${(await clerkClient.sessions.getToken(session)).jwt}`;
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${options.base}/api${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(45_000) });
    const json: unknown = await response.json();
    if (!json || typeof json !== "object" || Array.isArray(json)) throw new SmokeError(`API returned a non-object response (HTTP ${response.status}).`);
    return { status: response.status, json: json as Record<string, unknown> };
  }

  try {
    assert.equal((await api("/healthz")).status, 200);
    assert.equal((await api("/functions/v1/my-images")).status, 401);
    checks.push("healthy API and unauthenticated account rejected");
    step = "create temporary Clerk users and sessions";
    for (let index = 0; index < 2; index++) {
      const user = await clerkClient.users.createUser({
        emailAddress: [`artcovr-smoke-${runId}-${index}+clerk_test@example.com`],
        skipPasswordRequirement: true,
        privateMetadata: { artcovrDevelopmentSmoke: runId },
      });
      users.push(user.id);
      const session = await clerkClient.sessions.createSession({ userId: user.id });
      sessions.push(session.id);
    }
    step = "authenticated account";
    const account = await api("/functions/v1/my-images", sessions[0]);
    assert.equal(account.status, 200);
    assert.deepEqual(account.json.generations, []);
    assert.deepEqual(account.json.purchases, []);
    checks.push("real Clerk JWT authenticates a clean temporary account");

    step = "generation ownership isolation";
    const artwork = getPublicCatalog().find((item) => !options.artworkId || item.id === options.artworkId);
    if (!artwork) throw new SmokeError("Requested artwork was not found in the approved public catalog.");
    const fixtureId = `dev-smoke-${runId}`;
    // Deliberately failed fixture: no model call, output, payment, or entitlement.
    await db.insert(artcovrGenerations).values({ id: fixtureId, clerkUserId: users[1], artworkId: artwork.id, phase: "preview", status: "failed", prompt: "Development ownership fixture", sourceObjectKey: `dev-smoke/${runId}/no-image`, expiresAt: new Date(Date.now() + 600_000) });
    const statusPath = `/functions/v1/generation-status?generationId=${encodeURIComponent(fixtureId)}`;
    assert.equal((await api(statusPath, sessions[1])).status, 200);
    const foreign = await api(statusPath, sessions[0]);
    assert.equal(foreign.status, 404);
    assert.equal(foreign.json.code, "generation_not_found");
    checks.push("own fixture readable; another authenticated user receives 404");

    if (options.generate) {
      step = "real image generation";
      const body = { artworkId: artwork.id, requestId: randomUUID(), prompt: "Add one clearly visible small silver crescent moon in the upper-right corner of this cover. Keep the existing artwork as the canvas and preserve all other elements.", resetToBase: true };
      const admitted = await api("/functions/v1/generate-image", sessions[0], body);
      if (admitted.status !== 202 || typeof admitted.json.generationId !== "string") throw new SmokeError(`Generation admission returned HTTP ${admitted.status} (${String(admitted.json.code ?? "no error code")}).`);
      const generationId = admitted.json.generationId;
      const duplicate = await api("/functions/v1/generate-image", sessions[0], body);
      assert.equal(duplicate.status, 202);
      assert.equal(duplicate.json.generationId, generationId);
      const deadline = Date.now() + 360_000;
      let succeeded = false;
      while (Date.now() < deadline) {
        const status = await api(`/functions/v1/generation-status?generationId=${encodeURIComponent(generationId)}`, sessions[0]);
        assert.equal(status.status, 200);
        if (status.json.status === "succeeded") { succeeded = true; break; }
        if (["failed", "timed_out"].includes(String(status.json.status))) throw new SmokeError(`Real generation ${String(status.json.status)} (${String(status.json.errorCode)}).`);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
      if (!succeeded) throw new SmokeError("Real generation did not complete within six minutes.");
      const row = (await db.select().from(artcovrGenerations).where(and(eq(artcovrGenerations.id, generationId), eq(artcovrGenerations.clerkUserId, users[0]))))[0];
      assert.ok(row?.cleanObjectKey && row.providerRequestId);
      const directory = new URL("../../../.local/development-smoke/", import.meta.url);
      await mkdir(directory, { recursive: true });
      const imagePath = new URL(`${runId}.webp`, directory);
      await writeFile(imagePath, await downloadPrivate(row.cleanObjectKey));
      artifacts.push(fileURLToPath(imagePath));
      checks.push("one real generation completed; duplicate request reused the same job; image saved for visual review");
    }
  } catch (error) {
    if (error instanceof SmokeError) throw error;
    const codes = typeof error === "object" && error && "errors" in error && Array.isArray(error.errors) ? error.errors.map((item: { code?: string }) => item.code).filter(Boolean).join(", ") : "";
    throw new SmokeError(`Development smoke failed at ${step}${codes ? ` (${codes})` : ""}. Credentials and response bodies were withheld.`);
  } finally {
    if (users.length) {
      try {
        // Scope every mutation to users created in this run; never customer rows.
        await db.update(artcovrGenerations).set({ status: "timed_out", allowanceSlot: null }).where(and(inArray(artcovrGenerations.clerkUserId, users), sql`${artcovrGenerations.status} in ('queued','running')`));
        const rows = await db.select().from(artcovrGenerations).where(inArray(artcovrGenerations.clerkUserId, users));
        for (const row of rows) {
          const keys = [row.cleanObjectKey, row.previewObjectKey].filter((key): key is string => Boolean(key));
          if (keys.some((key) => !key.startsWith(`generated/${row.artworkId}/${row.id}/`))) throw new Error("Unexpected cleanup object path");
          if (keys.length) await removePrivate(keys);
          await db.delete(artcovrGenerations).where(and(eq(artcovrGenerations.id, row.id), inArray(artcovrGenerations.clerkUserId, users)));
        }
      } catch { cleanupErrors.push("fixture rows/private images"); }
    }
    for (const session of sessions) await clerkClient.sessions.revokeSession(session).catch(() => { cleanupErrors.push("Clerk session"); });
    for (const user of users) await clerkClient.users.deleteUser(user).catch(() => { cleanupErrors.push("Clerk test user"); });
    await pool.end();
    if (cleanupErrors.length) throw new SmokeError(`Cleanup incomplete for ${cleanupErrors.join(", ")}; run marker ${runId}.`);
  }
  return { runId, checks, realGeneration: options.generate, artifacts, cleanup: "complete", visualReview: options.generate ? "required; API success does not establish edit quality" : "not run" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDevelopmentSmoke(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof SmokeError ? error.message : "Development smoke failed before setup. Check the development-only arguments and environment.");
    process.exitCode = 1;
  });
}
