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
import {
  serializeAccount,
  serializeCreditActivityPage,
} from "../generationService";
import { InvalidCreditActivityCursorError } from "../creditService";
import {
  GetArtworkOrderPreferenceResponse,
  PutArtworkOrderPreferenceBody,
  PutArtworkOrderPreferenceResponse,
} from "@workspace/api-zod";
import {
  getArtworkOrderPreference,
  saveArtworkOrderPreference,
} from "../artworkOrderPreference";

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
  const creditActivityCursor =
    typeof req.query.creditActivityCursor === "string"
      ? req.query.creditActivityCursor
      : undefined;
  if (
    req.query.creditActivityCursor !== undefined &&
    !creditActivityCursor
  ) {
    res.status(400).json({
      code: "invalid_credit_activity_cursor",
      message: "The credit activity page could not be loaded.",
    });
    return;
  }
  try {
    res
      .set("Cache-Control", "private, no-store")
      .json(
        creditActivityCursor
          ? await serializeCreditActivityPage(
              clerkUserId,
              creditActivityCursor,
            )
          : await serializeAccount(clerkUserId),
      );
  } catch (error) {
    if (error instanceof InvalidCreditActivityCursorError) {
      res.status(400).json({
        code: "invalid_credit_activity_cursor",
        message: "The credit activity page could not be loaded.",
      });
      return;
    }
    req.log.error({ err: error, clerkUserId }, "Account media load failed");
    res.status(502).json({ code: "account_assets_failed", message: "Account media could not be loaded." });
  }
});

router.get(
  "/functions/v1/artwork-order-preference",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getAuthenticatedUserId(req);
    try {
      const preference = await getArtworkOrderPreference(clerkUserId);
      res
        .set("Cache-Control", "private, no-store")
        .json(GetArtworkOrderPreferenceResponse.parse({ preference }));
    } catch (error) {
      req.log.error({ err: error }, "Artwork order preference load failed");
      res.status(500).json({
        code: "artwork_order_preference_load_failed",
        message: "We could not load your artwork preference.",
      });
    }
  },
);

router.put(
  "/functions/v1/artwork-order-preference",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = PutArtworkOrderPreferenceBody.strict().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: "invalid_artwork_order_preference",
        message: "Choose Rotation or Shuffle.",
      });
      return;
    }

    const clerkUserId = getAuthenticatedUserId(req);
    try {
      const preference = await saveArtworkOrderPreference(
        clerkUserId,
        parsed.data.preference,
      );
      res
        .set("Cache-Control", "private, no-store")
        .json(PutArtworkOrderPreferenceResponse.parse({ preference }));
    } catch (error) {
      req.log.error({ err: error }, "Artwork order preference save failed");
      res.status(500).json({
        code: "artwork_order_preference_save_failed",
        message: "We could not save your artwork preference.",
      });
    }
  },
);

export default router;