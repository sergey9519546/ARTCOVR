import type Stripe from "stripe";
import { and, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrOrders,
  artcovrRefundEvents,
  artcovrWebhookEvents,
  db,
} from "@workspace/db";
import { commerceConfig, licenseTermsForSaleMode } from "./commerce-config";
import { logger } from "./lib/logger";
import { expectedStripeLivemode, refundPaymentIntent } from "./stripeClient";
import { lockPurchaseCredits, revokePurchaseCreditsInTransaction } from "./creditService";

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

function stripeDate(value: unknown, fallback = new Date()) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return new Date(value * 1000);
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
  if (event.type === "checkout.session.expired") {
    await expireCheckoutSession(event, dependencies.expectedLivemode ?? expectedStripeLivemode());
    return;
  }
  if (event.type === "charge.refunded") {
    await revokeRefundedCharge(event, dependencies.expectedLivemode ?? expectedStripeLivemode());
    return;
  }
  if (event.type === "payment_intent.payment_failed") {
    await expireFailedPaymentIntent(
      event,
      dependencies.expectedLivemode ?? expectedStripeLivemode(),
    );
    return;
  }
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

    let [order] = await tx
      .select()
      .from(artcovrOrders)
      .where(eq(artcovrOrders.stripeCheckoutSessionId, session.id))
      .limit(1);

    if (!order) {
      throw new Error(`No ARTCOVR order found for Stripe session ${session.id}`);
    }
    await lockPurchaseCredits(tx, order.id);
    [order] = await tx.select().from(artcovrOrders).where(eq(artcovrOrders.id, order.id)).limit(1);
    if (!order) throw new Error("Checkout purchase disappeared during fulfillment");

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

    if (order.status === "refunded" || order.accessRevokedAt) {
      await tx.update(artcovrWebhookEvents).set({ status: "processed", processedAt: new Date() })
        .where(eq(artcovrWebhookEvents.id, event.id));
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
            clerkUserId: order.clerkUserId ?? `guest:${order.id}`,
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

async function expireCheckoutSession(event: Stripe.Event, expectedLivemode: boolean) {
  const session = event.data.object as Stripe.Checkout.Session;

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
      throw new Error(`No ARTCOVR order found for expired Stripe session ${session.id}`);
    }

    const modeMismatch =
      event.livemode !== expectedLivemode ||
      session.livemode !== expectedLivemode;
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
        "ARTCOVR rejected expired Stripe webhook from the wrong account mode",
      );
      return;
    }

    await tx
      .update(artcovrOrders)
      .set({ status: "expired" })
      .where(
        and(
          eq(artcovrOrders.id, order.id),
          eq(artcovrOrders.status, "reserved"),
        ),
      );

    await tx
      .update(artcovrWebhookEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(artcovrWebhookEvents.id, event.id));
  });
}

