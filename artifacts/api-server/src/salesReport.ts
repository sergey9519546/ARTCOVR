import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrFunnelEvents,
  artcovrOrders,
  db,
} from "@workspace/db";
import { getPublicArtworkById } from "./catalog";

export const reportableOrderStatuses = [
  "paid",
  "refunded",
  "refunded_conflict",
] as const;

export type OwnerSalesReport = {
  range: { from: string; to: string };
  summary: {
    paidOrders: number;
    grossRevenueCents: number;
    refunds: number;
    refundedCents: number;
    netRevenueCents: number;
  };
  credits: {
    granted: number;
    spent: number;
    released: number;
    revoked: number;
  };
  funnel: {
    productViews: number;
    checkoutStarts: number;
    paidOrders: number;
    checkoutRate: number;
    paidRate: number;
  };
  topArtworks: Array<{
    artworkId: string;
    artworkSlug: string;
    title: string;
    purchases: number;
    grossRevenueCents: number;
    refundedCents: number;
    creditsUsed: number;
  }>;
};

export type SalesReportRange = {
  from: Date;
  to: Date;
};

type ReportOrder = {
  artworkId: string;
  artworkSlug: string;
  amountCents: number;
  status: string;
  paidAt: Date | null;
  refundedAt: Date | null;
};

type ReportLedgerEntry = {
  artworkId: string;
  artworkSlug: string;
  entryType: string;
  amount: number;
  createdAt: Date;
};

type ReportFunnelEvent = {
  eventType: string;
  artworkId: string;
  createdAt: Date;
};

function inRange(value: Date | null, range: SalesReportRange) {
  return Boolean(value && value >= range.from && value < range.to);
}

function moneyNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function artworkTitle(artworkId: string, artworkSlug: string) {
  return getPublicArtworkById(artworkId)?.title ?? artworkSlug;
}

export function buildOwnerSalesReport(input: {
  range: SalesReportRange;
  orders: readonly ReportOrder[];
  ledgerEntries: readonly ReportLedgerEntry[];
  funnelEvents: readonly ReportFunnelEvent[];
}): OwnerSalesReport {
  const { range, orders, ledgerEntries, funnelEvents } = input;
  const paidOrders = orders.filter((order) => inRange(order.paidAt, range));
  const refundedOrders = orders.filter((order) => inRange(order.refundedAt, range));
  const grossRevenueCents = paidOrders.reduce(
    (total, order) => total + moneyNumber(order.amountCents),
    0,
  );
  const refundedCents = refundedOrders.reduce(
    (total, order) => total + moneyNumber(order.amountCents),
    0,
  );

  const credits = {
    granted: 0,
    spent: 0,
    released: 0,
    revoked: 0,
  };
  for (const entry of ledgerEntries) {
    const amount = Math.abs(moneyNumber(entry.amount));
    if (entry.entryType === "grant") credits.granted += amount;
    if (entry.entryType === "spend") credits.spent += amount;
    if (entry.entryType === "release") credits.released += amount;
    if (entry.entryType === "revoke") credits.revoked += amount;
  }

  const productViews = funnelEvents.filter(
    (event) => event.eventType === "product_viewed",
  ).length;
  const checkoutStarts = funnelEvents.filter(
    (event) => event.eventType === "checkout_started",
  ).length;

  const artworkMap = new Map<
    string,
    {
      artworkId: string;
      artworkSlug: string;
      title: string;
      purchases: number;
      grossRevenueCents: number;
      refundedCents: number;
      creditsUsed: number;
    }
  >();
  const getArtworkRow = (artworkId: string, artworkSlug: string) => {
    const existing = artworkMap.get(artworkId);
    if (existing) return existing;
    const created = {
      artworkId,
      artworkSlug,
      title: artworkTitle(artworkId, artworkSlug),
      purchases: 0,
      grossRevenueCents: 0,
      refundedCents: 0,
      creditsUsed: 0,
    };
    artworkMap.set(artworkId, created);
    return created;
  };

  for (const order of orders) {
    const row = getArtworkRow(order.artworkId, order.artworkSlug);
    if (inRange(order.paidAt, range)) {
      row.purchases += 1;
      row.grossRevenueCents += moneyNumber(order.amountCents);
    }
    if (inRange(order.refundedAt, range)) {
      row.refundedCents += moneyNumber(order.amountCents);
    }
  }

  for (const entry of ledgerEntries) {
    if (entry.entryType !== "spend") continue;
    const row = getArtworkRow(entry.artworkId, entry.artworkSlug);
    row.creditsUsed += Math.abs(moneyNumber(entry.amount));
  }

  const topArtworks = [...artworkMap.values()]
    .filter(
      (artwork) =>
        artwork.purchases > 0 ||
        artwork.refundedCents > 0 ||
        artwork.creditsUsed > 0,
    )
    .sort(
      (left, right) =>
        right.purchases - left.purchases ||
        right.grossRevenueCents - left.grossRevenueCents ||
        left.title.localeCompare(right.title),
    );

  return {
    range: {
      from: range.from.toISOString().slice(0, 10),
      to: new Date(range.to.getTime() - 1).toISOString().slice(0, 10),
    },
    summary: {
      paidOrders: paidOrders.length,
      grossRevenueCents,
      refunds: refundedOrders.length,
      refundedCents,
      netRevenueCents: grossRevenueCents - refundedCents,
    },
    credits,
    funnel: {
      productViews,
      checkoutStarts,
      paidOrders: paidOrders.length,
      checkoutRate: productViews ? checkoutStarts / productViews : 0,
      paidRate: checkoutStarts ? paidOrders.length / checkoutStarts : 0,
    },
    topArtworks,
  };
}

