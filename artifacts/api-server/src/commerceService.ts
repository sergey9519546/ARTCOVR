import type Stripe from "stripe";
import { and, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrOrders,
  artcovrWebhookEvents,
  db,
} from "@workspace/db";
import { commerceConfig, licenseTermsForSaleMode } from "./commerce-config";
import { logger } from "./lib/logger";
import { expectedStripeLivemode, refundPaymentIntent } from "./stripeClient";

export const checkoutReservationMs = 31 * 60_000;
const activeExclusiveStatuses = ["reserved", "paid"] as const;
const stripeWebhookModeMismatchDiagnosis = "stripe_webhook_mode_mismatch";

type FulfillmentDependencies = {
  refundPaymentIntent: typeof refundPaymentIntent;
  expectedLivemode?: boolean;
};

const fulfillmentDependencies: FulfillmentDependencies = {
  refundPaymentIntent,
};

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
  dependencies: FulfillmentDependencies = fulfillmentDependencies,
): Promise<void> {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const expectedLivemode =
    dependencies.expectedLivemode ?? expectedStripeLivemode();
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

    const modeMismatch =
      event.livemode !== expectedLivemode ||
      session.livemode !== expectedLivemode ||
      event.livemode !== session.livemode;
    if (modeMismatch) {
      await tx
        .update(artcovrWebhookEvents)
        .set({ status: "rejected", processedAt: new Date() })
        .where(eq(artcovrWebhookEvents.id, event.id));

      logger.error(
        {
          diagnosis: stripeWebhookModeMismatchDiagnosis,
          orderId: order.id,
          stripeCheckoutSessionId: session.id,
          stripeEventId: event.id,
          expectedLivemode,
          eventLivemode: event.livemode,
          sessionLivemode: session.livemode,
        },
        "ARTCOVR rejected Stripe webhook from the wrong account mode",
      );
      return;
    }

    const sessionCustomerId = stripeId(session.customer);
    const email = customerEmail(session);
    const accountKey =
      order.clerkUserId ||
      sessionCustomerId ||
      email ||
      `stripe-session:${session.id}`;

    const [existingExclusiveOrder] =
      paid && order.saleMode === "exclusive" && order.status !== "paid"
        ? await tx
            .select({
              id: artcovrOrders.id,
              status: artcovrOrders.status,
            })
            .from(artcovrOrders)
            .where(
              and(
                eq(artcovrOrders.artworkId, order.artworkId),
                eq(artcovrOrders.saleMode, "exclusive"),
                inArray(artcovrOrders.status, activeExclusiveStatuses),
                ne(artcovrOrders.id, order.id),
              ),
            )
            .limit(1)
        : [];

    if (paid && order.status !== "paid") {
      const paymentIntentId = stripeId(session.payment_intent);

      if (existingExclusiveOrder?.status === "reserved") {
        await tx
          .update(artcovrOrders)
          .set({ status: "expired" })
          .where(
            and(
              eq(artcovrOrders.id, existingExclusiveOrder.id),
              eq(artcovrOrders.status, "reserved"),
            ),
          );
      }

      if (existingExclusiveOrder?.status === "paid") {
        if (!paymentIntentId) {
          throw new Error(
            `Stripe session ${session.id} has no payment intent to refund`,
          );
        }

        const refund = await dependencies.refundPaymentIntent(
          {
            paymentIntentId,
            orderId: order.id,
          },
          `exclusive-conflict:${order.id}`,
        );

        await tx
          .update(artcovrOrders)
          .set({
            status: "refunded_conflict",
            stripePaymentIntentId: paymentIntentId,
            stripeCustomerId: sessionCustomerId,
            customerEmail: email,
            stripeRefundId: refund.id,
            paidAt: new Date(),
            refundedAt: new Date(),
          })
          .where(eq(artcovrOrders.id, order.id));

        logger.warn(
          {
            orderId: order.id,
            artworkId: order.artworkId,
            existingOrderId: existingExclusiveOrder.id,
            refundId: refund.id,
          },
          "ARTCOVR automatically refunded conflicting exclusive payment",
        );
      } else {
      await tx
        .update(artcovrOrders)
        .set({
          status: "paid",
          stripePaymentIntentId: paymentIntentId,
          stripeCustomerId: sessionCustomerId,
          customerEmail: email,
          paidAt: new Date(),
          entitlementExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
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
    }

    await tx
      .update(artcovrWebhookEvents)
      .set({ status: paid ? "processed" : "received", processedAt: new Date() })
      .where(eq(artcovrWebhookEvents.id, event.id));
  });
}

export async function expireStaleExclusiveReservations(
  artworkId: string,
  now = new Date(),
) {
  const legacyCutoff = new Date(now.getTime() - checkoutReservationMs);
  return db
    .update(artcovrOrders)
    .set({ status: "expired" })
    .where(
      and(
        eq(artcovrOrders.artworkId, artworkId),
        eq(artcovrOrders.saleMode, "exclusive"),
        eq(artcovrOrders.status, "reserved"),
        or(
          lte(artcovrOrders.reservationExpiresAt, now),
          and(
            isNull(artcovrOrders.reservationExpiresAt),
            lte(artcovrOrders.createdAt, legacyCutoff),
          ),
        ),
      ),
    )
    .returning({ id: artcovrOrders.id });
}

export async function claimGuestPurchases(
  clerkUserId: string,
  verifiedEmails: readonly string[],
) {
  const emails = [...new Set(
    verifiedEmails
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )];

  if (emails.length === 0) {
    return { claimedOrderIds: [], claimedCredits: 0 };
  }

  return db.transaction(async (tx) => {
    const [firstEmail, ...remainingEmails] = emails;
    const emailCondition = remainingEmails.length
      ? inArray(artcovrOrders.customerEmail, emails)
      : eq(artcovrOrders.customerEmail, firstEmail);
    const claimed = await tx
      .update(artcovrOrders)
      .set({ clerkUserId })
      .where(
        and(
          eq(artcovrOrders.status, "paid"),
          isNull(artcovrOrders.clerkUserId),
          emailCondition,
        ),
      )
      .returning({
        id: artcovrOrders.id,
        includedCredits: artcovrOrders.includedCredits,
      });

    if (claimed.length === 0) {
      return { claimedOrderIds: [], claimedCredits: 0 };
    }

    const orderIds = claimed.map((order) => order.id);
    await tx
      .update(artcovrCreditLedger)
      .set({ accountKey: clerkUserId })
      .where(
        and(
          inArray(artcovrCreditLedger.orderId, orderIds),
          eq(artcovrCreditLedger.entryType, "grant"),
        ),
      );

    return {
      claimedOrderIds: orderIds,
      claimedCredits: claimed.reduce(
        (total, order) => total + order.includedCredits,
        0,
      ),
    };
  });
}

export function createOrderValues(input: {
  id: string;
  clerkUserId: string | null;
  customerEmail?: string | null;
  artworkId: string;
  artworkSlug: string;
  amountCents: number;
  saleMode: "exclusive" | "repeatable";
  selectedPreviewId?: string;
  idempotencyKey: string;
  reservationExpiresAt: Date;
}) {
  return {
    id: input.id,
    clerkUserId: input.clerkUserId,
    customerEmail: input.customerEmail,
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
    reservationExpiresAt: input.reservationExpiresAt,
  } as const;
}