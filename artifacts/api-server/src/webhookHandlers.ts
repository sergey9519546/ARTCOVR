import type Stripe from "stripe";
import { fulfillCheckoutSession } from "./commerceService";
import { logger } from "./lib/logger";
import { auditStripeCatalog } from "./stripeCatalogCleanup";
import { retrieveStripeEvent } from "./stripeClient";
import { verifyStripeWebhookSignature } from "./webhookSecurity";

const catalogAuditCheckoutEvents = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
]);

export type CheckoutCatalogAuditTrigger = {
  eventId: string;
  eventType: Stripe.Event.Type;
  sessionId: string;
  artworkId: string | null;
  priceId: string | null;
  productId: string | null;
};

type WebhookDependencies = {
  verifySignature: typeof verifyStripeWebhookSignature;
  retrieveEvent: typeof retrieveStripeEvent;
  fulfillSession: typeof fulfillCheckoutSession;
  scheduleCatalogAudit: (trigger: CheckoutCatalogAuditTrigger) => void;
};

function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function checkoutCatalogAuditTrigger(
  event: Stripe.Event,
): CheckoutCatalogAuditTrigger | null {
  if (!catalogAuditCheckoutEvents.has(event.type)) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  const lineItem = session.line_items?.data[0];
  const price =
    lineItem?.price && typeof lineItem.price !== "string"
      ? lineItem.price
      : null;
  return {
    eventId: event.id,
    eventType: event.type,
    sessionId: session.id,
    artworkId: session.metadata?.artwork_id ?? null,
    priceId: stripeId(lineItem?.price),
    productId: stripeId(price?.product),
  };
}

const webhookDependencies: WebhookDependencies = {
  verifySignature: verifyStripeWebhookSignature,
  retrieveEvent: retrieveStripeEvent,
  fulfillSession: fulfillCheckoutSession,
  scheduleCatalogAudit: (trigger) => {
    queueMicrotask(async () => {
      try {
        const report = await auditStripeCatalog();
        const artwork = trigger.artworkId
          ? report.artworks.find((item) => item.artworkId === trigger.artworkId)
          : undefined;
        logger.info(
          {
            ...trigger,
            eligibleDuplicatePriceIds: artwork?.deactivatablePriceIds ?? [],
            protectedDuplicatePrices: artwork?.blockedPrices ?? [],
          },
          "ARTCOVR re-audited Stripe catalog after Checkout session closure",
        );
      } catch (error) {
        logger.error(
          { err: error, ...trigger },
          "ARTCOVR Stripe catalog re-audit failed after Checkout session closure",
        );
      }
    });
  },
};

export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
    secret = process.env.STRIPE_WEBHOOK_SECRET,
    dependencies: WebhookDependencies = webhookDependencies,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a Buffer.");
    }

    if (!signature.trim()) {
      throw new Error("Stripe webhook signature is missing.");
    }

    dependencies.verifySignature(payload, signature, secret);

    let envelope: { id?: unknown };
    try {
      envelope = JSON.parse(payload.toString("utf8")) as { id?: unknown };
    } catch {
      throw new Error("Stripe webhook payload is invalid JSON.");
    }
    if (typeof envelope.id !== "string" || !envelope.id.startsWith("evt_")) {
      throw new Error("Stripe webhook event ID is invalid.");
    }

    const event = await dependencies.retrieveEvent(envelope.id);
    await dependencies.fulfillSession(event);

    const auditTrigger = checkoutCatalogAuditTrigger(event);
    if (auditTrigger) {
      dependencies.scheduleCatalogAudit(auditTrigger);
    }
  }
}