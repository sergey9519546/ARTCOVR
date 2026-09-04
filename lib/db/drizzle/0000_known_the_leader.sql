CREATE TABLE "artcovr_credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"account_key" text NOT NULL,
	"order_id" text,
	"entry_type" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"source_id" text NOT NULL,
	"stripe_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artcovr_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"artwork_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"purchase_id" text,
	"parent_generation_id" text,
	"reference_upload_id" text,
	"phase" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"allowance_slot" integer,
	"prompt" text NOT NULL,
	"source_object_key" text NOT NULL,
	"preview_object_key" text,
	"clean_object_key" text,
	"provider_request_id" text,
	"provider_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artcovr_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artcovr_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text,
	"artwork_id" text NOT NULL,
	"artwork_slug" text NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"stripe_customer_id" text,
	"customer_email" text,
	"idempotency_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"sale_mode" text NOT NULL,
	"license_terms" text NOT NULL,
	"included_credits" integer NOT NULL,
	"selected_preview_id" text,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reservation_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"entitlement_expires_at" timestamp with time zone,
	"access_revoked_at" timestamp with time zone,
	"access_revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "artcovr_reference_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"artwork_id" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "artcovr_reference_uploads_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "artcovr_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_credit_ledger_source_id_idx" ON "artcovr_credit_ledger" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "artcovr_generations_owner_created_idx" ON "artcovr_generations" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "artcovr_generations_artwork_idx" ON "artcovr_generations" USING btree ("artwork_id");--> statement-breakpoint
CREATE INDEX "artcovr_generations_purchase_idx" ON "artcovr_generations" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "artcovr_generations_expiry_idx" ON "artcovr_generations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "artcovr_inquiries_owner_created_idx" ON "artcovr_inquiries" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_orders_idempotency_key_idx" ON "artcovr_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_orders_checkout_session_id_idx" ON "artcovr_orders" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_orders_exclusive_artwork_availability_idx" ON "artcovr_orders" USING btree ("artwork_id") WHERE "artcovr_orders"."sale_mode" = 'exclusive' and "artcovr_orders"."status" in ('reserved', 'paid');--> statement-breakpoint
CREATE INDEX "artcovr_orders_clerk_user_id_idx" ON "artcovr_orders" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "artcovr_orders_customer_email_idx" ON "artcovr_orders" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "artcovr_reference_uploads_owner_created_idx" ON "artcovr_reference_uploads" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "artcovr_reference_uploads_expiry_idx" ON "artcovr_reference_uploads" USING btree ("expires_at");