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
import { serializeAccount } from "../generationService";

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

router.get("/functions/v1/my-images", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = getAuthenticatedUserId(req);
  try {
    res.set("Cache-Control", "private, no-store").json(await serializeAccount(clerkUserId));
  } catch (error) {
    req.log.error({ err: error, clerkUserId }, "Account media load failed");
    res.status(502).json({ code: "account_assets_failed", message: "Account media could not be loaded." });
  }
});

export default router;