async function revokeRefundedCharge(event: Stripe.Event, expectedLivemode: boolean) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId) return;

  await db.transaction(async (tx) => {
    const [received] = await tx
      .insert(artcovrWebhookEvents)
      .values({ id: event.id, type: event.type, status: "received" })
      .onConflictDoNothing()
      .returning({ id: artcovrWebhookEvents.id });
    if (!received) return;

    if (event.livemode !== expectedLivemode || charge.livemode !== expectedLivemode) {
      await tx.update(artcovrWebhookEvents).set({ status: "rejected", processedAt: new Date() })
        .where(eq(artcovrWebhookEvents.id, event.id));
      logger.error({ diagnosis: stripeWebhookModeMismatchDiagnosis, stripeEventId: event.id },
        "ARTCOVR rejected refund webhook from the wrong account mode");
      return;
    }
    let [order] = await tx
      .select()
      .from(artcovrOrders)
      .where(eq(artcovrOrders.stripePaymentIntentId, paymentIntentId))
      .limit(1);
    if (!order) {
      await tx
        .update(artcovrWebhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(artcovrWebhookEvents.id, event.id));
      logger.warn(
        { paymentIntentId, stripeEventId: event.id },
        "ARTCOVR ignored a refund for a payment without an order",
      );
      return;
    }

    await lockPurchaseCredits(tx, order.id);
    [order] = await tx.select().from(artcovrOrders).where(eq(artcovrOrders.id, order.id)).limit(1);
    if (!order) throw new Error("Refund purchase disappeared during fulfillment");

    const existingRefunds = await tx
      .select({
        id: artcovrRefundEvents.id,
        stripeRefundId: artcovrRefundEvents.stripeRefundId,
        amountCents: artcovrRefundEvents.amountCents,
      })
      .from(artcovrRefundEvents)
      .where(eq(artcovrRefundEvents.orderId, order.id));
    const knownRefundIds = new Set(
      existingRefunds
        .map((refund) => refund.stripeRefundId)
        .filter((id): id is string => Boolean(id)),
    );
    let recordedRefundCents = existingRefunds.reduce(
      (total, refund) => total + refund.amountCents,
      0,
    );
    let latestRefundId: string | null = null;
    const refundObjects = charge.refunds?.data ?? [];

    for (const refund of refundObjects) {
      const refundId = refund.id;
      const amountCents = Number(refund.amount ?? 0);
      if (knownRefundIds.has(refundId) || amountCents <= 0) continue;
      const [inserted] = await tx
        .insert(artcovrRefundEvents)
        .values({
          id: `refund:${refundId}`,
          orderId: order.id,
          stripeRefundId: refundId,
          stripeEventId: event.id,
          amountCents,
          refundedAt: stripeDate(refund.created),
        })
        .onConflictDoNothing()
        .returning({ id: artcovrRefundEvents.id });
      if (inserted) {
        recordedRefundCents += amountCents;
        latestRefundId = refundId;
      }
    }

    const providerRefundedCents = Math.max(
      Number(charge.amount_refunded ?? 0),
      recordedRefundCents,
    );
    const missingRefundCents = providerRefundedCents - recordedRefundCents;
    if (missingRefundCents > 0) {
      await tx
        .insert(artcovrRefundEvents)
        .values({
          id: `refund-event:${event.id}`,
          orderId: order.id,
          stripeEventId: event.id,
          amountCents: missingRefundCents,
          refundedAt: stripeDate(event.created),
        })
        .onConflictDoNothing();
      recordedRefundCents += missingRefundCents;
    }

    const refundId =
      latestRefundId ?? charge.refunds?.data[0]?.id ?? order.stripeRefundId;
    const refundAt = new Date();
    const refundTotals = {
      refundedCents: recordedRefundCents,
      ...(refundId ? { stripeRefundId: refundId } : {}),
    };

    if (!charge.refunded) {
      await tx
        .update(artcovrOrders)
        .set(refundTotals)
        .where(eq(artcovrOrders.id, order.id));
      await tx
        .update(artcovrWebhookEvents)
        .set({ status: "processed", processedAt: refundAt })
        .where(eq(artcovrWebhookEvents.id, event.id));
      return;
    }

    await tx
      .update(artcovrOrders)
      .set({
        status: "refunded",
        ...refundTotals,
        refundedAt: refundAt,
        accessRevokedAt: new Date(),
        accessRevocationReason: "stripe_refund",
      })
      .where(eq(artcovrOrders.id, order.id));

    await revokePurchaseCreditsInTransaction(tx, {
        userId: order.clerkUserId ?? `guest:${order.id}`,
        purchaseId: order.id,
        reason: "Purchase refunded",
        sourceId: `purchase:${order.id}:refund`,
    });

    await tx
      .update(artcovrWebhookEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(artcovrWebhookEvents.id, event.id));
  });
}

