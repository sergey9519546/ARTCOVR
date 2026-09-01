import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { artcovrOrders, db } from "@workspace/db";
import { getPublicArtworkById } from "../catalog";
import {
  createOrderValues,
} from "../commerceService";
import { logger } from "../lib/logger";
import { getStripePriceForArtwork, StripeCatalogError } from "../stripeService";
import {
  createCheckoutSession,
  retrieveCheckoutSession,
} from "../stripeClient";

const router: IRouter = Router();
const checkoutBody = z.object({
  artworkId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().uuid(),
  selectedPreviewId: z.string().trim().min(1).max(200).optional().nullable(),
});

function requestOrigin(req: Request) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProto || req.protocol}://${req.get("host")}`;
}

router.post("/checkout", async (req, res): Promise<void> => {
  const parsed = checkoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: "invalid_request",
      message: "Choose a valid artwork before starting checkout.",
    });
    return;
  }

  const artwork = getPublicArtworkById(parsed.data.artworkId);
  if (!artwork || artwork.priceCents === null || artwork.saleMode === null) {
    res.status(404).json({
      code: "artwork_unavailable",
      message: "That cover is not available for purchase.",
    });
    return;
  }

  const existing = await db
    .select()
    .from(artcovrOrders)
    .where(eq(artcovrOrders.idempotencyKey, parsed.data.idempotencyKey))
    .limit(1);

  const existingOrder = existing[0];
  if (existingOrder) {
    if (
      existingOrder.artworkId !== artwork.id ||
      existingOrder.amountCents !== artwork.priceCents
    ) {
      res.status(409).json({
        code: "idempotency_conflict",
        message: "That checkout request is already tied to another cover.",
      });
      return;
    }

    if (existingOrder.stripeCheckoutSessionId) {
      const session = await retrieveCheckoutSession(
        existingOrder.stripeCheckoutSessionId,
      );
      if (session.url) {
        res.json({
          purchaseId: existingOrder.id,
          checkoutUrl: session.url,
          expiresAt: new Date(existingOrder.createdAt.getTime() + 30 * 60_000).toISOString(),
          includedCredits: existingOrder.includedCredits,
        });
        return;
      }
    }

    res.status(409).json({
      code: "checkout_in_progress",
      message: "That checkout is still being prepared. Try again in a moment.",
    });
    return;
  }

  const orderId = `order_${randomUUID()}`;
  const orderValues = createOrderValues({
    id: orderId,
    artworkId: artwork.id,
    artworkSlug: artwork.slug,
    amountCents: artwork.priceCents,
    saleMode: artwork.saleMode,
    selectedPreviewId: parsed.data.selectedPreviewId ?? undefined,
    idempotencyKey: parsed.data.idempotencyKey,
  });
  const [order] = await db
    .insert(artcovrOrders)
    .values(orderValues)
    .onConflictDoNothing()
    .returning();

  if (!order) {
    res.status(409).json({
      code: "checkout_in_progress",
      message: "That checkout is still being prepared. Try again in a moment.",
    });
    return;
  }

  try {
    const price = await getStripePriceForArtwork(artwork);
    const origin = requestOrigin(req);
    const session = await createCheckoutSession(
      {
        orderId: order.id,
        priceId: price.id,
        metadata: {
          order_id: order.id,
          artwork_id: artwork.id,
          artwork_slug: artwork.slug,
          included_credits: String(order.includedCredits),
          sale_mode: order.saleMode,
        },
        successUrl: `${origin}/checkout/${artwork.slug}?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/checkout/${artwork.slug}?status=cancelled`,
      },
      parsed.data.idempotencyKey,
    );

    if (!session.url) {
      throw new Error("Stripe returned a checkout session without a URL.");
    }

    await db
      .update(artcovrOrders)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(artcovrOrders.id, order.id));

    res.json({
      purchaseId: order.id,
      checkoutUrl: session.url,
      expiresAt: new Date(
        order.createdAt.getTime() + 30 * 60_000,
      ).toISOString(),
      includedCredits: order.includedCredits,
    });
  } catch (error) {
    await db
      .update(artcovrOrders)
      .set({ status: "expired" })
      .where(and(eq(artcovrOrders.id, order.id), eq(artcovrOrders.status, "reserved")));

    const code =
      error instanceof StripeCatalogError
        ? error.code
        : "stripe_checkout_failed";
    const message =
      error instanceof StripeCatalogError
        ? "This cover is not fully configured for checkout yet."
        : "Stripe could not open checkout. Please try again.";
    logger.error({ err: error, orderId: order.id, code }, "ARTCOVR checkout failed");
    res.status(error instanceof StripeCatalogError ? 503 : 502).json({ code, message });
  }
});

export default router;