import { and, eq, inArray } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";

const smokeEnabled = process.env.ARTCOVR_STRIPE_CHECKOUT_SMOKE === "1";
const artworkSlug = "buried-clocks";
const stripeCard = {
  number: "4242424242424242",
  expiry: "12/34",
  cvc: "123",
};

type SmokeDb = typeof import("@workspace/db");
type SmokeStripeClient = typeof import("../../../api-server/src/stripeClient");

class StripeCheckoutSmokeError extends Error {
  constructor(
    readonly step: string,
    message: string,
  ) {
    super(`[stripe-checkout-smoke] ${step}: ${message}`);
    this.name = "StripeCheckoutSmokeError";
  }
}

function smokeFailure(step: string, error: unknown) {
  if (error instanceof StripeCheckoutSmokeError) return error;
  const message =
    error instanceof Error ? error.message : "Unexpected failure.";
  return new StripeCheckoutSmokeError(step, message);
}

function assertSmokeEnvironment() {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new StripeCheckoutSmokeError(
      "environment",
      "STRIPE_WEBHOOK_SECRET is required to deliver the real event through the webhook.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new StripeCheckoutSmokeError(
      "environment",
      "DATABASE_URL is required to verify fulfillment and clean up the smoke order.",
    );
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    throw new StripeCheckoutSmokeError(
      "environment",
      "DATABASE_URL must point to the development database.",
    );
  }
  const developmentDatabase =
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) ||
    (databaseUrl.hostname === "helium" && Boolean(process.env.REPL_ID));
  if (
    !developmentDatabase ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol)
  ) {
    throw new StripeCheckoutSmokeError(
      "environment",
      "The smoke check refuses non-development databases; use the workspace development DATABASE_URL.",
    );
  }
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
    throw new StripeCheckoutSmokeError(
      "environment",
      "The smoke check refuses production deployments and production runtime mode.",
    );
  }
  if (process.env.REPLIT_ENVIRONMENT !== "development") {
    throw new StripeCheckoutSmokeError(
      "environment",
      "The smoke check requires the development Stripe connection; set REPLIT_ENVIRONMENT=development.",
    );
  }
}

async function fillStripeField(
  page: Page,
  name: string,
  value: string,
) {
  const field = page.locator(`input[name="${name}"]`).first();
  await expect(field, `Stripe field ${name} was not rendered.`).toBeVisible({
    timeout: 30_000,
  });
  await field.fill(value);
}

