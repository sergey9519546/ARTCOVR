import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import {
  Router,
  type IRouter,
  type RequestHandler,
} from "express";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  artcovrCreditPackPurchases,
  artcovrGenerations,
  artcovrOrders,
  db,
} from "@workspace/db";
import { getPublicArtworkById } from "../catalog";
import {
  checkoutReservationMs,
  createOrderValues,
  expireStaleExclusiveReservations,
} from "../commerceService";
import { logger } from "../lib/logger";
import {
  getStripePriceForArtwork,
  getStripePriceForCreditUnit,
  StripeCatalogError,
} from "../stripeService";
import {
  createCheckoutSession,
  retrieveCheckoutSession,
  StripeCheckoutModeError,
} from "../stripeClient";
import { getTrustedPublicOrigin } from "../middlewares/trustBoundary";
import {
  getAuthenticatedUserId,
  requireAuth,
} from "../middlewares/auth";
import { commerceConfig } from "../commerce-config";
import { recordFunnelEvent } from "../salesReport";
import {
  CheckoutAdmissionLimiter,
  type CheckoutAdmissionResult,
} from "../checkoutAdmission";

const router: IRouter = Router();
const checkoutBody = z.object({
  artworkId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().uuid(),
  selectedPreviewId: z.string().trim().min(1).max(200).optional().nullable(),
  email: z.string().trim().email().max(320).optional().nullable(),
});

const exclusiveInventoryStatuses = ["reserved", "paid"] as const;
const maxCreditPackQuantity = 50;

type CheckoutFailureDetails = {
  err: unknown;
  orderId: string;
  code: string;
  diagnosis?: string;
  stripeCheckoutSessionId?: string;
  expectedLivemode?: boolean;
  actualLivemode?: boolean;
};

type CheckoutRouteDependencies = {
  getStripePriceForArtwork: typeof getStripePriceForArtwork;
  createCheckoutSession: typeof createCheckoutSession;
  retrieveCheckoutSession: typeof retrieveCheckoutSession;
  checkoutAdmission: CheckoutAdmissionLimiter;
  logCheckoutFailure: (
    details: CheckoutFailureDetails,
    message: string,
  ) => void;
};

const defaultCheckoutRouteDependencies: CheckoutRouteDependencies = {
  getStripePriceForArtwork,
  createCheckoutSession,
  retrieveCheckoutSession,
  checkoutAdmission: new CheckoutAdmissionLimiter(),
  logCheckoutFailure: (details, message) => logger.error(details, message),
};

export function checkoutReturnUrls(artworkSlug: string, publicOrigin: string) {
  const origin = getTrustedPublicOrigin({ ARTCOVR_PUBLIC_ORIGIN: publicOrigin });
  return {
    successUrl: `${origin}/checkout/${artworkSlug}?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/checkout/${artworkSlug}?status=cancelled`,
  };
}

export function creditPackCheckoutReturnUrls(publicOrigin: string) {
  const origin = getTrustedPublicOrigin({ ARTCOVR_PUBLIC_ORIGIN: publicOrigin });
  return {
    successUrl: `${origin}/my-images?credit_checkout=return&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/my-images?credit_checkout=cancelled`,
  };
}

const creditPackCheckoutBody = z.object({
  credits: z.number().int().min(1).max(maxCreditPackQuantity),
  idempotencyKey: z.string().uuid(),
}).strict();

type CreditPackCheckoutFailureDetails = {
  err: unknown;
  creditPackPurchaseId: string;
  code: string;
};

type CreditPackRouteDependencies = {
  getStripePriceForCreditUnit: typeof getStripePriceForCreditUnit;
  createCheckoutSession: typeof createCheckoutSession;
  retrieveCheckoutSession: typeof retrieveCheckoutSession;
  checkoutAdmission: CheckoutAdmissionLimiter;
  logCheckoutFailure: (
    details: CreditPackCheckoutFailureDetails,
    message: string,
  ) => void;
};

