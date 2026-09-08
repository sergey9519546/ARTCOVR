import { and, eq, sql } from "drizzle-orm";
import { artcovrCreditLedger, artcovrOrders, db } from "@workspace/db";
import { randomUUID } from "node:crypto";

type CreditExecutor = Pick<typeof db, "select" | "insert" | "execute">;

/** Call only inside a transaction; every mutation of this purchase shares it. */
export async function lockPurchaseCredits(executor: CreditExecutor, purchaseId: string) {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${`credits:${purchaseId}`}))`);
}

export type CreditActivityEvent =
  | "grant"
  | "generation"
  | "release"
  | "refund"
  | "expiration"
  | "revocation";

export type CreditActivity = {
  purchaseId: string;
  event: CreditActivityEvent;
  label: string;
  amount: number;
  occurredAt: Date;
};

export const CREDIT_ACTIVITY_PAGE_SIZE = 25;

export type CreditActivityPage = {
  activities: CreditActivity[];
  nextCursor: string | null;
};

export class InvalidCreditActivityCursorError extends Error {
  constructor() {
    super("Invalid credit activity cursor.");
    this.name = "InvalidCreditActivityCursorError";
  }
}

type CreditActivityCursor = {
  occurredAt: string;
  id: string;
};

function encodeCreditActivityCursor(cursor: CreditActivityCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCreditActivityCursor(value: string): CreditActivityCursor {
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid cursor encoding");
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CreditActivityCursor>;
    if (
      typeof decoded.occurredAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(decoded.occurredAt) ||
      Number.isNaN(Date.parse(decoded.occurredAt)) ||
      typeof decoded.id !== "string" ||
      decoded.id.length === 0 ||
      decoded.id.length > 200
    ) {
      throw new Error("invalid cursor fields");
    }
    return {
      occurredAt: decoded.occurredAt,
      id: decoded.id,
    };
  } catch {
    throw new InvalidCreditActivityCursorError();
  }
}

function classifyCreditActivity(
  entryType: string,
  reason: string,
): Pick<CreditActivity, "event" | "label"> {
  if (entryType === "grant") return { event: "grant", label: "Credits added" };
  if (entryType === "spend") {
    return { event: "generation", label: "Generation used" };
  }
  if (entryType === "release") {
    return { event: "release", label: "Credits returned" };
  }
  if (/refund/i.test(reason)) {
    return { event: "refund", label: "Refund adjustment" };
  }
  if (/expir/i.test(reason)) {
    return { event: "expiration", label: "Expiration adjustment" };
  }
  return { event: "revocation", label: "Access revocation" };
}

export async function listUserCreditActivity(
  executor: CreditExecutor,
  userId: string,
  cursor?: string,
): Promise<CreditActivityPage> {
  const decodedCursor = cursor ? decodeCreditActivityCursor(cursor) : null;
  const ownerScope = and(
    eq(artcovrCreditLedger.clerkUserId, userId),
    eq(artcovrOrders.clerkUserId, userId),
  );
  const rows = await executor
    .select({
      id: artcovrCreditLedger.id,
      purchaseId: artcovrCreditLedger.orderId,
      entryType: artcovrCreditLedger.entryType,
      amount: artcovrCreditLedger.amount,
      reason: artcovrCreditLedger.reason,
      occurredAt: artcovrCreditLedger.createdAt,
      // JavaScript Dates lose PostgreSQL microseconds. Keep the exact sort key
      // in the cursor so activity within one millisecond is not skipped.
      cursorOccurredAt: sql<string>`to_char(${artcovrCreditLedger.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(artcovrCreditLedger)
    .innerJoin(artcovrOrders, eq(artcovrOrders.id, artcovrCreditLedger.orderId))
    .where(
      decodedCursor
        ? and(
            ownerScope,
            sql`(${artcovrCreditLedger.createdAt}, ${artcovrCreditLedger.id}) < (${decodedCursor.occurredAt}::timestamptz, ${decodedCursor.id})`,
          )
        : ownerScope,
    )
    .orderBy(
      sql`${artcovrCreditLedger.createdAt} desc`,
      sql`${artcovrCreditLedger.id} desc`,
    )
    .limit(CREDIT_ACTIVITY_PAGE_SIZE + 1);

  const pageRows = rows.slice(0, CREDIT_ACTIVITY_PAGE_SIZE);
  const lastRow = pageRows.at(-1);
  return {
    activities: pageRows.map((row) => ({
      purchaseId: row.purchaseId,
      ...classifyCreditActivity(row.entryType, row.reason),
      amount: row.amount,
      occurredAt: row.occurredAt,
    })),
    nextCursor:
      rows.length > CREDIT_ACTIVITY_PAGE_SIZE && lastRow
        ? encodeCreditActivityCursor({
            occurredAt: lastRow.cursorOccurredAt,
            id: lastRow.id,
          })
        : null,
  };
}

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
        eq(artcovrCreditLedger.clerkUserId, userId),
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
      eq(artcovrCreditLedger.clerkUserId, userId),
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
      eq(artcovrCreditLedger.clerkUserId, userId),
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
  await lockPurchaseCredits(executor, input.purchaseId);
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
  await lockPurchaseCredits(executor, input.purchaseId);
  const [order] = await executor.select().from(artcovrOrders).where(and(
    eq(artcovrOrders.id, input.purchaseId),
    eq(artcovrOrders.clerkUserId, input.userId),
  )).limit(1);
  const expiry = order?.entitlementExpiresAt ?? (order?.paidAt
    ? new Date(order.paidAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null);
  // A refund/expiry may win the race with a provider failure. Do not restore
  // spendable credits to a revoked purchase, or release a legacy unspent job.
  if (!order || order.status !== "paid" || !order.paidAt || order.accessRevokedAt ||
      !expiry || expiry.getTime() <= Date.now()) return;
  const [spent] = await executor.select({ id: artcovrCreditLedger.id }).from(artcovrCreditLedger)
    .where(and(eq(artcovrCreditLedger.sourceId, `generation:${input.generationId}:spend`),
      eq(artcovrCreditLedger.orderId, input.purchaseId),
      eq(artcovrCreditLedger.clerkUserId, input.userId),
      eq(artcovrCreditLedger.amount, -1))).limit(1);
  if (!spent) return;
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
  await lockPurchaseCredits(executor, input.purchaseId);
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