function signedWebhookHeader(payload: string, secret: string, timestamp: number) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function waitFor<T>(
  label: string,
  read: () => Promise<T | undefined>,
  isReady: (value: T) => boolean,
  timeoutMs = 90_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined && isReady(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new StripeCheckoutSmokeError(
    label,
    "Timed out waiting for the expected Stripe or fulfillment state.",
  );
}

async function findCompletedEvent(
  stripe: SmokeStripeClient,
  sessionId: string,
  startedAt: Date,
) {
  const events = await stripe.listStripeEvents({
    type: "checkout.session.completed",
    createdAfter: startedAt,
  });
  return events.find((event) => {
    const object = event.data.object as { id?: unknown };
    return object.id === sessionId;
  });
}

async function cleanSmokeRows(
  dbModule: SmokeDb,
  email: string,
  orderId: string | undefined,
  sessionId: string | undefined,
  eventId: string | undefined,
  stripe: SmokeStripeClient,
) {
  const orders = orderId
    ? await dbModule.db
        .select({ id: dbModule.artcovrOrders.id, stripeCheckoutSessionId: dbModule.artcovrOrders.stripeCheckoutSessionId })
        .from(dbModule.artcovrOrders)
        .where(eq(dbModule.artcovrOrders.id, orderId))
    : await dbModule.db
        .select({ id: dbModule.artcovrOrders.id, stripeCheckoutSessionId: dbModule.artcovrOrders.stripeCheckoutSessionId })
        .from(dbModule.artcovrOrders)
        .where(eq(dbModule.artcovrOrders.customerEmail, email));
  const orderIds = orders.map((order) => order.id);
  const stripeSessionIds = [
    sessionId,
    ...orders.map((order) => order.stripeCheckoutSessionId),
  ].filter((value): value is string => Boolean(value));

  if (orderIds.length) {
    await dbModule.db
      .delete(dbModule.artcovrCreditLedger)
      .where(inArray(dbModule.artcovrCreditLedger.orderId, orderIds));
  }
  if (eventId) {
    await dbModule.db
      .delete(dbModule.artcovrWebhookEvents)
      .where(eq(dbModule.artcovrWebhookEvents.id, eventId));
  }
  if (orderIds.length) {
    await dbModule.db
      .delete(dbModule.artcovrOrders)
      .where(inArray(dbModule.artcovrOrders.id, orderIds));
  }

  const remainingOrders = orderIds.length
    ? await dbModule.db
        .select({ id: dbModule.artcovrOrders.id })
        .from(dbModule.artcovrOrders)
        .where(inArray(dbModule.artcovrOrders.id, orderIds))
    : [];
  const remainingLedger = orderIds.length
    ? await dbModule.db
        .select({ id: dbModule.artcovrCreditLedger.id })
        .from(dbModule.artcovrCreditLedger)
        .where(inArray(dbModule.artcovrCreditLedger.orderId, orderIds))
    : [];
  const remainingWebhookEvents = eventId
    ? await dbModule.db
        .select({ id: dbModule.artcovrWebhookEvents.id })
        .from(dbModule.artcovrWebhookEvents)
        .where(eq(dbModule.artcovrWebhookEvents.id, eventId))
    : [];
  if (remainingOrders.length || remainingLedger.length || remainingWebhookEvents.length) {
    throw new StripeCheckoutSmokeError(
      "cleanup",
      "The smoke order, credit ledger, or webhook event still exists after cleanup.",
    );
  }

  for (const id of new Set(stripeSessionIds)) {
    try {
      const session = await stripe.retrieveCheckoutSession(id);
      if (session.status === "open") {
        const expired = await stripe.expireCheckoutSession(id);
        if (expired.status !== "expired") {
          throw new Error(`Stripe returned session status ${expired.status ?? "unknown"}.`);
        }
      }
    } catch (error) {
      throw new StripeCheckoutSmokeError(
        "cleanup",
        `Could not expire incomplete Stripe Checkout session ${id}. Resolve it before rerunning (${error instanceof Error ? error.message : "unknown Stripe error"}).`,
      );
    }
  }
}

test.describe("real Stripe checkout smoke", () => {
  test.skip(
    !smokeEnabled,
    "Opt-in only. Run pnpm run test:e2e:stripe-smoke from the development workspace.",
  );

  test("completes a test payment, fulfills once through the webhook, and cleans up", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    assertSmokeEnvironment();

    const dbModule = await import("@workspace/db");
    const stripe = await import("../../../api-server/src/stripeClient");
    const runId = randomUUID().replaceAll("-", "").slice(0, 16);
    const email = `stripe-smoke-${runId}@example.test`;
    const startedAt = new Date();
    let orderId: string | undefined;
    let sessionId: string | undefined;
    let eventId: string | undefined;
    let currentStep = "opening checkout";
    let primaryFailure: StripeCheckoutSmokeError | undefined;
    let cleanupFailure: StripeCheckoutSmokeError | undefined;

    try {
      currentStep = "opening the storefront checkout";
      await page.goto(`/checkout/${artworkSlug}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Buried Clocks" })).toBeVisible();
      await page.getByLabel("Email for receipt").fill(email);
      await page.getByRole("checkbox").check();

      currentStep = "creating an isolated test-mode checkout";
      const checkoutResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/checkout") &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Checkout as guest" }).click();
      const checkoutResponse = await checkoutResponsePromise;
      const checkoutResponseText = await checkoutResponse.text();
      let checkoutResponseBody: {
        code?: unknown;
        message?: unknown;
      } = {};
      try {
        checkoutResponseBody = JSON.parse(checkoutResponseText) as typeof checkoutResponseBody;
      } catch {
        // The status below remains useful when the API is unavailable or
        // returns a non-JSON proxy error.
      }
      if (!checkoutResponse.ok()) {
        const code =
          typeof checkoutResponseBody.code === "string"
            ? checkoutResponseBody.code
            : "unknown";
        const diagnosis =
          code === "stripe_checkout_mode_mismatch"
            ? "Bind the development Stripe test-mode connection before rerunning."
            : code === "stripe_price_missing"
              ? "Seed or reconcile the development Stripe catalog before rerunning."
              : "Check the development Stripe connector and API logs before rerunning.";
        throw new Error(
          `Checkout creation returned HTTP ${checkoutResponse.status()} (${code}). ${diagnosis}`,
        );
      }
      const checkout = checkoutResponseBody as typeof checkoutResponseBody & {
        purchaseId?: unknown;
        checkoutUrl?: unknown;
      };
      if (typeof checkout.purchaseId !== "string" || typeof checkout.checkoutUrl !== "string") {
        throw new Error("Checkout creation did not return a purchase ID and redirect URL.");
      }
      orderId = checkout.purchaseId;
      if (!checkout.checkoutUrl.startsWith("https://checkout.stripe.com/")) {
        throw new Error("Checkout did not redirect to Stripe's hosted Checkout page.");
      }

      currentStep = "completing Stripe's test payment";
      await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
      await fillStripeField(page, "cardNumber", stripeCard.number);
      await fillStripeField(page, "cardExpiry", stripeCard.expiry);
      await fillStripeField(page, "cardCvc", stripeCard.cvc);
      const billingName = page.locator('input[name="billingName"]').first();
      if (await billingName.count() && await billingName.isVisible().catch(() => false)) {
        await billingName.fill("ARTCOVR Stripe Smoke");
      }
      await page.getByRole("button", { name: /pay/i }).click();

      currentStep = "verifying the Stripe return path";
      await expect(page).toHaveURL(
        new RegExp(`/checkout/${artworkSlug}\\?status=success&session_id=cs_`),
        { timeout: 60_000 },
      );
      sessionId = new URL(page.url()).searchParams.get("session_id") ?? undefined;
      if (!sessionId) throw new Error("Stripe returned without a Checkout session ID.");

      const session = await stripe.retrieveCheckoutSession(sessionId);
      if (session.livemode) {
        throw new Error("Stripe created a live-mode session; the smoke check only permits test mode.");
      }
      if (session.payment_status !== "paid") {
        throw new Error(`Stripe returned payment status ${session.payment_status ?? "unknown"}, not paid.`);
      }

      currentStep = "retrieving the real completed Stripe event";
      const event = await waitFor(
        "completed Stripe event",
        () => findCompletedEvent(stripe, sessionId!, startedAt),
        (value) => Boolean(value),
      );
      eventId = event.id;
      if (event.livemode) {
        throw new Error("The completed Stripe event is live mode; refusing fulfillment.");
      }

      currentStep = "delivering the completed event through the webhook";
      const payload = JSON.stringify({ id: event.id });
      const timestamp = Math.floor(Date.now() / 1_000);
      const webhookResponse = await page.request.post(
        new URL("/api/stripe/webhook", page.url()).origin + "/api/stripe/webhook",
        {
          data: payload,
          headers: {
            "content-type": "application/json",
            "stripe-signature": signedWebhookHeader(
              payload,
              process.env.STRIPE_WEBHOOK_SECRET!,
              timestamp,
            ),
          },
        },
      );
      if (!webhookResponse.ok()) {
        throw new Error(`Webhook delivery returned HTTP ${webhookResponse.status()}.`);
      }

      currentStep = "asserting exactly one credit grant";
      const fulfillment = await waitFor(
        "webhook fulfillment",
        async () => {
          const [order] = await dbModule.db
            .select({
              status: dbModule.artcovrOrders.status,
              stripeCheckoutSessionId: dbModule.artcovrOrders.stripeCheckoutSessionId,
            })
            .from(dbModule.artcovrOrders)
            .where(eq(dbModule.artcovrOrders.id, orderId!));
          const grants = await dbModule.db
            .select({
              id: dbModule.artcovrCreditLedger.id,
              amount: dbModule.artcovrCreditLedger.amount,
              sourceId: dbModule.artcovrCreditLedger.sourceId,
              stripeEventId: dbModule.artcovrCreditLedger.stripeEventId,
            })
            .from(dbModule.artcovrCreditLedger)
            .where(
              and(
                eq(dbModule.artcovrCreditLedger.orderId, orderId!),
                eq(dbModule.artcovrCreditLedger.entryType, "grant"),
              ),
            );
          const [webhookEvent] = await dbModule.db
            .select({ status: dbModule.artcovrWebhookEvents.status })
            .from(dbModule.artcovrWebhookEvents)
            .where(eq(dbModule.artcovrWebhookEvents.id, eventId!));
          return { order, grants, webhookEvent };
        },
        (value) =>
          value.order?.status === "paid" &&
          value.order.stripeCheckoutSessionId === sessionId &&
          value.webhookEvent?.status === "processed",
      );
      expect(fulfillment.grants).toHaveLength(1);
      expect(fulfillment.grants[0]?.id).toBeTruthy();
      expect(fulfillment.grants[0]?.amount).toBeGreaterThan(0);
      expect(fulfillment.grants[0]?.sourceId).toBe(`checkout:${sessionId}`);
      expect(fulfillment.grants[0]?.stripeEventId).toBe(eventId);
    } catch (error) {
      primaryFailure = smokeFailure(currentStep, error);
    }

    try {
      await cleanSmokeRows(dbModule, email, orderId, sessionId, eventId, stripe);
    } catch (error) {
      cleanupFailure = smokeFailure("cleanup", error);
    } finally {
      await dbModule.pool.end();
    }

    if (primaryFailure && cleanupFailure) {
      throw new Error(`${primaryFailure.message} Cleanup also failed: ${cleanupFailure.message}`);
    }
    if (primaryFailure) throw primaryFailure;
    if (cleanupFailure) throw cleanupFailure;
  });
});