import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrOrders,
  artcovrWebhookEvents,
  db,
} from "@workspace/db";
import { commerceConfig, licenseTermsForSaleMode } from "./commerce-config";
import { logger } from "./lib/logger";

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

function customerEmail(session: Stripe.Checkout.Session) {
  return (
    session.customer_details?.email?.trim().toLowerCase() ||
    session.customer_email?.trim().toLowerCase() ||
    null
  );
}

export async function fulfillCheckoutSession(
  event: Stripe.Event,
): Promise<void> {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const paid =
    event.type === "checkout.session.async_payment_succeeded" ||
    session.payment_status === "paid";

  await db.transaction(async (tx) => {
    const [received] = await tx
      .insert(artcovrWebhookEvents)
      .values({ id: event.id, type: event.type, status: "received" })
      .onConflictDoNothing()
      .returning({ id: artcovrWebhookEvents.id });

    if (!received) return;

    const [order] = await tx
      .select()
      .from(artcovrOrders)
      .where(eq(artcovrOrders.stripeCheckoutSessionId, session.id))
      .limit(1);

    if (!order) {
      throw new Error(`No ARTCOVR order found for Stripe session ${session.id}`);
    }

    const sessionCustomerId = stripeId(session.customer);
    const email = customerEmail(session);
    const accountKey =
      order.clerkUserId ||
      sessionCustomerId ||
      email ||
      `stripe-session:${session.id}`;

    if (paid && order.status !== "paid") {
      await tx
        .update(artcovrOrders)
        .set({
          status: "paid",
          stripePaymentIntentId: stripeId(session.payment_intent),
          stripeCustomerId: sessionCustomerId,
          customerEmail: email,
          paidAt: new Date(),
        })
        .where(eq(artcovrOrders.id, order.id));

      await tx
        .insert(artcovrCreditLedger)
        .values({
          id: `credit_${crypto.randomUUID()}`,
          accountKey,
          orderId: order.id,
          entryType: "grant",
          amount: order.includedCredits,
          reason: "Cover purchase credit grant",
          sourceId: `checkout:${session.id}`,
          stripeEventId: event.id,
        })
        .onConflictDoNothing();

      logger.info(
        {
          orderId: order.id,
          artworkId: order.artworkId,
          includedCredits: order.includedCredits,
        },
        "ARTCOVR purchase fulfilled",
      );
    }

    await tx
      .update(artcovrWebhookEvents)
      .set({ status: paid ? "processed" : "received", processedAt: new Date() })
      .where(eq(artcovrWebhookEvents.id, event.id));
  });
}

export function createOrderValues(input: {
  id: string;
  clerkUserId: string;
  artworkId: string;
  artworkSlug: string;
  amountCents: number;
  saleMode: "exclusive" | "repeatable";
  selectedPreviewId?: string;
  idempotencyKey: string;
}) {
  return {
    id: input.id,
    clerkUserId: input.clerkUserId,
    artworkId: input.artworkId,
    artworkSlug: input.artworkSlug,
    idempotencyKey: input.idempotencyKey,
    amountCents: input.amountCents,
    currency: commerceConfig.currency,
    saleMode: input.saleMode,
    licenseTerms: licenseTermsForSaleMode(input.saleMode),
    includedCredits: commerceConfig.includedCreditsPerCover,
    selectedPreviewId: input.selectedPreviewId,
    status: "reserved",
  } as const;
}