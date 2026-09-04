import { fulfillCheckoutSession } from "./commerceService";
import { retrieveStripeEvent } from "./stripeClient";
import { verifyStripeWebhookSignature } from "./webhookSecurity";

export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
    secret = process.env.STRIPE_WEBHOOK_SECRET,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a Buffer.");
    }

    if (!signature.trim()) {
      throw new Error("Stripe webhook signature is missing.");
    }

    verifyStripeWebhookSignature(payload, signature, secret);

    let envelope: { id?: unknown };
    try {
      envelope = JSON.parse(payload.toString("utf8")) as { id?: unknown };
    } catch {
      throw new Error("Stripe webhook payload is invalid JSON.");
    }
    if (typeof envelope.id !== "string" || !envelope.id.startsWith("evt_")) {
      throw new Error("Stripe webhook event ID is invalid.");
    }

    const event = await retrieveStripeEvent(envelope.id);
    await fulfillCheckoutSession(event);
  }
}