const defaultCreditPackRouteDependencies: CreditPackRouteDependencies = {
  getStripePriceForCreditUnit,
  createCheckoutSession,
  retrieveCheckoutSession,
  checkoutAdmission: new CheckoutAdmissionLimiter(),
  logCheckoutFailure: (details, message) => logger.error(details, message),
};

function creditPackCheckoutResponse(
  purchase: typeof artcovrCreditPackPurchases.$inferSelect,
  checkoutUrl: string,
) {
  return {
    creditPackPurchaseId: purchase.id,
    checkoutUrl,
    expiresAt: (
      purchase.reservationExpiresAt ??
      new Date(purchase.createdAt.getTime() + checkoutReservationMs)
    ).toISOString(),
    credits: purchase.credits,
    amountCents: purchase.amountCents,
  };
}

export function createCreditPackCheckoutHandler(
  overrides: Partial<CreditPackRouteDependencies> = {},
): RequestHandler {
  const dependencies = {
    ...defaultCreditPackRouteDependencies,
    ...overrides,
  };

  return async (req, res): Promise<void> => {
    const clerkUserId = getAuthenticatedUserId(req);
    const parsed = creditPackCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: "invalid_request",
        message: "Choose a whole-number credit quantity between 1 and 50.",
      });
      return;
    }

    const [existing] = await db
      .select()
      .from(artcovrCreditPackPurchases)
      .where(
        eq(
          artcovrCreditPackPurchases.idempotencyKey,
          parsed.data.idempotencyKey,
        ),
      )
      .limit(1);
    if (existing) {
      if (
        existing.clerkUserId !== clerkUserId ||
        existing.credits !== parsed.data.credits
      ) {
        res.status(409).json({
          code: "idempotency_conflict",
          message: "That checkout request is already tied to another purchase.",
        });
        return;
      }
      if (existing.status !== "reserved") {
        res.status(409).json({
          code:
            existing.status === "paid"
              ? "credit_pack_purchase_complete"
              : "idempotency_expired",
          message:
            existing.status === "paid"
              ? "That credit pack has already been paid for."
              : "That checkout reservation has expired. Start checkout again.",
        });
        return;
      }
      if (!existing.stripeCheckoutSessionId) {
        res.status(409).json({
          code: "checkout_in_progress",
          message: "That checkout is still being prepared. Try again shortly.",
        });
        return;
      }
      const session = await dependencies.retrieveCheckoutSession(
        existing.stripeCheckoutSessionId,
      );
      if (session.url && session.status === "open") {
        res.json(creditPackCheckoutResponse(existing, session.url));
        return;
      }
      res.status(409).json({
        code: "checkout_in_progress",
        message: "That checkout is being confirmed. Refresh your account shortly.",
      });
      return;
    }

    const admission = dependencies.checkoutAdmission.admit([
      `ip:${req.ip || req.socket.remoteAddress || "unknown"}`,
      `clerk:${clerkUserId}`,
    ]);
    if (!admission.allowed) {
      res.set("Retry-After", String(admission.retryAfterSeconds));
      res.status(429).json({
        code: "checkout_rate_limited",
        message: "Too many new checkout attempts. Try again later.",
      });
      return;
    }

    let price: Awaited<ReturnType<typeof getStripePriceForCreditUnit>>;
    try {
      price = await dependencies.getStripePriceForCreditUnit();
    } catch (error) {
      if (error instanceof StripeCatalogError) {
        res.status(503).json({
          code: error.code,
          message: "Standalone generation credits are not configured yet.",
        });
        return;
      }
      throw error;
    }
    if (
      price.type !== "one_time" ||
      price.active !== true ||
      price.currency !== commerceConfig.currency ||
      price.unit_amount !== commerceConfig.creditPriceCents
    ) {
      res.status(503).json({
        code: "stripe_price_missing",
        message: "Standalone generation credits are not configured yet.",
      });
      return;
    }

    const purchaseId = `credit_pack_${randomUUID()}`;
    const reservationExpiresAt = new Date(Date.now() + checkoutReservationMs);
    const [purchase] = await db
      .insert(artcovrCreditPackPurchases)
      .values({
        id: purchaseId,
        clerkUserId,
        idempotencyKey: parsed.data.idempotencyKey,
        credits: parsed.data.credits,
        amountCents: price.unit_amount! * parsed.data.credits,
        currency: price.currency,
        status: "reserved",
        reservationExpiresAt,
      })
      .onConflictDoNothing()
      .returning();
    if (!purchase) {
      res.status(409).json({
        code: "checkout_in_progress",
        message: "That checkout is still being prepared. Try again in a moment.",
      });
      return;
    }

    try {
      const returnUrls = creditPackCheckoutReturnUrls(
        getTrustedPublicOrigin(),
      );
      const session = await dependencies.createCheckoutSession(
        {
          orderId: purchase.id,
          priceId: price.id,
          quantity: purchase.credits,
          metadata: {
            purchase_type: "image_generation_credit",
            credit_pack_purchase_id: purchase.id,
            credits: String(purchase.credits),
            unit_amount_cents: String(price.unit_amount),
            currency: price.currency,
          },
          successUrl: returnUrls.successUrl,
          cancelUrl: returnUrls.cancelUrl,
          expiresAt: reservationExpiresAt,
        },
        `credit-pack:${parsed.data.idempotencyKey}`,
      );
      if (!session.url) {
        throw new Error("Stripe returned checkout without a URL.");
      }
      await db
        .update(artcovrCreditPackPurchases)
        .set({ stripeCheckoutSessionId: session.id })
        .where(eq(artcovrCreditPackPurchases.id, purchase.id));
      res.json(creditPackCheckoutResponse(purchase, session.url));
    } catch (error) {
      await db
        .update(artcovrCreditPackPurchases)
        .set({ status: "expired" })
        .where(
          and(
            eq(artcovrCreditPackPurchases.id, purchase.id),
            eq(artcovrCreditPackPurchases.status, "reserved"),
          ),
        );
      const code =
        error instanceof StripeCatalogError
          ? error.code
          : error instanceof StripeCheckoutModeError
            ? error.code
            : "stripe_checkout_failed";
      dependencies.logCheckoutFailure(
        { err: error, creditPackPurchaseId: purchase.id, code },
        "ARTCOVR credit pack checkout failed",
      );
      res.status(error instanceof StripeCatalogError ? 503 : 502).json({
        code,
        message:
          error instanceof StripeCatalogError
            ? "Standalone generation credits are not configured yet."
            : "Stripe could not open checkout. Please try again.",
      });
    }
  };
}

