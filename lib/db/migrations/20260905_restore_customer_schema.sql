-- Additive repair for the customer API schema omitted during workspace sync.
-- Apply to the Replit database only through the owner-approved deployment process.
BEGIN;

CREATE TABLE IF NOT EXISTS "artcovr_generations" (
  "id" text NOT NULL,
  "clerk_user_id" text NOT NULL,
  "artwork_id" text NOT NULL,
  "purchase_id" text,
  "parent_generation_id" text,
  "reference_upload_id" text,
  "phase" text NOT NULL,
  "status" text DEFAULT 'queued'::text NOT NULL,
  "allowance_slot" integer,
  "prompt" text NOT NULL,
  "source_object_key" text NOT NULL,
  "clean_object_key" text,
  "preview_object_key" text,
  "provider_request_id" text,
  "provider_usage" jsonb,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS artcovr_generations_owner_created_idx ON public.artcovr_generations USING btree (clerk_user_id, created_at);
CREATE INDEX IF NOT EXISTS artcovr_generations_purchase_idx ON public.artcovr_generations USING btree (purchase_id);

CREATE TABLE IF NOT EXISTS "artcovr_inquiries" (
  "id" text NOT NULL,
  "clerk_user_id" text NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS artcovr_inquiries_owner_created_idx ON public.artcovr_inquiries USING btree (clerk_user_id, created_at);
ALTER TABLE "artcovr_orders" ADD COLUMN IF NOT EXISTS "entitlement_expires_at" timestamp with time zone;
ALTER TABLE "artcovr_orders" ADD COLUMN IF NOT EXISTS "access_revoked_at" timestamp with time zone;
ALTER TABLE "artcovr_orders" ADD COLUMN IF NOT EXISTS "access_revocation_reason" text;

CREATE TABLE IF NOT EXISTS "artcovr_reference_uploads" (
  "id" text NOT NULL,
  "clerk_user_id" text NOT NULL,
  "artwork_id" text NOT NULL,
  "object_key" text NOT NULL,
  "sha256" text NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "bytes" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "uploaded_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS artcovr_reference_uploads_owner_idx ON public.artcovr_reference_uploads USING btree (clerk_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS artcovr_reference_uploads_object_idx ON public.artcovr_reference_uploads USING btree (object_key);
COMMIT;
