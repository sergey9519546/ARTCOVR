import { fulfillCheckoutSession } from "./commerceService";
import { retrieveStripeEvent } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a Buffer.");
    }

    if (!signature.trim()) {
      throw new Error("Stripe webhook signature is missing.");
    }
    const envelope = JSON.parse(payload.toString("utf8")) as { id?: unknown };
    if (typeof envelope.id !== "string" || !envelope.id.startsWith("evt_")) {
      throw new Error("Stripe webhook event ID is invalid.");
    }

    const event = await retrieveStripeEvent(envelope.id);
    await fulfillCheckoutSession(event);
  }
}