export async function getOwnerSalesReport(
  range: SalesReportRange,
): Promise<OwnerSalesReport> {
  const orders = await db
    .select({
      artworkId: artcovrOrders.artworkId,
      artworkSlug: artcovrOrders.artworkSlug,
      amountCents: artcovrOrders.amountCents,
      status: artcovrOrders.status,
      paidAt: artcovrOrders.paidAt,
      refundedAt: artcovrOrders.refundedAt,
    })
    .from(artcovrOrders)
    .where(
      and(
        inArray(artcovrOrders.status, [...reportableOrderStatuses]),
        or(
          and(
            gte(artcovrOrders.paidAt, range.from),
            lt(artcovrOrders.paidAt, range.to),
          ),
          and(
            gte(artcovrOrders.refundedAt, range.from),
            lt(artcovrOrders.refundedAt, range.to),
          ),
        ),
      ),
    );

  const ledgerEntries = await db
    .select({
      artworkId: artcovrOrders.artworkId,
      artworkSlug: artcovrOrders.artworkSlug,
      entryType: artcovrCreditLedger.entryType,
      amount: artcovrCreditLedger.amount,
      createdAt: artcovrCreditLedger.createdAt,
    })
    .from(artcovrCreditLedger)
    .innerJoin(
      artcovrOrders,
      eq(artcovrOrders.id, artcovrCreditLedger.orderId),
    )
    .where(
      and(
        inArray(artcovrOrders.status, [...reportableOrderStatuses]),
        gte(artcovrCreditLedger.createdAt, range.from),
        lt(artcovrCreditLedger.createdAt, range.to),
      ),
    );

  const funnelEvents = await db
    .select({
      eventType: artcovrFunnelEvents.eventType,
      artworkId: artcovrFunnelEvents.artworkId,
      createdAt: artcovrFunnelEvents.createdAt,
    })
    .from(artcovrFunnelEvents)
    .where(
      and(
        gte(artcovrFunnelEvents.createdAt, range.from),
        lt(artcovrFunnelEvents.createdAt, range.to),
      ),
    );

  return buildOwnerSalesReport({
    range,
    orders,
    ledgerEntries,
    funnelEvents,
  });
}

export async function recordFunnelEvent(input: {
  id: string;
  eventType: "product_viewed" | "checkout_started";
  artworkId: string;
}) {
  await db
    .insert(artcovrFunnelEvents)
    .values(input)
    .onConflictDoNothing();
}