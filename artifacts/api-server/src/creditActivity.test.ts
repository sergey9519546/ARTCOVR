import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  artcovrCreditLedger,
  artcovrGenerations,
  artcovrOrders,
  db,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { getPublicCatalog } from "./catalog";
import { listUserCreditActivity } from "./creditService";
import accountRouter from "./routes/account";

function accountTestApp() {
  const app = express();
  app.use((req, _res, next) => {
    const userId = req.headers["x-test-user-id"];
    const auth = Object.assign(
      () => ({
        userId: typeof userId === "string" ? userId : null,
        tokenType: "session_token",
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.assign(req, { auth });
    next();
  });
  app.use("/api", accountRouter);
  return app;
}

async function listen(app: express.Express) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("The test server did not expose a TCP address.");
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("credit activity is purchase-scoped and omits internal ledger fields", async () => {
  const rows = [
    {
      id: "ledger-1",
      purchaseId: "purchase-1",
      entryType: "grant",
      amount: 4,
      reason: "Cover purchase credit grant",
      occurredAt: new Date("2026-09-05T12:00:00.000Z"),
    },
    {
      id: "ledger-2",
      purchaseId: "purchase-1",
      entryType: "spend",
      amount: -1,
      reason: "Image generation credit spend",
      occurredAt: new Date("2026-09-05T12:01:00.000Z"),
    },
    {
      id: "ledger-3",
      purchaseId: "purchase-1",
      entryType: "revoke",
      amount: -3,
      reason: "Purchase refunded",
      occurredAt: new Date("2026-09-05T12:02:00.000Z"),
    },
  ];
  const select = () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  });

  const activity = await listUserCreditActivity(
    { select } as never,
    "user-1",
  );

  assert.deepEqual(activity, {
    activities: [
    {
      purchaseId: "purchase-1",
      event: "grant",
      label: "Credits added",
      amount: 4,
      occurredAt: new Date("2026-09-05T12:00:00.000Z"),
    },
    {
      purchaseId: "purchase-1",
      event: "generation",
      label: "Generation used",
      amount: -1,
      occurredAt: new Date("2026-09-05T12:01:00.000Z"),
    },
    {
      purchaseId: "purchase-1",
      event: "refund",
      label: "Refund adjustment",
      amount: -3,
      occurredAt: new Date("2026-09-05T12:02:00.000Z"),
    },
    ],
    nextCursor: null,
  });
  assert.equal("reason" in activity.activities[0], false);
  assert.equal("sourceId" in activity.activities[0], false);
});

test("credit activity returns a bounded page and an opaque cursor", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => ({
    id: `ledger-${index}`,
    purchaseId: "purchase-1",
    entryType: "spend",
    amount: -1,
    reason: "Image generation credit spend",
    occurredAt: new Date(
      Date.parse("2026-09-05T12:00:00.000Z") + index * 1_000,
    ),
  }));
  const select = () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  });

  const page = await listUserCreditActivity(
    { select } as never,
    "user-1",
  );

  assert.equal(page.activities.length, 25);
  assert.equal(page.activities[0].event, "generation");
  assert.equal(typeof page.nextCursor, "string");
  assert.ok(page.nextCursor);
  assert.equal("id" in page.activities[0], false);
});

