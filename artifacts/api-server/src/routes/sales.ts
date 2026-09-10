import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getPublicArtworkById } from "../catalog";
import {
  getAuthenticatedUserId,
  requireAuth,
} from "../middlewares/auth";
import { isCurationUser } from "./intelligence";
import {
  getOwnerSalesReport,
  recordFunnelEvent,
  type SalesReportRange,
} from "../salesReport";

const router: IRouter = Router();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");
const reportQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
});
const funnelEventBody = z.object({
  eventId: z.string().uuid(),
  eventType: z.literal("product_viewed"),
  artworkId: z.string().trim().min(1).max(200),
});

export function productViewDedupeKey(
  req: Request,
  artworkId: string,
  now = new Date(),
) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return undefined;
  const day = now.toISOString().slice(0, 10);
  const clientKey = `${req.ip}|${req.get("user-agent") ?? "unknown"}`;
  const digest = createHmac("sha256", secret)
    .update(clientKey)
    .digest("hex")
    .slice(0, 32);
  return `product_viewed:${artworkId}:${day}:${digest}`;
}

function defaultReportRange(now = new Date()): SalesReportRange {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from, to };
}

function parseUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export function parseSalesReportRange(
  query: Record<string, unknown>,
  now = new Date(),
): SalesReportRange | null {
  const parsed = reportQuery.safeParse(query);
  if (!parsed.success) return null;
  const defaults = defaultReportRange(now);
  const from = parsed.data.from
    ? parseUtcDate(parsed.data.from)
    : defaults.from;
  const parsedTo = parsed.data.to ? parseUtcDate(parsed.data.to) : null;
  if (parsed.data.to && !parsedTo) return null;
  const toDate = parsedTo ?? new Date(defaults.to);
  if (!from) return null;
  if (parsed.data.to) toDate.setUTCDate(toDate.getUTCDate() + 1);
  if (
    Number.isNaN(from.valueOf()) ||
    Number.isNaN(toDate.valueOf()) ||
    from >= toDate ||
    toDate.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000
  ) {
    return null;
  }
  return { from, to: toDate };
}

router.post("/functions/v1/funnel-events", async (req, res): Promise<void> => {
  const parsed = funnelEventBody.safeParse(req.body);
  if (!parsed.success || !getPublicArtworkById(parsed.data.artworkId)) {
    res.status(400).json({
      code: "invalid_funnel_event",
      message: "That storefront event could not be recorded.",
    });
    return;
  }
  try {
    await recordFunnelEvent({
      id: parsed.data.eventId,
      eventType: parsed.data.eventType,
      artworkId: parsed.data.artworkId,
      dedupeKey: productViewDedupeKey(req, parsed.data.artworkId),
    });
    res.json({ recorded: true });
  } catch (error) {
    req.log.warn({ err: error }, "Funnel event recording failed");
    res.status(503).json({
      code: "funnel_event_unavailable",
      message: "Storefront analytics are temporarily unavailable.",
    });
  }
});

export function createOwnerSalesHandler(
  loadReport: typeof getOwnerSalesReport = getOwnerSalesReport,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    if (!isCurationUser(userId)) {
      res.status(403).json({
        code: "sales_forbidden",
        message: "Explicit owner or administrator access is required for sales reporting.",
      });
      return;
    }
    const range = parseSalesReportRange(req.query as Record<string, unknown>);
    if (!range) {
      res.status(400).json({
        code: "invalid_sales_range",
        message: "Choose a valid reporting window of 366 days or less.",
      });
      return;
    }
    try {
      const report = await loadReport(range);
      res.set("Cache-Control", "private, no-store").json(report);
    } catch (error) {
      req.log.error({ err: error, userId }, "Owner sales report failed");
      res.status(502).json({
        code: "sales_report_failed",
        message: "The sales report could not be loaded.",
      });
    }
  };
}

router.get(
  "/owner/sales",
  requireAuth,
  createOwnerSalesHandler(),
);

export default router;