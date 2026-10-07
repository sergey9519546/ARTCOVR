CREATE TABLE "artcovr_artwork_order_preferences" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"preference" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artcovr_artwork_order_preferences_preference_check" CHECK ("artcovr_artwork_order_preferences"."preference" in ('rotate', 'shuffle'))
);
