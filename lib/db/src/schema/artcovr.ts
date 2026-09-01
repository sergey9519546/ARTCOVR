import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const artcovrOrders = pgTable(
  "artcovr_orders",
  {
    id: text("id").primaryKey(),
    artworkId: text("artwork_id").notNull(),
    artworkSlug: text("artwork_slug").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeCustomerId: text("stripe_customer_id"),
    customerEmail: text("customer_email"),
    idempotencyKey: text("idempotency_key").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    saleMode: text("sale_mode").notNull(),
    licenseTerms: text("license_terms").notNull(),
    includedCredits: integer("included_credits").notNull(),
    selectedPreviewId: text("selected_preview_id"),
    status: text("status").notNull().default("reserved"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => ({
    idempotencyKeyIdx: uniqueIndex("artcovr_orders_idempotency_key_idx").on(
      table.idempotencyKey,
    ),
    checkoutSessionIdx: uniqueIndex(
      "artcovr_orders_checkout_session_id_idx",
    ).on(table.stripeCheckoutSessionId),
  }),
);

export const artcovrCreditLedger = pgTable(
  "artcovr_credit_ledger",
  {
    id: text("id").primaryKey(),
    accountKey: text("account_key").notNull(),
    orderId: text("order_id"),
    entryType: text("entry_type").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    stripeEventId: text("stripe_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceIdx: uniqueIndex("artcovr_credit_ledger_source_id_idx").on(
      table.sourceId,
    ),
  }),
);

export const artcovrWebhookEvents = pgTable("artcovr_webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull().default("received"),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const insertArtcovrOrderSchema = createInsertSchema(artcovrOrders).omit({
  createdAt: true,
  paidAt: true,
});
export type InsertArtcovrOrder = z.infer<typeof insertArtcovrOrderSchema>;
export type ArtcovrOrder = typeof artcovrOrders.$inferSelect;

export const insertArtcovrCreditLedgerSchema = createInsertSchema(
  artcovrCreditLedger,
).omit({ createdAt: true });
export type InsertArtcovrCreditLedger = z.infer<
  typeof insertArtcovrCreditLedgerSchema
>;
export type ArtcovrCreditLedger = typeof artcovrCreditLedger.$inferSelect;

export const insertArtcovrWebhookEventSchema = createInsertSchema(
  artcovrWebhookEvents,
).omit({ receivedAt: true, processedAt: true });
export type InsertArtcovrWebhookEvent = z.infer<
  typeof insertArtcovrWebhookEventSchema
>;
export type ArtcovrWebhookEvent = typeof artcovrWebhookEvents.$inferSelect;