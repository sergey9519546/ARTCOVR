import { fulfillCheckoutSession } from "./commerceService";
import {
  getStripeSync,
  getStripeWebhookSecret,
  getUncachableStripeClient,
} from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a Buffer.");
    }

    const webhookSecret = await getStripeWebhookSecret();
    const stripe = await getUncachableStripeClient();
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
    await fulfillCheckoutSession(event);
  }
}