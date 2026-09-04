import app from "./app";
import { logger } from "./lib/logger";
import { ensureStripeWebhook } from "./stripeClient";
import { seedStripeCatalog } from "./catalogSeeder";
import { validateProductionEnvironment } from "./runtimeConfig";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

validateProductionEnvironment();

async function initStripe() {
  if (process.env.ARTCOVR_SKIP_STRIPE_INIT === "1") {
    logger.warn("ARTCOVR_SKIP_STRIPE_INIT=1; Stripe endpoint setup was skipped.");
    return;
  }
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (domain) {
    await ensureStripeWebhook(`https://${domain}/api/stripe/webhook`);
  } else {
    logger.warn("REPLIT_DOMAINS is unavailable; managed Stripe webhook was not configured.");
  }
  if (process.env.ARTCOVR_SEED_CATALOG === "true") {
    const seeded = await seedStripeCatalog();
    logger.info(seeded, "ARTCOVR Stripe catalog seed complete");
  }
  logger.info("Stripe proxy and webhook ready");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

void initStripe().catch((error) => {
  logger.error({ err: error }, "Stripe initialization failed");
});