test("account endpoint isolates two users and omits ledger and generation internals", async () => {
  const runId = randomUUID();
  const userA = `credit-history-a-${runId}`;
  const userB = `credit-history-b-${runId}`;
  const purchaseA = `purchase-a-${runId}`;
  const purchaseB = `purchase-b-${runId}`;
  const ledgerA = `ledger-a-${runId}`;
  const ledgerB = `ledger-b-${runId}`;
  const generationA = `generation-a-${runId}`;
  const generationB = `generation-b-${runId}`;
  const artwork = getPublicCatalog()[0];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  const sensitive = {
    reasonA: `private-reason-a-${runId}`,
    reasonB: `private-reason-b-${runId}`,
    sourceA: `private-source-a-${runId}`,
    sourceB: `private-source-b-${runId}`,
    stripeA: `stripe-event-a-${runId}`,
    stripeB: `stripe-event-b-${runId}`,
    promptA: `private-prompt-a-${runId}`,
    promptB: `private-prompt-b-${runId}`,
    objectA: `private-object-a-${runId}`,
    objectB: `private-object-b-${runId}`,
    providerA: `private-provider-a-${runId}`,
    providerB: `private-provider-b-${runId}`,
  };
  const orderIds = [purchaseA, purchaseB];
  const generationIds = [generationA, generationB];
  const historyLedgerIds = Array.from(
    { length: 25 },
    (_, index) => `ledger-a-history-${runId}-${index}`,
  );
  const { server, url } = await listen(accountTestApp());

  try {
    await db.insert(artcovrOrders).values([
      {
        id: purchaseA,
        clerkUserId: userA,
        artworkId: artwork.id,
        artworkSlug: artwork.slug,
        idempotencyKey: `idempotency-a-${runId}`,
        amountCents: 3_500,
        currency: "usd",
        saleMode: "repeatable",
        licenseTerms: "test",
        includedCredits: 4,
        status: "paid",
        createdAt: now,
        paidAt: now,
        accessRevokedAt: now,
      },
      {
        id: purchaseB,
        clerkUserId: userB,
        artworkId: artwork.id,
        artworkSlug: artwork.slug,
        idempotencyKey: `idempotency-b-${runId}`,
        amountCents: 3_500,
        currency: "usd",
        saleMode: "repeatable",
        licenseTerms: "test",
        includedCredits: 4,
        status: "paid",
        createdAt: now,
        paidAt: now,
        accessRevokedAt: now,
      },
    ]);
    await db.insert(artcovrCreditLedger).values([
      {
        id: ledgerA,
        clerkUserId: userA,
        accountKey: userA,
        orderId: purchaseA,
        entryType: "grant",
        amount: 4,
        reason: sensitive.reasonA,
        sourceId: sensitive.sourceA,
        stripeEventId: sensitive.stripeA,
        createdAt: now,
      },
      {
        id: ledgerB,
        clerkUserId: userB,
        accountKey: userB,
        orderId: purchaseB,
        entryType: "grant",
        amount: 4,
        reason: sensitive.reasonB,
        sourceId: sensitive.sourceB,
        stripeEventId: sensitive.stripeB,
        createdAt: new Date(now.getTime() - 1_000),
      },
      ...historyLedgerIds.map((id, index) => ({
        id,
        clerkUserId: userA,
        accountKey: userA,
        orderId: purchaseA,
        entryType: "spend" as const,
        amount: -1,
        reason: `History generation ${index}`,
        sourceId: `${id}-source`,
        createdAt: new Date(now.getTime() - (index + 2) * 1_000),
      })),
    ]);
    await db.insert(artcovrGenerations).values([
      {
        id: generationA,
        clerkUserId: userA,
        artworkId: artwork.id,
        purchaseId: purchaseA,
        phase: "edit",
        status: "failed",
        prompt: sensitive.promptA,
        sourceObjectKey: sensitive.objectA,
        previewObjectKey: `${sensitive.objectA}-preview`,
        cleanObjectKey: `${sensitive.objectA}-clean`,
        providerRequestId: sensitive.providerA,
        providerUsage: {},
        expiresAt,
        createdAt: now,
      },
      {
        id: generationB,
        clerkUserId: userB,
        artworkId: artwork.id,
        purchaseId: purchaseB,
        phase: "edit",
        status: "failed",
        prompt: sensitive.promptB,
        sourceObjectKey: sensitive.objectB,
        previewObjectKey: `${sensitive.objectB}-preview`,
        cleanObjectKey: `${sensitive.objectB}-clean`,
        providerRequestId: sensitive.providerB,
        providerUsage: {},
        expiresAt,
        createdAt: new Date(now.getTime() - 1_000),
      },
    ]);

    async function account(userId: string) {
      const response = await fetch(`${url}/api/functions/v1/my-images`, {
        headers: { "x-test-user-id": userId },
      });
      assert.equal(response.status, 200);
      return (await response.json()) as {
        creditActivity: Array<Record<string, unknown>>;
        creditActivityNextCursor: string | null;
        generations: Array<Record<string, unknown>>;
        purchases: Array<Record<string, unknown>>;
      };
    }

    const [accountA, accountB] = await Promise.all([
      account(userA),
      account(userB),
    ]);

    assert.deepEqual(
      [...new Set(accountA.creditActivity.map((activity) => activity.purchaseId))],
      [purchaseA],
    );
    assert.deepEqual(
      [...new Set(accountB.creditActivity.map((activity) => activity.purchaseId))],
      [purchaseB],
    );
    assert.ok(accountA.creditActivity.some((activity) => activity.event === "grant"));
    assert.ok(accountB.creditActivity.some((activity) => activity.event === "grant"));
    assert.deepEqual(
      accountA.generations.map((generation) => generation.id),
      [generationA],
    );
    assert.deepEqual(
      accountB.generations.map((generation) => generation.id),
      [generationB],
    );
    assert.deepEqual(
      accountA.purchases.map((purchase) => purchase.id),
      [purchaseA],
    );
    assert.deepEqual(
      accountB.purchases.map((purchase) => purchase.id),
      [purchaseB],
    );

    assert.ok(accountA.creditActivityNextCursor);
    const olderActivityResponse = await fetch(
      `${url}/api/functions/v1/my-images?creditActivityCursor=${encodeURIComponent(accountA.creditActivityNextCursor)}`,
      { headers: { "x-test-user-id": userA } },
    );
    assert.equal(olderActivityResponse.status, 200);
    const olderActivityPayload = (await olderActivityResponse.json()) as {
      creditActivity: Array<Record<string, unknown>>;
      creditActivityNextCursor: string | null;
      [key: string]: unknown;
    };
    assert.deepEqual(Object.keys(olderActivityPayload).sort(), [
      "creditActivity",
      "creditActivityNextCursor",
    ]);
    assert.equal(olderActivityPayload.creditActivity.length, 1);
    assert.deepEqual(Object.keys(olderActivityPayload.creditActivity[0]).sort(), [
      "amount",
      "artworkTitle",
      "event",
      "label",
      "occurredAt",
      "purchaseId",
    ]);

    for (const payload of [accountA, accountB]) {
      assert.deepEqual(Object.keys(payload.creditActivity[0]).sort(), [
        "amount",
        "artworkTitle",
        "event",
        "label",
        "occurredAt",
        "purchaseId",
      ]);
      assert.deepEqual(Object.keys(payload.generations[0]).sort(), [
        "artworkId",
        "createdAt",
        "expiresAt",
        "id",
        "phase",
        "purchaseId",
        "status",
      ]);
      assert.doesNotMatch(
        JSON.stringify(payload),
        /private-(?:reason|source|prompt|object|provider)-|stripe-event-/,
      );
      assert.doesNotMatch(JSON.stringify(payload), /ledger-[ab]-/);
      assert.doesNotMatch(JSON.stringify(payload), /clerkUserId|accountKey|sourceId|stripeEventId/);
    }
  } finally {
    await db
      .delete(artcovrGenerations)
      .where(inArray(artcovrGenerations.id, generationIds));
    await db
      .delete(artcovrCreditLedger)
      .where(
        inArray(artcovrCreditLedger.accountKey, [
          userA,
          userB,
          ...historyLedgerIds,
        ]),
      );
    await db.delete(artcovrOrders).where(inArray(artcovrOrders.id, orderIds));
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
