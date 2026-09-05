import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

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
    logger.error({ err: error }, "Database readiness check failed");
    res.status(503).json({ status: "unhealthy" });
  }
});

export default router;
