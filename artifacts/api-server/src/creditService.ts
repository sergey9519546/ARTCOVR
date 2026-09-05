import { and, eq, or, sql } from "drizzle-orm";
import { artcovrCreditLedger, artcovrOrders, db } from "@workspace/db";
import { randomUUID } from "node:crypto";

type CreditExecutor = Pick<typeof db, "select" | "insert">;

export type CreditBalance = {
  purchaseId: string;
  balance: number;
};

function numericBalance(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function getPurchaseCreditBalance(
  executor: CreditExecutor,
  userId: string,
  purchaseId: string,
) {
  const [row] = await executor
    .select({
      balance: sql<string>`coalesce(sum(${artcovrCreditLedger.amount}), 0)`,
    })
    .from(artcovrCreditLedger)
    .where(
      and(
        eq(artcovrCreditLedger.orderId, purchaseId),
        or(
          eq(artcovrCreditLedger.clerkUserId, userId),
          // Keep already-claimed ledger rows from before the explicit
          // clerk_user_id column usable while they are reconciled.
          eq(artcovrCreditLedger.accountKey, userId),
        ),
      ),
    );
  return numericBalance(row?.balance);
}

export async function getUserCreditBalance(
  executor: CreditExecutor,
  userId: string,
) {
  const [row] = await executor
    .select({
      balance: sql<string>`coalesce(sum(${artcovrCreditLedger.amount}), 0)`,
    })
    .from(artcovrCreditLedger)
    .where(
      or(
        eq(artcovrCreditLedger.clerkUserId, userId),
        eq(artcovrCreditLedger.accountKey, userId),
      ),
    );
  return numericBalance(row?.balance);
}

export async function listPurchaseCreditBalances(
  executor: CreditExecutor,
  userId: string,
): Promise<CreditBalance[]> {
  const rows = await executor
    .select({
      purchaseId: artcovrCreditLedger.orderId,
      balance: sql<string>`coalesce(sum(${artcovrCreditLedger.amount}), 0)`,
    })
    .from(artcovrCreditLedger)
    .where(
      or(
        eq(artcovrCreditLedger.clerkUserId, userId),
        eq(artcovrCreditLedger.accountKey, userId),
      ),
    )
    .groupBy(artcovrCreditLedger.orderId);
  return rows.flatMap((row) =>
    row.purchaseId
      ? [{ purchaseId: row.purchaseId, balance: numericBalance(row.balance) }]
      : [],
  );
}

export async function spendPurchaseCredit(
  executor: CreditExecutor,
  input: {
    userId: string;
    purchaseId: string;
    generationId: string;
  },
) {
  const balance = await getPurchaseCreditBalance(
    executor,
    input.userId,
    input.purchaseId,
  );
  if (balance < 1) return false;

  await executor
    .insert(artcovrCreditLedger)
    .values({
      id: `credit_${randomUUID()}`,
      clerkUserId: input.userId,
      accountKey: input.userId,
      orderId: input.purchaseId,
      entryType: "spend",
      amount: -1,
      reason: "Image generation credit spend",
      sourceId: `generation:${input.generationId}:spend`,
    })
    .onConflictDoNothing();
  return true;
}

export async function releasePurchaseCredit(
  executor: CreditExecutor,
  input: {
    userId: string;
    purchaseId: string;
    generationId: string;
    reason: string;
  },
) {
  await executor
    .insert(artcovrCreditLedger)
    .values({
      id: `credit_${randomUUID()}`,
      clerkUserId: input.userId,
      accountKey: input.userId,
      orderId: input.purchaseId,
      entryType: "release",
      amount: 1,
      reason: input.reason,
      sourceId: `generation:${input.generationId}:release`,
    })
    .onConflictDoNothing();
}

export async function revokePurchaseCredits(
  purchaseId: string,
  reason: string,
  sourceId = `purchase:${purchaseId}:revoke`,
) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        clerkUserId: artcovrOrders.clerkUserId,
      })
      .from(artcovrOrders)
      .where(eq(artcovrOrders.id, purchaseId))
      .limit(1);
    if (!order?.clerkUserId) return 0;

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`credits:${purchaseId}`}))`,
    );
    return revokePurchaseCreditsInTransaction(
      tx,
      {
        userId: order.clerkUserId,
        purchaseId,
        reason,
        sourceId,
      },
    );
  });
}

export async function revokePurchaseCreditsInTransaction(
  executor: CreditExecutor,
  input: {
    userId: string;
    purchaseId: string;
    reason: string;
    sourceId: string;
  },
) {
  const balance = await getPurchaseCreditBalance(
    executor,
    input.userId,
    input.purchaseId,
  );
  if (balance <= 0) return 0;

  await executor
    .insert(artcovrCreditLedger)
    .values({
      id: `credit_${randomUUID()}`,
      clerkUserId: input.userId,
      accountKey: input.userId,
      orderId: input.purchaseId,
      entryType: "revoke",
      amount: -balance,
      reason: input.reason,
      sourceId: input.sourceId,
    })
    .onConflictDoNothing();
  return balance;
}