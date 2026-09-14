import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";
import { getReleaseDiagnostics } from "../releaseDiagnostics";

const router: IRouter = Router();

router.get("/", (_req, res): void => {
  res.json({
    service: "artcovr-api",
    status: "ok",
    health: "/api/healthz",
  });
});

router.get("/healthz", async (_req, res): Promise<void> => {
  try {
    await db.execute(sql`select 1`);
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (error) {
    logger.error(
      { err: error, readinessPhase: "database" },
      "Database readiness check failed",
    );
    res.status(503).json({ status: "unhealthy" });
  }
});

router.get("/diagnostics", async (_req, res): Promise<void> => {
  try {
    res.json(await getReleaseDiagnostics());
  } catch (error) {
    logger.warn(
      { diagnostic: "agent_mpp", failure: "unexpected_readiness_error" },
      "Release diagnostics could not evaluate optional agent commerce",
    );
    res.json({
      status: "ok",
      agentCommerce: {
        state: "unavailable",
        reason: "stripe_credentials_unavailable",
        enabled: false,
        priceSource: "catalog",
        priceOverrideConfigured: false,
        stripeMode: "unknown",
        credentialSource: "unavailable",
        operational: {
          counts: {},
          pendingRefunds: 0,
          lastEventAt: null,
        },
      },
    });
  }
});

export default router;