router.get(
  "/functions/v1/credit-pack-options",
  requireAuth,
  async (_req, res): Promise<void> => {
    try {
      const price = await getStripePriceForCreditUnit();
      if (
        price.type !== "one_time" ||
        price.active !== true ||
        price.currency !== commerceConfig.currency ||
        price.unit_amount !== commerceConfig.creditPriceCents
      ) {
        throw new StripeCatalogError("Credit price does not match configuration.");
      }
      res
        .set("Cache-Control", "private, no-store")
        .json({
          currency: price.currency,
          creditPriceCents: price.unit_amount,
          maxCredits: maxCreditPackQuantity,
        });
    } catch (error) {
      if (error instanceof StripeCatalogError) {
        res.status(503).json({
          code: error.code,
          message: "Standalone generation credits are not configured yet.",
        });
        return;
      }
      throw error;
    }
  },
);

router.post(
  "/functions/v1/credit-pack-checkouts",
  requireAuth,
  createCreditPackCheckoutHandler(),
);

export function createCreditPackCheckoutStatusHandler(): RequestHandler {
  return async (req, res): Promise<void> => {
    const clerkUserId = getAuthenticatedUserId(req);
    const sessionId = req.params.sessionId;
    if (typeof sessionId !== "string") {
      res.status(404).json({
        code: "credit_pack_checkout_not_found",
        message: "That credit checkout was not found.",
      });
      return;
    }
    const [purchase] = await db
      .select({
        status: artcovrCreditPackPurchases.status,
        credits: artcovrCreditPackPurchases.credits,
      })
      .from(artcovrCreditPackPurchases)
      .where(
        and(
          eq(
            artcovrCreditPackPurchases.stripeCheckoutSessionId,
            sessionId,
          ),
          eq(artcovrCreditPackPurchases.clerkUserId, clerkUserId),
        ),
      )
      .limit(1);
    if (!purchase) {
      res.status(404).json({
        code: "credit_pack_checkout_not_found",
        message: "That credit checkout was not found.",
      });
      return;
    }
    res
      .set("Cache-Control", "private, no-store")
      .json({ status: purchase.status, credits: purchase.credits });
  };
}