async function expireFailedPaymentIntent(
  event: Stripe.Event,
  expectedLivemode: boolean,
) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;

  await db.transaction(async (tx) => {
    const [received] = await tx
      .insert(artcovrWebhookEvents)
      .values({ id: event.id, type: event.type, status: "received" })
      .onConflictDoNothing()
      .returning({ id: artcovrWebhookEvents.id });
    if (!received) return;

    if (event.livemode !== expectedLivemode || paymentIntent.livemode !== expectedLivemode) {
      await tx
        .update(artcovrWebhookEvents)
        .set({ status: "rejected", processedAt: new Date() })
        .where(eq(artcovrWebhookEvents.id, event.id));
      logger.error(
        { diagnosis: stripeWebhookModeMismatchDiagnosis, stripeEventId: event.id },
        "ARTCOVR rejected failed Stripe payment from the wrong account mode",
      );
      return;
    }

    const [order] = await tx
      .select()
      .from(artcovrOrders)
      .where(eq(artcovrOrders.stripePaymentIntentId, paymentIntent.id))
      .limit(1);

    if (order && (order.status === "reserved" || order.status === "paid")) {
      await lockPurchaseCredits(tx, order.id);
      await tx
        .update(artcovrOrders)
        .set({
          status: "expired",
          accessRevokedAt: order.status === "paid" ? new Date() : null,
          accessRevocationReason: order.status === "paid" ? "stripe_payment_failed" : null,
        })
        .where(eq(artcovrOrders.id, order.id));

      if (order.status === "paid") {
        await revokePurchaseCreditsInTransaction(tx, {
          userId: order.clerkUserId ?? `guest:${order.id}`,
          purchaseId: order.id,
          reason: "Payment failed",
          sourceId: `purchase:${order.id}:payment-failed`,
        });
      }
    }

    await tx
      .update(artcovrWebhookEvents)
      .set({ status: "processed", processedAt: new Date() })
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
      .set({ clerkUserId, accountKey: clerkUserId })
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
  salesChannel?: "storefront" | "agent_mpp";
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
    salesChannel: input.salesChannel ?? "storefront",
    licenseTerms: licenseTermsForSaleMode(input.saleMode),
    includedCredits: commerceConfig.includedCreditsPerCover,
    selectedPreviewId: input.selectedPreviewId,
    status: "reserved",
    reservationExpiresAt: input.reservationExpiresAt,
  } as const;
}

export type AgentPaymentFulfillment = {
  orderId: string;
  deliver: boolean;
  status: "paid" | "refunded_conflict" | "refunded" | "expired";
};

