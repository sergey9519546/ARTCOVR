CREATE TABLE "artcovr_credit_pack_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"stripe_customer_id" text,
	"idempotency_key" text NOT NULL,
	"credits" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reservation_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "artcovr_credit_pack_purchases_credits_positive" CHECK ("artcovr_credit_pack_purchases"."credits" > 0),
	CONSTRAINT "artcovr_credit_pack_purchases_amount_positive" CHECK ("artcovr_credit_pack_purchases"."amount_cents" > 0),
	CONSTRAINT "artcovr_credit_pack_purchases_status_check" CHECK ("artcovr_credit_pack_purchases"."status" in ('reserved', 'paid', 'expired', 'refunded'))
);
--> statement-breakpoint
ALTER TABLE "artcovr_generations" ADD COLUMN "credit_source_purchase_id" text;--> statement-breakpoint
CREATE INDEX "artcovr_credit_pack_purchases_owner_created_idx" ON "artcovr_credit_pack_purchases" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_credit_pack_purchases_checkout_session_idx" ON "artcovr_credit_pack_purchases" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_credit_pack_purchases_payment_intent_idx" ON "artcovr_credit_pack_purchases" USING btree ("stripe_payment_intent_id") WHERE "artcovr_credit_pack_purchases"."stripe_payment_intent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_credit_pack_purchases_idempotency_key_idx" ON "artcovr_credit_pack_purchases" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "artcovr_generations_credit_source_idx" ON "artcovr_generations" USING btree ("credit_source_purchase_id");