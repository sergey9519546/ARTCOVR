import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { artcovrOrders, db } from "@workspace/db";
import { getPublicArtworkById } from "../catalog";
import {
  getAuthenticatedUserId,
  getVerifiedClerkEmails,
  requireAuth,
} from "../middlewares/auth";
import { claimGuestPurchases } from "../commerceService";

const router: IRouter = Router();

router.post(
  "/functions/v1/claim-guest-purchases",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getAuthenticatedUserId(req);
    try {
      const verifiedEmails = await getVerifiedClerkEmails(clerkUserId);
      if (verifiedEmails.length === 0) {
        res.status(403).json({
          code: "verified_email_required",
          message: "Verify your email before claiming guest purchases.",
        });
        return;
      }

      const result = await claimGuestPurchases(clerkUserId, verifiedEmails);
      res.set("Cache-Control", "private, no-store");
      res.json(result);
    } catch (error) {
      req.log.error({ err: error, clerkUserId }, "Guest purchase claim failed");
      res.status(500).json({
        code: "claim_failed",
        message: "We could not claim your guest purchases.",
      });
    }
  },
);

/**
 * Account data is deliberately resolved from the Clerk subject on the server.
 * The browser never sends a user id, bearer token, or database key.
 *
 * The current API owns checkout orders while image-generation/storage remains
 * in the legacy service boundary. Returning empty generation/download lists is
 * intentional until those records are moved; it is safer than exposing an
 * unscoped legacy query.
 */
router.get("/functions/v1/my-images", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getAuthenticatedUserId(req);
  const orders = await db
    .select()
    .from(artcovrOrders)
    .where(eq(artcovrOrders.clerkUserId, clerkUserId))
    .orderBy(desc(artcovrOrders.createdAt));

  res.set("Cache-Control", "private, no-store");
  res.json({
    purchases: orders.map((order) => {
      const artwork = getPublicArtworkById(order.artworkId);
      return {
        id: order.id,
        artworkId: order.artworkId,
        artworkTitle: artwork?.title ?? order.artworkSlug,
        artworkSlug: artwork?.slug ?? order.artworkSlug,
        saleMode: order.saleMode,
        status: order.status,
        amountCents: order.amountCents,
        currency: order.currency,
        paidAt: order.paidAt?.toISOString() ?? null,
        entitlementExpiresAt: null,
        selectedPreviewGenerationId: order.selectedPreviewId,
        resetSource: "original",
        accessRevokedAt: null,
        accessRevocationReason: null,
        remainingGenerations: order.includedCredits,
      };
    }),
    generations: [],
    downloads: [],
  });
});

export default router;