export async function fulfillAgentPayment(
  input: {
    paymentIntentId: string;
    artworkId: string;
    artworkSlug: string;
    amountCents: number;
    saleMode: "exclusive" | "repeatable";
    currency: string;
  },
  dependencies: FulfillmentDependencies = fulfillmentDependencies,
): Promise<AgentPaymentFulfillment> {
  if (!/^pi_[A-Za-z0-9_]+$/.test(input.paymentIntentId)) {
    throw new Error("Agent payment did not return a valid Stripe PaymentIntent.");
  }
  if (
    input.currency !== commerceConfig.currency ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 50
  ) {
    throw new Error("Agent payment amount or currency is invalid.");
  }

  const orderId = `order_agent_${input.paymentIntentId}`;
  const idempotencyKey = `agent_mpp:${input.paymentIntentId}`;
  const now = new Date();
  await expireStaleExclusiveReservations(input.artworkId, now);

  return db.transaction(async (tx) => {
    let [existing] = await tx
      .select()
      .from(artcovrOrders)
      .where(eq(artcovrOrders.idempotencyKey, idempotencyKey))
      .limit(1);

    if (!existing) {
      [existing] = await tx
        .select()
        .from(artcovrOrders)
        .where(eq(artcovrOrders.stripePaymentIntentId, input.paymentIntentId))
        .limit(1);
    }

    if (existing) {
      return {
        orderId: existing.id,
        deliver: existing.status === "paid",
        status: existing.status as AgentPaymentFulfillment["status"],
      };
    }

    const [activeExclusiveOrder] =
      input.saleMode === "exclusive"
        ? await tx
            .select({
              id: artcovrOrders.id,
              status: artcovrOrders.status,
            })
            .from(artcovrOrders)
            .where(
              and(
                eq(artcovrOrders.artworkId, input.artworkId),
                eq(artcovrOrders.saleMode, "exclusive"),
                inArray(artcovrOrders.status, activeExclusiveStatuses),
              ),
            )
            .limit(1)
        : [];

    if (activeExclusiveOrder?.status === "reserved") {
      await tx
        .update(artcovrOrders)
        .set({ status: "expired" })
        .where(
          and(
            eq(artcovrOrders.id, activeExclusiveOrder.id),
            eq(artcovrOrders.status, "reserved"),
          ),
        );
    }

    if (activeExclusiveOrder?.status === "paid") {
      const refund = await dependencies.refundPaymentIntent(
        {
          paymentIntentId: input.paymentIntentId,
          orderId,
        },
        `agent-exclusive-conflict:${input.paymentIntentId}`,
      );
      const [conflictOrder] = await tx
        .insert(artcovrOrders)
        .values({
          ...createOrderValues({
            id: orderId,
            clerkUserId: null,
            artworkId: input.artworkId,
            artworkSlug: input.artworkSlug,
            amountCents: input.amountCents,
            saleMode: input.saleMode,
            idempotencyKey,
            reservationExpiresAt: now,
            salesChannel: "agent_mpp",
          }),
          status: "refunded_conflict",
          stripePaymentIntentId: input.paymentIntentId,
          paidAt: now,
          refundedAt: now,
          stripeRefundId: refund.id,
        })
        .onConflictDoNothing()
        .returning({ id: artcovrOrders.id });

      if (conflictOrder) {
        logger.warn(
          {
            orderId,
            artworkId: input.artworkId,
            existingOrderId: activeExclusiveOrder.id,
            refundId: refund.id,
          },
          "ARTCOVR automatically refunded conflicting agent payment",
        );
      }

      return {
        orderId,
        deliver: false,
        status: "refunded_conflict",
      };
    }

    const [order] = await tx
      .insert(artcovrOrders)
      .values({
        ...createOrderValues({
          id: orderId,
          clerkUserId: null,
          artworkId: input.artworkId,
          artworkSlug: input.artworkSlug,
          amountCents: input.amountCents,
          saleMode: input.saleMode,
          idempotencyKey,
          reservationExpiresAt: now,
          salesChannel: "agent_mpp",
        }),
        status: "paid",
        stripePaymentIntentId: input.paymentIntentId,
        paidAt: now,
        entitlementExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      })
      .onConflictDoNothing()
      .returning();

    if (!order) {
      const [retryOrder] = await tx
        .select()
        .from(artcovrOrders)
        .where(eq(artcovrOrders.idempotencyKey, idempotencyKey))
        .limit(1);
      if (retryOrder) {
        return {
          orderId: retryOrder.id,
          deliver: retryOrder.status === "paid",
          status: retryOrder.status as AgentPaymentFulfillment["status"],
        };
      }

      const [conflict] = await tx
        .select({ id: artcovrOrders.id, status: artcovrOrders.status })
        .from(artcovrOrders)
        .where(
          and(
            eq(artcovrOrders.artworkId, input.artworkId),
            eq(artcovrOrders.saleMode, "exclusive"),
            eq(artcovrOrders.status, "paid"),
          ),
        )
        .limit(1);
      if (conflict) {
        const refund = await dependencies.refundPaymentIntent(
          { paymentIntentId: input.paymentIntentId, orderId },
          `agent-exclusive-conflict:${input.paymentIntentId}`,
        );
        await tx
          .insert(artcovrOrders)
          .values({
            ...createOrderValues({
              id: orderId,
              clerkUserId: null,
              artworkId: input.artworkId,
              artworkSlug: input.artworkSlug,
              amountCents: input.amountCents,
              saleMode: input.saleMode,
              idempotencyKey,
              reservationExpiresAt: now,
              salesChannel: "agent_mpp",
            }),
            status: "refunded_conflict",
            stripePaymentIntentId: input.paymentIntentId,
            paidAt: now,
            refundedAt: now,
            stripeRefundId: refund.id,
          })
          .onConflictDoNothing();
        return { orderId, deliver: false, status: "refunded_conflict" };
      }
      throw new Error("Agent payment could not create an ARTCOVR order.");
    }

    await tx
      .insert(artcovrCreditLedger)
      .values({
        id: `credit_${crypto.randomUUID()}`,
        clerkUserId: `guest:${order.id}`,
        accountKey: `guest:${order.id}`,
        orderId: order.id,
        entryType: "grant",
        amount: order.includedCredits,
        reason: "Agent cover purchase credit grant",
        sourceId: `agent_mpp:${input.paymentIntentId}`,
      })
      .onConflictDoNothing();

    logger.info(
      {
        orderId: order.id,
        artworkId: order.artworkId,
        channel: "agent_mpp",
        includedCredits: order.includedCredits,
      },
      "ARTCOVR agent purchase fulfilled",
    );

    return { orderId: order.id, deliver: true, status: "paid" };
  });
}
