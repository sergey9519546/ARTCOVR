import { createInsertSchema } from "drizzle-zod";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const artcovrCreditPackPurchases = pgTable(
  "artcovr_credit_pack_purchases",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    stripeCustomerId: text("stripe_customer_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    credits: integer("credits").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull().default("reserved"),
    reservationExpiresAt: timestamp("reservation_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedCents: integer("refunded_cents").notNull().default(0),
  },
  (table) => ({
    ownerCreatedIdx: index("artcovr_credit_pack_purchases_owner_created_idx").on(
      table.clerkUserId,
      table.createdAt,
    ),
    checkoutSessionIdx: uniqueIndex(
      "artcovr_credit_pack_purchases_checkout_session_idx",
    ).on(table.stripeCheckoutSessionId),
    paymentIntentIdx: uniqueIndex(
      "artcovr_credit_pack_purchases_payment_intent_idx",
    )
      .on(table.stripePaymentIntentId)
      .where(sql`${table.stripePaymentIntentId} is not null`),
    idempotencyKeyIdx: uniqueIndex(
      "artcovr_credit_pack_purchases_idempotency_key_idx",
    ).on(table.idempotencyKey),
    creditsPositiveCheck: check(
      "artcovr_credit_pack_purchases_credits_positive",
      sql`${table.credits} > 0`,
    ),
    amountPositiveCheck: check(
      "artcovr_credit_pack_purchases_amount_positive",
      sql`${table.amountCents} > 0`,
    ),
    statusCheck: check(
      "artcovr_credit_pack_purchases_status_check",
      sql`${table.status} in ('reserved', 'paid', 'expired', 'refunded')`,
    ),
  }),
);

export const insertArtcovrCreditPackPurchaseSchema = createInsertSchema(
  artcovrCreditPackPurchases,
).omit({
  createdAt: true,
  paidAt: true,
  refundedAt: true,
});

export type InsertArtcovrCreditPackPurchase = z.infer<
  typeof insertArtcovrCreditPackPurchaseSchema
>;
export type ArtcovrCreditPackPurchase =
  typeof artcovrCreditPackPurchases.$inferSelect;
