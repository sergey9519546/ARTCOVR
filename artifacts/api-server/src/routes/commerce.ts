import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { Router, type IRouter } from "express";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { artcovrGenerations, artcovrOrders, db } from "@workspace/db";
import { getPublicArtworkById } from "../catalog";
import {
  checkoutReservationMs,
  createOrderValues,
  expireStaleExclusiveReservations,
} from "../commerceService";
import { logger } from "../lib/logger";
import { getStripePriceForArtwork, StripeCatalogError } from "../stripeService";
import {
  createCheckoutSession,
  retrieveCheckoutSession,
  StripeCheckoutModeError,
} from "../stripeClient";
import { getTrustedPublicOrigin } from "../middlewares/trustBoundary";

const router: IRouter = Router();
const checkoutBody = z.object({
  artworkId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().uuid(),
  selectedPreviewId: z.string().trim().min(1).max(200).optional().nullable(),
  email: z.string().trim().email().max(320).optional().nullable(),
});

const exclusiveInventoryStatuses = ["reserved", "paid"] as const;

export function checkoutReturnUrls(artworkSlug: string, publicOrigin: string) {
  const origin = getTrustedPublicOrigin({ ARTCOVR_PUBLIC_ORIGIN: publicOrigin });
  return {
    successUrl: `${origin}/checkout/${artworkSlug}?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/checkout/${artworkSlug}?status=cancelled`,
  };
}

router.post("/checkout", async (req, res): Promise<void> => {
  const clerkUserId = getAuth(req).userId ?? null;
  const parsed = checkoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: "invalid_request",
      message: "Choose a valid artwork before starting checkout.",
    });
    return;
  }
  const customerEmail = parsed.data.email?.trim().toLowerCase() || null;
  if (!clerkUserId && !customerEmail) {
    res.status(400).json({
      code: "email_required",
      message: "Enter a valid email address for your receipt.",
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

  const selectedPreviewId = parsed.data.selectedPreviewId ?? null;
  if (selectedPreviewId) {
    if (!clerkUserId) {
      res.status(403).json({
        code: "selected_preview_not_eligible",
        message: "That preview is not eligible for this checkout.",
      });
      return;
    }

    const [selectedPreview] = await db
      .select({ id: artcovrGenerations.id })
      .from(artcovrGenerations)
      .where(
        and(
          eq(artcovrGenerations.id, selectedPreviewId),
          eq(artcovrGenerations.clerkUserId, clerkUserId),
          eq(artcovrGenerations.artworkId, artwork.id),
          eq(artcovrGenerations.phase, "preview"),
          eq(artcovrGenerations.status, "succeeded"),
          isNull(artcovrGenerations.purchaseId),
          gt(artcovrGenerations.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!selectedPreview) {
      res.status(403).json({
        code: "selected_preview_not_eligible",
        message: "That preview is not eligible for this checkout.",
      });
      return;
    }
  }

  if (artwork.saleMode === "exclusive") {
    await expireStaleExclusiveReservations(artwork.id);
  }

  const existing = await db
    .select()
    .from(artcovrOrders)
    .where(
      eq(artcovrOrders.idempotencyKey, parsed.data.idempotencyKey),
    )
    .limit(1);

  const existingOrder = existing[0];
  if (existingOrder) {
    if (
      existingOrder.artworkId !== artwork.id ||
      existingOrder.amountCents !== artwork.priceCents ||
      existingOrder.selectedPreviewId !== selectedPreviewId
    ) {
      res.status(409).json({
        code: "idempotency_conflict",
        message: "That checkout request is already tied to another cover.",
      });
      return;
    }

    if (existingOrder.status === "expired") {
      res.status(409).json({
        code: "idempotency_expired",
        message: "That checkout reservation has expired. Start checkout again.",
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
          expiresAt: (
            existingOrder.reservationExpiresAt ??
            new Date(existingOrder.createdAt.getTime() + checkoutReservationMs)
          ).toISOString(),
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
  const reservationExpiresAt = new Date(Date.now() + checkoutReservationMs);
  const orderValues = createOrderValues({
    id: orderId,
    clerkUserId,
    customerEmail,
    artworkId: artwork.id,
    artworkSlug: artwork.slug,
    amountCents: artwork.priceCents,
    saleMode: artwork.saleMode,
    selectedPreviewId: selectedPreviewId ?? undefined,
    idempotencyKey: parsed.data.idempotencyKey,
    reservationExpiresAt,
  });
  const [order] = await db
    .insert(artcovrOrders)
    .values(orderValues)
    .onConflictDoNothing()
    .returning();

  if (!order) {
    if (artwork.saleMode === "exclusive") {
      const [activeExclusiveOrder] = await db
        .select({ id: artcovrOrders.id })
        .from(artcovrOrders)
        .where(
          and(
            eq(artcovrOrders.artworkId, artwork.id),
            eq(artcovrOrders.saleMode, "exclusive"),
            inArray(artcovrOrders.status, exclusiveInventoryStatuses),
          ),
        )
        .limit(1);

      if (activeExclusiveOrder) {
        res.status(409).json({
          code: "artwork_unavailable",
          message: "That exclusive cover has already been reserved or sold.",
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

  try {
    const price = await getStripePriceForArtwork(artwork);
    const returnUrls = checkoutReturnUrls(
      artwork.slug,
      getTrustedPublicOrigin(),
    );
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
        successUrl: returnUrls.successUrl,
        cancelUrl: returnUrls.cancelUrl,
        expiresAt: reservationExpiresAt,
        customerEmail: customerEmail ?? undefined,
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
      expiresAt: reservationExpiresAt.toISOString(),
      includedCredits: order.includedCredits,
    });
  } catch (error) {
    await db
      .update(artcovrOrders)
      .set({ status: "expired" })
      .where(and(eq(artcovrOrders.id, order.id), eq(artcovrOrders.status, "reserved")));

    const modeMismatch = error instanceof StripeCheckoutModeError;
    const code =
      error instanceof StripeCatalogError
        ? error.code
        : modeMismatch
          ? error.code
          : "stripe_checkout_failed";
    const message =
      error instanceof StripeCatalogError
        ? "This cover is not fully configured for checkout yet."
        : "Stripe could not open checkout. Please try again.";
    logger.error(
      {
        err: error,
        orderId: order.id,
        code,
        ...(modeMismatch
          ? {
              diagnosis: "stripe_checkout_mode_mismatch",
              stripeCheckoutSessionId: error.sessionId,
              expectedLivemode: error.expectedLivemode,
              actualLivemode: error.actualLivemode,
            }
          : {}),
      },
      "ARTCOVR checkout failed",
    );
    res.status(error instanceof StripeCatalogError ? 503 : 502).json({ code, message });
  }
});

export default router;