router.get(
  "/functions/v1/credit-pack-checkouts/:sessionId",
  requireAuth,
  createCreditPackCheckoutStatusHandler(),
);

export function createCheckoutHandler(
  overrides: Partial<CheckoutRouteDependencies> = {},
): RequestHandler {
  const dependencies = {
    ...defaultCheckoutRouteDependencies,
    ...overrides,
  };

  return async (req, res): Promise<void> => {
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
    // A checkout UUID is a retry token, not permission to use another buyer's session.
    // Guest retries remain anonymous and must also match the original receipt email.
    const sameCheckoutPrincipal = existingOrder.clerkUserId
      ? existingOrder.clerkUserId === clerkUserId
      : !clerkUserId &&
        Boolean(customerEmail) &&
        existingOrder.customerEmail?.trim().toLowerCase() === customerEmail;
    if (!sameCheckoutPrincipal) {
      res.status(409).json({
        code: "idempotency_conflict",
        message: "That checkout request belongs to another customer.",
      });
      return;
    }

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
      const session = await dependencies.retrieveCheckoutSession(
        existingOrder.stripeCheckoutSessionId,
      );
      if (session.url) {
        try {
          await recordFunnelEvent({
            id: `checkout:${existingOrder.id}`,
            eventType: "checkout_started",
            artworkId: existingOrder.artworkId,
            orderId: existingOrder.id,
            dedupeKey: `checkout:${existingOrder.id}`,
          });
        } catch (error) {
          logger.warn(
            { err: error, orderId: existingOrder.id },
            "Checkout funnel event recording failed",
          );
        }
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

  const admissionKeys = [
    `ip:${req.ip || req.socket.remoteAddress || "unknown"}`,
    clerkUserId ? `clerk:${clerkUserId}` : `email:${customerEmail}`,
  ];
  const admission: CheckoutAdmissionResult =
    dependencies.checkoutAdmission.admit(admissionKeys);
  if (!admission.allowed) {
    res.set("Retry-After", String(admission.retryAfterSeconds));
    res.status(429).json({
      code: "checkout_rate_limited",
      message: "Too many new checkout attempts. Try again later.",
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
    const price = await dependencies.getStripePriceForArtwork(artwork);
    const returnUrls = checkoutReturnUrls(
      artwork.slug,
      getTrustedPublicOrigin(),
    );
    const session = await dependencies.createCheckoutSession(
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
    try {
      await recordFunnelEvent({
        id: `checkout:${order.id}`,
        eventType: "checkout_started",
        artworkId: order.artworkId,
        orderId: order.id,
        dedupeKey: `checkout:${order.id}`,
      });
    } catch (error) {
      logger.warn({ err: error, orderId: order.id }, "Checkout funnel event recording failed");
    }

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
    dependencies.logCheckoutFailure(
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
  };
}

router.post("/checkout", createCheckoutHandler());

export default router;
