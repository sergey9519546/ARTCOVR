import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  jsonb,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const artcovrOrders = pgTable(
  "artcovr_orders",
  {
    id: text("id").primaryKey(),
    // Clerk subject used to scope every customer-owned order query.
    // Nullable keeps legacy orders inaccessible rather than guessing ownership.
    clerkUserId: text("clerk_user_id"),
    artworkId: text("artwork_id").notNull(),
    artworkSlug: text("artwork_slug").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
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
    reservationExpiresAt: timestamp("reservation_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    entitlementExpiresAt: timestamp("entitlement_expires_at", { withTimezone: true }),
    accessRevokedAt: timestamp("access_revoked_at", { withTimezone: true }),
    accessRevocationReason: text("access_revocation_reason"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (table) => ({
    idempotencyKeyIdx: uniqueIndex("artcovr_orders_idempotency_key_idx").on(
      table.idempotencyKey,
    ),
    checkoutSessionIdx: uniqueIndex(
      "artcovr_orders_checkout_session_id_idx",
    ).on(table.stripeCheckoutSessionId),
    exclusiveArtworkAvailabilityIdx: uniqueIndex(
      "artcovr_orders_exclusive_artwork_availability_idx",
    )
      .on(table.artworkId)
      .where(
        sql`${table.saleMode} = 'exclusive' and ${table.status} in ('reserved', 'paid')`,
      ),
    clerkUserIdx: index("artcovr_orders_clerk_user_id_idx").on(
      table.clerkUserId,
    ),
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
  refundedAt: true,
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
// Customer media is private. Routes expose opaque IDs after checking Clerk ownership.
export const artcovrReferenceUploads = pgTable("artcovr_reference_uploads", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  artworkId: text("artwork_id").notNull(),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
}, (table) => ({
  ownerIdx: index("artcovr_reference_uploads_owner_idx").on(table.clerkUserId),
  objectIdx: uniqueIndex("artcovr_reference_uploads_object_idx").on(table.objectKey),
}));

export const artcovrGenerations = pgTable("artcovr_generations", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  artworkId: text("artwork_id").notNull(),
  purchaseId: text("purchase_id"),
  parentGenerationId: text("parent_generation_id"),
  referenceUploadId: text("reference_upload_id"),
  phase: text("phase").notNull(),
  status: text("status").notNull().default("queued"),
  allowanceSlot: integer("allowance_slot"),
  prompt: text("prompt").notNull(),
  sourceObjectKey: text("source_object_key").notNull(),
  cleanObjectKey: text("clean_object_key"),
  previewObjectKey: text("preview_object_key"),
  providerRequestId: text("provider_request_id"),
  providerUsage: jsonb("provider_usage").$type<Record<string, unknown>>(),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => ({
  ownerCreatedIdx: index("artcovr_generations_owner_created_idx").on(table.clerkUserId, table.createdAt),
  purchaseIdx: index("artcovr_generations_purchase_idx").on(table.purchaseId),
}));

export const artcovrInquiries = pgTable("artcovr_inquiries", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerCreatedIdx: index("artcovr_inquiries_owner_created_idx").on(table.clerkUserId, table.createdAt),
}));
