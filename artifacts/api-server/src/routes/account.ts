import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { artcovrOrders, db } from "@workspace/db";
import { getPublicArtworkById } from "../catalog";
import { getAuthenticatedUserId, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

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