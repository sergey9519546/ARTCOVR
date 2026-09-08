import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

class SmokeError extends Error {}

function smokeErrorChain(error: unknown) {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? current.cause
        : undefined;
  }
  return chain;
}

export function developmentSmokeFailureReason(error: unknown) {
  for (const cause of smokeErrorChain(error)) {
    const code =
      typeof cause === "object" && cause !== null && "code" in cause
        ? String(cause.code)
        : "";
    const name =
      typeof cause === "object" && cause !== null && "name" in cause
        ? String(cause.name)
        : "";
    const message =
      typeof cause === "object" && cause !== null && "message" in cause
        ? String(cause.message)
        : String(cause);
    const dnsCode = code.match(/\b(?:ENOTFOUND|EAI_AGAIN|EAI_FAIL|EAI_NONAME)\b/)?.[0];
    if (dnsCode || /getaddrinfo .*(?:ENOTFOUND|EAI_)/i.test(message)) {
      return `DNS resolution failed (${dnsCode ?? "name lookup"}).`;
    }
    const timeoutCode = code.match(/\b(?:ETIMEDOUT|ESOCKETTIMEDOUT)\b/)?.[0];
    if (
      timeoutCode ||
      name === "TimeoutError" ||
      /(?:timed? ?out|timeout|operation was aborted due to timeout)/i.test(message)
    ) {
      return `Request timed out (${timeoutCode ?? (name || "timeout")}).`;
    }
  }
  return undefined;
}

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

type SmokeGenerationCleanupRow = {
  id: string;
  artworkId: string;
  cleanObjectKey: string | null;
  previewObjectKey: string | null;
};

