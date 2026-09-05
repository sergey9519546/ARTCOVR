import { Router, type IRouter } from "express";
import { getAuthenticatedUserId, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

export function getCurationUserIds(rawValue = process.env.ARTCOVR_CURATION_USER_IDS) {
  return new Set(
    (rawValue ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isCurationUser(
  userId: string,
  curationUserIds = getCurationUserIds(),
) {
  return curationUserIds.has(userId);
}

router.get("/owner/catalog-intelligence", requireAuth, (req, res): void => {
  const userId = getAuthenticatedUserId(req);
  if (!isCurationUser(userId)) {
    res.status(403).json({
      code: "curation_forbidden",
      message: "Explicit owner or admin access is required for catalog curation.",
    });
    return;
  }

  res.set("Cache-Control", "private, no-store");
  res.json({
    authorized: true,
    role: "curator",
    capabilities: {
      aggregateInsights: true,
      visualDiversityMap: true,
      duplicateReview: false,
    },
  });
});

export default router;