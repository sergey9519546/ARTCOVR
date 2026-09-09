CREATE TABLE "artcovr_funnel_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"artwork_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "artcovr_funnel_events_event_created_idx" ON "artcovr_funnel_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "artcovr_funnel_events_artwork_created_idx" ON "artcovr_funnel_events" USING btree ("artwork_id","created_at");