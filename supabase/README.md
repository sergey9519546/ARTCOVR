# ARTCOVR Supabase backend contract

This directory is the complete Supabase backend boundary. Browser clients use magic-link JWTs to call Edge Functions; they do not receive Storage object keys, write purchase/generation state, or fulfill Stripe redirects.

## Deployment contract

Copy `.env.example` into the Supabase Function secrets configuration. `OPENAI_IMAGE_MODEL` defaults exactly to `gpt-image-2-2026-04-21`; the worker has no model fallback or resolution downgrade. Ensure that exact model ID is enabled for the OpenAI project before deployment.

Enable Supabase email OTP/magic-link authentication and set `APP_ORIGIN` as an Auth redirect URL. Keep password login disabled if magic-link-only access is required.

`art-assets` is a private bucket. Its object key layout is:

```text
{approved privateBasePath}                         # clean catalog source
{approved catalogObjectKey}                       # catalog display derivative
generated/{internalArtworkUuid}/{generationId}/clean.webp
generated/{internalArtworkUuid}/{generationId}/preview-watermarked.webp
```

The base and catalog keys are authoritative values from the approved catalog artifact; do not derive them again inside an Edge Function. `scripts/catalog/plan-storage-upload.ts` resolves the SHA-bound private source map, plans both uploads, refuses overwrites with different bytes, and verifies every uploaded SHA-256 before catalog SQL is applied. The seed CSV is only a staging template. Before publishing an artwork, upload the original and catalog derivative through service-role access, set `rights_approved_at`, set `publication_approved_at`, then set `published_at` and `is_listed`. Publication is database-gated by those approvals. At reservation time the original object key and source SHA-256 are snapshotted onto the purchase, so later catalog maintenance cannot silently replace a buyer's entitled base asset.

`WATERMARK_RENDER_URL` must point to a trusted raster-rendering implementation. It accepts `{ sourceUrl, watermark, outputFormat }`, downloads only the short-lived signed URL, and returns a visibly raster-watermarked WebP. If it is missing or fails, `generate-image` fails and releases the claimed allowance; it never returns a clean image as a preview.

## Function API

- `create-checkout` — authenticated `POST { artworkId, idempotencyKey, selectedPreviewId? }`; creates one-item Stripe Checkout at immutable price, expiry, base-object, and license-version snapshots. A selected preview must be the caller’s current, unexpired successful preview for that artwork. Exclusive works are atomically reserved during checkout. Checkout is limited to immediate card/wallet payment methods so delayed bank methods cannot outlive an exclusive reservation. Indeterminate Stripe transport failures preserve the same purchase and idempotency key for recovery.
- `stripe-webhook` — Stripe raw-body signed webhook only. It records the event identity first and fulfills from the verified server-side Checkout Session; the success redirect is never fulfillment. Stored event payloads contain only the Stripe object ID, not the customer-bearing event body. Full refunds converge transactionally, and `charge.dispute.created` immediately revokes generation/download access without relisting exclusive art.
- `generate-image` — authenticated `POST { artworkId, purchaseId?, referenceGenerationId?, prompt }`. Previews use 1024x1024/medium and permit two successful outputs per user/artwork. Paid purchases use 2048x2048/high and permit four successful outputs per purchase. The reference is either the authoritative base image or a server-validated owned successful generation; no client key is accepted.
- `generation-status` — `GET ?artworkId=` returns only a signed raster-watermarked catalog image for a currently published/listed work; it has no object key. Authenticated `GET ?generationId=` or `POST { generationId }` returns a five-minute signed watermarked generation preview. A clean URL is returned only while the owner’s linked purchase remains `paid`.
- `my-images` — authenticated `GET`; returns purchase-scoped signed clean base originals, the selected clean preview, and all successful purchased results for paid, non-revoked purchases whose 30-day entitlement remains active. `resetSource: "original"` is authoritative: Reset always returns to the immutable purchased base, not the selected preview.
- `submit-inquiry` — authenticated `POST { name?, message }`; email comes from Auth, never request JSON.
- `generation-watchdog` — scheduler-only `POST` with `x-cron-secret`; run every minute. It releases queued/running jobs older than 135 seconds as `timed_out` and deletes deterministic orphan output keys. Provision it with `scheduler/generation-watchdog.sql` after storing the project URL and cron secret in Supabase Vault.
- `commerce-watchdog` — scheduler-only `POST` with `x-cron-secret`; run every minute. It scans a bounded batch of expired reservations and verifies the canonical Stripe Session and PaymentIntent before fulfilling a paid purchase, preserving a processing payment, or releasing an unpaid reservation.

The OpenAI call uses `AbortController` at 115 seconds by default (`OPENAI_IMAGE_TIMEOUT_MS`, maximum 135 seconds). Both clean and raster-watermarked outputs must be structurally valid, static, exact-dimension WebP rasters below 20 MiB before finalization. `blocked`, `failed`, and `timed_out` rows set `allowance_slot` to null, releasing the claimed success allowance. Admission starts conservatively at 4 attempts per rolling minute project-wide, plus 6 per rolling 10 minutes and 24 per rolling 24 hours per authenticated user, so failures cannot create unlimited provider spend. Raise the global ceiling only after the OpenAI project tier and production latency budget are verified. Only successful rows retain an allowance slot.

## Scheduler provisioning

1. Generate a long random `CRON_SECRET` and set it with `supabase secrets set`.
2. In the project SQL editor, create Vault secrets named `artcovr_project_url` and `artcovr_scheduler_secret`; the latter must exactly match `CRON_SECRET`.
3. Run `scheduler/generation-watchdog.sql` and confirm the job appears in `cron.job`.
4. After two minutes, inspect `cron.job_run_details`. Launch is blocked until both generation and commerce watchdog executions report success.

## Invariants

`tests/contract_invariants.sql` is for a disposable migrated database. `tests/verify-contract.ps1` statically checks the schema and required function entrypoints without credentials. It does not replace running the SQL against a real Supabase Postgres instance.
