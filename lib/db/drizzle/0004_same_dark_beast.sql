ALTER TABLE "artcovr_orders" ADD COLUMN "sales_channel" text DEFAULT 'storefront' NOT NULL;--> statement-breakpoint
CREATE INDEX "artcovr_orders_sales_channel_idx" ON "artcovr_orders" USING btree ("sales_channel");--> statement-breakpoint
ALTER TABLE "artcovr_orders" ADD CONSTRAINT "artcovr_orders_sales_channel_check" CHECK ("artcovr_orders"."sales_channel" in ('storefront', 'agent_mpp'));