export type DevelopmentSmokeCleanupDependencies = {
  timeoutRunningGenerations: () => Promise<void>;
  listGenerations: () => Promise<SmokeGenerationCleanupRow[]>;
  removePrivate: (keys: string[]) => Promise<void>;
  deleteGeneration: (id: string) => Promise<void>;
  deleteLedger: (ids: string[]) => Promise<void>;
  deleteOrders: (ids: string[]) => Promise<void>;
  remainingGenerationIds: () => Promise<string[]>;
  remainingLedgerIds: () => Promise<string[]>;
  remainingOrderIds: () => Promise<string[]>;
  revokeSession: (id: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  closePool: () => Promise<void>;
};

export type DevelopmentSmokeCleanupInput = {
  runId: string;
  users: string[];
  sessions: string[];
  orderIds: string[];
  ledgerIds: string[];
  generationIds: string[];
};

const cleanupCategory = {
  generationObjects: "fixture generation objects",
  generations: "fixture generations",
  ledger: "fixture credit ledger",
  orders: "fixture orders",
  verification: "cleanup verification",
  session: "Clerk session",
  user: "Clerk test user",
  database: "database connection",
} as const;

/**
 * Cleanup is intentionally dependency-injected so failure paths can be tested
 * with disposable fakes. Every operation is attempted independently: a
 * storage or database failure must not prevent Clerk accounts or other fixture
 * categories from being cleaned up and reported.
 */
export async function cleanupDevelopmentSmokeFixtures(
  input: DevelopmentSmokeCleanupInput,
  dependencies: DevelopmentSmokeCleanupDependencies,
): Promise<void> {
  const incomplete = new Set<string>();
  const reportIncomplete = (category: string) => incomplete.add(category);
  const attempt = async (category: string, operation: () => Promise<void>) => {
    try {
      await operation();
    } catch {
      reportIncomplete(category);
    }
  };

  if (input.users.length) {
    await attempt(cleanupCategory.generationObjects, async () => {
      await dependencies.timeoutRunningGenerations();
      const rows = await dependencies.listGenerations();
      for (const row of rows) {
        const keys = [row.cleanObjectKey, row.previewObjectKey].filter(
          (key): key is string => Boolean(key),
        );
        if (
          keys.some(
            (key) => !key.startsWith(`generated/${row.artworkId}/${row.id}/`),
          )
        ) {
          throw new Error("Unexpected cleanup object path");
        }
        if (keys.length) await dependencies.removePrivate(keys);
        await dependencies.deleteGeneration(row.id);
      }
    });
  }

  await attempt(cleanupCategory.ledger, async () => {
    if (input.ledgerIds.length) await dependencies.deleteLedger(input.ledgerIds);
  });

  await attempt(cleanupCategory.orders, async () => {
    if (input.orderIds.length) await dependencies.deleteOrders(input.orderIds);
  });

  const verifyEmpty = async (
    category: string,
    ids: string[],
    findRemaining: () => Promise<string[]>,
  ) => {
    if (!ids.length) return;
    try {
      if ((await findRemaining()).length) reportIncomplete(category);
    } catch {
      reportIncomplete(cleanupCategory.verification);
    }
  };
  await verifyEmpty(
    cleanupCategory.generations,
    input.generationIds,
    dependencies.remainingGenerationIds,
  );
  await verifyEmpty(
    cleanupCategory.ledger,
    input.ledgerIds,
    dependencies.remainingLedgerIds,
  );
  await verifyEmpty(
    cleanupCategory.orders,
    input.orderIds,
    dependencies.remainingOrderIds,
  );

  for (const session of input.sessions) {
    await attempt(cleanupCategory.session, () =>
      dependencies.revokeSession(session),
    );
  }
  for (const user of input.users) {
    await attempt(cleanupCategory.user, () => dependencies.deleteUser(user));
  }
  await attempt(cleanupCategory.database, dependencies.closePool);

  if (incomplete.size) {
    throw new SmokeError(
      `Cleanup incomplete for ${[...incomplete].join(", ")}; run marker ${input.runId}.`,
    );
  }
}

// pnpm --filter @workspace/api-server exec tsx src/developmentSmoke.ts --dev-smoke --base-url http://127.0.0.1:3001
// Append --generate to spend one development model edit; --origin must match the API's configured storefront origin.
export async function runDevelopmentSmoke(args: string[]) {
  const options = developmentSmokeOptions(args, process.env);
  // Clerk's official testing-only POST /sessions creates a real session.
  // getToken(sessionId) uses POST /sessions/:id/tokens, without a JWT template.
  // https://github.com/clerk/openapi-specs/blob/main/bapi/2026-05-12.yml
  const { clerkClient } = await import("@clerk/express");
  const {
    db,
    pool,
    artcovrCreditLedger,
    artcovrGenerations,
    artcovrOrders,
  } = await import("@workspace/db");
  const { eq, inArray, and, sql } = await import("drizzle-orm");
  const { getPublicCatalog } = await import("./catalog");
  const { downloadPrivate, removePrivate } = await import("./lib/mediaStorage");
  const runId = randomUUID();
  const users: string[] = [];
  const sessions: string[] = [];
  const orderIds: string[] = [];
  const ledgerIds: string[] = [];
  const generationIds: string[] = [];
  const checks: string[] = [];
  const artifacts: string[] = [];
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
    step = "seed isolated account fixtures";
    const artwork = getPublicCatalog().find(
      (item) => !options.artworkId || item.id === options.artworkId,
    );
    if (!artwork) {
      throw new SmokeError(
        "Requested artwork was not found in the approved public catalog.",
      );
    }
    for (const [index, userId] of users.entries()) {
      const orderId = `dev-smoke-order-${runId}-${index}`;
      const ledgerId = `dev-smoke-credit-${runId}-${index}`;
      const generationId = `dev-smoke-generation-${runId}-${index}`;
      const now = new Date();
      orderIds.push(orderId);
      ledgerIds.push(ledgerId);
      generationIds.push(generationId);
      await db.insert(artcovrOrders).values({
        id: orderId,
        clerkUserId: userId,
        artworkId: artwork.id,
        artworkSlug: artwork.slug,
        idempotencyKey: `dev-smoke:${runId}:${index}`,
        amountCents: 0,
        currency: "usd",
        saleMode: "repeatable",
        licenseTerms: "Development smoke fixture",
        includedCredits: 2,
        status: "paid",
        paidAt: now,
        entitlementExpiresAt: new Date(now.getTime() + 600_000),
      });
      await db.insert(artcovrCreditLedger).values({
        id: ledgerId,
        clerkUserId: userId,
        accountKey: userId,
        orderId,
        entryType: "grant",
        amount: 2,
        reason: "Development smoke account fixture",
        sourceId: `dev-smoke:grant:${runId}:${index}`,
      });
      await db.insert(artcovrGenerations).values({
        id: generationId,
        clerkUserId: userId,
        artworkId: artwork.id,
        purchaseId: orderId,
        phase: "purchased",
        status: "failed",
        prompt: `SMOKE_PRIVATE_PROMPT_USER_${index}`,
        sourceObjectKey: `dev-smoke/${runId}/${index}/source`,
        expiresAt: new Date(now.getTime() + 600_000),
      });
    }

    step = "authenticated account privacy";
    const account = await api("/functions/v1/my-images", sessions[0]);
    assert.equal(account.status, 200);
    const secondAccount = await api("/functions/v1/my-images", sessions[1]);
    assert.equal(secondAccount.status, 200);
    type AccountPrivacySnapshot = {
      purchases: Array<{ id: string }>;
      creditActivity: Array<
        Record<string, unknown> & { purchaseId: string }
      >;
      generations: Array<Record<string, unknown> & { id: string }>;
      totalCreditBalance: number;
    };
    const accountSnapshot = account.json as unknown as AccountPrivacySnapshot;
    const secondAccountSnapshot =
      secondAccount.json as unknown as AccountPrivacySnapshot;
    assert.deepEqual(
      accountSnapshot.purchases.map((purchase) => purchase.id),
      [orderIds[0]],
    );
    assert.deepEqual(
      secondAccountSnapshot.purchases.map((purchase) => purchase.id),
      [orderIds[1]],
    );
    assert.deepEqual(
      accountSnapshot.creditActivity.map((activity) => activity.purchaseId),
      [orderIds[0]],
    );
    assert.deepEqual(
      secondAccountSnapshot.creditActivity.map((activity) => activity.purchaseId),
      [orderIds[1]],
    );
    assert.equal(accountSnapshot.totalCreditBalance, 2);
    assert.equal(secondAccountSnapshot.totalCreditBalance, 2);
    for (const snapshot of [accountSnapshot, secondAccountSnapshot]) {
      for (const activity of snapshot.creditActivity) {
        assert.deepEqual(Object.keys(activity).sort(), [
          "amount",
          "artworkTitle",
          "event",
          "label",
          "occurredAt",
          "purchaseId",
        ]);
      }
      for (const generation of snapshot.generations) {
        assert.deepEqual(Object.keys(generation).sort(), [
          "artworkId",
          "createdAt",
          "expiresAt",
          "id",
          "phase",
          "purchaseId",
          "status",
        ]);
      }
    }
    const accountPayload = JSON.stringify(account.json);
    const secondAccountPayload = JSON.stringify(secondAccount.json);
    for (const payload of [accountPayload, secondAccountPayload]) {
      assert.doesNotMatch(payload, /SMOKE_PRIVATE_PROMPT_USER_/);
      assert.doesNotMatch(payload, /sourceObjectKey|previewObjectKey|cleanObjectKey/);
      assert.doesNotMatch(payload, /providerRequestId|providerUsage|ledgerId|sourceId/);
    }
    assert.doesNotMatch(accountPayload, new RegExp(orderIds[1]));
    assert.doesNotMatch(secondAccountPayload, new RegExp(orderIds[0]));
    checks.push(
      "real Clerk sessions isolate purchases and credit activity; account payloads omit generation and ledger internals",
    );

    step = "generation ownership isolation";
    const statusPath = `/functions/v1/generation-status?generationId=${encodeURIComponent(generationIds[1])}`;
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
    const reason = developmentSmokeFailureReason(error);
    throw new SmokeError(`Development smoke failed at ${step}${reason ? `: ${reason}` : codes ? ` (${codes})` : ""} Credentials and response bodies were withheld.`);
  } finally {
    await cleanupDevelopmentSmokeFixtures(
      { runId, users, sessions, orderIds, ledgerIds, generationIds },
      {
        timeoutRunningGenerations: async () => {
          // Scope every mutation to users created in this run; never customer rows.
          await db
            .update(artcovrGenerations)
            .set({ status: "timed_out", allowanceSlot: null })
            .where(
              and(
                inArray(artcovrGenerations.clerkUserId, users),
                sql`${artcovrGenerations.status} in ('queued','running')`,
              ),
            );
        },
        listGenerations: async () =>
          db
            .select()
            .from(artcovrGenerations)
            .where(inArray(artcovrGenerations.clerkUserId, users)),
        removePrivate,
        deleteGeneration: async (id) => {
          await db
            .delete(artcovrGenerations)
            .where(
              and(
                eq(artcovrGenerations.id, id),
                inArray(artcovrGenerations.clerkUserId, users),
              ),
            );
        },
        deleteLedger: async (ids) => {
          await db
            .delete(artcovrCreditLedger)
            .where(inArray(artcovrCreditLedger.id, ids));
        },
        deleteOrders: async (ids) => {
          await db
            .delete(artcovrOrders)
            .where(inArray(artcovrOrders.id, ids));
        },
        remainingGenerationIds: async () =>
          (
            await db
              .select({ id: artcovrGenerations.id })
              .from(artcovrGenerations)
              .where(inArray(artcovrGenerations.id, generationIds))
          ).map((row) => row.id),
        remainingLedgerIds: async () =>
          (
            await db
              .select({ id: artcovrCreditLedger.id })
              .from(artcovrCreditLedger)
              .where(inArray(artcovrCreditLedger.id, ledgerIds))
          ).map((row) => row.id),
        remainingOrderIds: async () =>
          (
            await db
              .select({ id: artcovrOrders.id })
              .from(artcovrOrders)
              .where(inArray(artcovrOrders.id, orderIds))
          ).map((row) => row.id),
        revokeSession: async (id) => {
          await clerkClient.sessions.revokeSession(id);
        },
        deleteUser: async (id) => {
          await clerkClient.users.deleteUser(id);
        },
        closePool: () => pool.end(),
      },
    );
  }
  return { runId, checks, realGeneration: options.generate, artifacts, cleanup: "complete", visualReview: options.generate ? "required; API success does not establish edit quality" : "not run" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDevelopmentSmoke(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof SmokeError ? error.message : "Development smoke failed before setup. Check the development-only arguments and environment.");
    process.exitCode = 1;
  });
}
