CREATE TABLE "artcovr_refund_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"stripe_refund_id" text,
	"stripe_event_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artcovr_funnel_events" ADD COLUMN "order_id" text;--> statement-breakpoint
ALTER TABLE "artcovr_funnel_events" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "artcovr_orders" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "artcovr_refund_events_order_refunded_idx" ON "artcovr_refund_events" USING btree ("order_id","refunded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_refund_events_stripe_refund_idx" ON "artcovr_refund_events" USING btree ("stripe_refund_id") WHERE "artcovr_refund_events"."stripe_refund_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "artcovr_funnel_events_dedupe_key_idx" ON "artcovr_funnel_events" USING btree ("dedupe_key") WHERE "artcovr_funnel_events"."dedupe_key" is not null;