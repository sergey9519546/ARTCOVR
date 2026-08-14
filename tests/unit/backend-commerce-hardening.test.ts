import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RasterValidationError,
  digestsMatch,
  inspectWebp,
  sha256Hex,
  validateSquareWebp,
} from "../../supabase/functions/_shared/raster.ts";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

function ascii(value: string) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function uint32le(value: number) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function chunk(type: string, payload: Uint8Array) {
  const bytes = new Uint8Array(8 + payload.length + (payload.length % 2));
  bytes.set(ascii(type), 0);
  bytes.set(uint32le(payload.length), 4);
  bytes.set(payload, 8);
  return bytes;
}

function structuralWebp(size: 1024 | 2048) {
  const canvas = new Uint8Array(10);
  const encoded = size - 1;
  canvas.set([encoded & 0xff, (encoded >>> 8) & 0xff, (encoded >>> 16) & 0xff], 4);
  canvas.set([encoded & 0xff, (encoded >>> 8) & 0xff, (encoded >>> 16) & 0xff], 7);
  const frame = Uint8Array.of(
    0, 0, 0,
    0x9d, 0x01, 0x2a,
    size & 0xff, (size >>> 8) & 0xff,
    size & 0xff, (size >>> 8) & 0xff,
  );
  const chunks = [chunk("VP8X", canvas), chunk("VP8 ", frame)];
  const bodyLength = 4 + chunks.reduce((total, value) => total + value.length, 0);
  const bytes = new Uint8Array(8 + bodyLength);
  bytes.set(ascii("RIFF"), 0);
  bytes.set(uint32le(bodyLength), 4);
  bytes.set(ascii("WEBP"), 8);
  let offset = 12;
  for (const value of chunks) {
    bytes.set(value, offset);
    offset += value.length;
  }
  return bytes;
}

test("generated WebP contract rejects wrong magic, length, and dimensions", () => {
  const valid = structuralWebp(1024);
  assert.deepEqual(inspectWebp(valid), {
    format: "webp",
    width: 1024,
    height: 1024,
    bytes: valid.length,
  });
  assert.equal(validateSquareWebp(structuralWebp(2048), 2048).width, 2048);

  const wrongMagic = valid.slice();
  wrongMagic[0] = 0;
  assert.throws(() => inspectWebp(wrongMagic), RasterValidationError);

  const wrongLength = valid.slice();
  wrongLength[4] -= 1;
  assert.throws(() => inspectWebp(wrongLength), /RIFF header/);
  assert.throws(() => validateSquareWebp(valid, 2048), /Expected 2048x2048/);
});

test("browser function CORS permits Supabase credential headers", async () => {
  const cors = await read("supabase/functions/_shared/cors.ts");
  const supabase = await read("supabase/functions/_shared/supabase.ts");
  assert.match(cors, /Access-Control-Allow-Headers[^\n]*apikey/);
  assert.match(cors, /Access-Control-Allow-Headers[^\n]*x-client-info/);
  assert.match(cors, /Access-Control-Max-Age/);
  assert.match(supabase, /supabase_request_timeout/);
  assert.match(supabase, /global: \{ fetch: timedFetch \}/);
});

test("My Images uses explicit foreign-key relationships and purchase-scoped assets", async () => {
  const account = await read("supabase/functions/my-images/index.ts");
  const migration = await read("supabase/migrations/202608130008_backend_integrity.sql");
  assert.match(account, /artworks!purchases_artwork_id_fkey\(slug\)/);
  assert.match(account, /artworks!generations_artwork_id_fkey\(catalog_id\)/);
  assert.match(account, /purchaseId: asset\.purchase_id/);
  assert.match(migration, /p\.base_object_key_snapshot/);
  assert.match(migration, /returns table\([\s\S]*purchase_id uuid,[\s\S]*object_key text/);
  assert.match(migration, /access_revoked_at is null/);
});

test("Checkout freezes Stripe parameters and preserves indeterminate attempts", async () => {
  const stripe = await read("supabase/functions/_shared/stripe.ts");
  const checkout = await read("supabase/functions/create-checkout/index.ts");
  const migration = await read("supabase/migrations/202608130008_backend_integrity.sql");
  assert.match(stripe, /expiresAt: string/);
  assert.match(stripe, /new Date\(input\.expiresAt\)/);
  assert.doesNotMatch(stripe, /Date\.now\(\)[\s\S]*checkoutWindowSeconds/);
  assert.match(stripe, /payment_method_types\[0\]": "card"/);
  assert.match(stripe, /class StripeRequestError/);
  assert.match(stripe, /Stripe returned an unreadable Checkout response/);
  assert.match(checkout, /isStripeRequestIndeterminate/);
  assert.match(checkout, /expiresAt: purchase\.stripe_checkout_expires_at/);
  assert.match(checkout, /session\.metadata\?\.artwork_catalog_id !== purchase\.artwork_catalog_id/);
  assert.match(migration, /stripe_checkout_expires_at/);
});

test("checkout SQL locks artwork before purchase and snapshots the original", async () => {
  const migration = await read("supabase/migrations/202608130008_backend_integrity.sql");
  const settleStart = migration.indexOf("create function public.settle_purchase_paid");
  const settleEnd = migration.indexOf("create function public.revoke_purchase_access", settleStart);
  const settle = migration.slice(settleStart, settleEnd);
  const artworkLock = settle.indexOf("from public.artworks");
  const purchaseLock = settle.indexOf("from public.purchases", artworkLock);
  assert.ok(artworkLock > 0 && purchaseLock > artworkLock, "settlement must lock artwork before purchase");
  assert.match(migration, /base_object_key_snapshot, base_source_sha256_snapshot/);
  assert.match(migration, /v_art\.base_object_key, v_art\.source_sha256/);
  assert.match(migration, /selected_preview_conflict/);
});

test("failed generations release success slots but attempt admission is bounded", async () => {
  const migration = await read("supabase/migrations/202608130008_backend_integrity.sql");
  const worker = await read("supabase/functions/generate-image/index.ts");
  assert.match(migration, /'generation-global-rate'/);
  assert.match(migration, /interval '1 minute'[\s\S]*>= 4/);
  assert.match(migration, /'generation-user-rate'/);
  assert.match(migration, /interval '10 minutes'[\s\S]*>= 6/);
  assert.match(migration, /interval '24 hours'[\s\S]*>= 24/);
  assert.match(worker, /release\([\s\S]*"failed"/);
  assert.match(worker, /removePrivate\(uploaded\)/);
});

test("refund and dispute paths revoke future clean access durably", async () => {
  const webhook = await read("supabase/functions/stripe-webhook/index.ts");
  const migration = await read("supabase/migrations/202608130008_backend_integrity.sql");
  const status = await read("supabase/functions/generation-status/index.ts");
  assert.match(webhook, /charge\.dispute\.created/);
  assert.match(webhook, /revoke_purchase_access/);
  assert.match(webhook, /processing_error: classification/);
  assert.match(webhook, /payload: \{ object_id: objectId \}/);
  assert.doesNotMatch(webhook, /payload: event/);
  assert.match(migration, /access_revoked_at = now\(\)/);
  assert.match(status, /!purchase\.access_revoked_at/);
});

test("content digests distinguish a watermarked preview from its clean original", async () => {
  const clean = structuralWebp(1024);
  const watermarked = clean.slice();
  watermarked[watermarked.length - 1] ^= 0x01;

  const cleanDigest = await sha256Hex(clean);
  const passthroughDigest = await sha256Hex(clean.slice());
  const watermarkedDigest = await sha256Hex(watermarked);

  assert.match(cleanDigest, /^[0-9a-f]{64}$/);
  assert.equal(await sha256Hex(Uint8Array.of()), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  // A renderer that proxies its input produces byte-identical output.
  assert.ok(digestsMatch(cleanDigest, passthroughDigest));
  assert.ok(!digestsMatch(cleanDigest, watermarkedDigest));
  assert.ok(!digestsMatch(cleanDigest, cleanDigest.slice(0, 63)));
  assert.ok(digestsMatch("", ""));
});

test("the worker refuses a watermark renderer that returns the clean image", async () => {
  const worker = await read("supabase/functions/generate-image/index.ts");
  const raster = await read("supabase/functions/_shared/raster.ts");
  assert.match(raster, /export async function sha256Hex/);
  assert.match(raster, /export function digestsMatch/);
  assert.match(worker, /sha256Hex\(result\.bytes\)/);
  assert.match(worker, /sha256Hex\(watermarked\)/);
  assert.match(worker, /digestsMatch\(cleanDigest, previewDigest\)/);
  assert.match(worker, /"watermark_passthrough"/);
  // The passthrough check must precede the preview upload so a clean original
  // is never stored under the watermarked preview key.
  const check = worker.indexOf("digestsMatch(cleanDigest, previewDigest)");
  const previewUpload = worker.indexOf("uploadPrivate(keys.preview", check);
  assert.ok(check > 0 && previewUpload > check, "passthrough must be detected before the preview upload");
});

test("the generation watchdog cutoff exceeds the worst-case worker budget", async () => {
  const watchdog = await read("supabase/functions/generation-watchdog/index.ts");
  const openai = await read("supabase/functions/_shared/openai-images.ts");
  const migration = await read("supabase/migrations/202608140009_convergence_hardening.sql");
  assert.match(watchdog, /Date\.now\(\) - 180_000/);
  assert.doesNotMatch(watchdog, /Date\.now\(\) - 135_000/);
  assert.match(openai, /maximumImageTimeoutMs = 130_000/);
  assert.match(openai, /configured <= maximumImageTimeoutMs/);
  assert.match(migration, /interval '180 seconds'/);
  // 130s provider ceiling + 15s watermark render + 30s margin < 180s cutoff.
  assert.ok(130_000 + 15_000 + 30_000 < 180_000);
});

test("stripe-webhook converges terminal no-op outcomes on 200 and records why", async () => {
  const webhook = await read("supabase/functions/stripe-webhook/index.ts");
  const migration = await read("supabase/migrations/202608140009_convergence_hardening.sql");
  assert.match(migration, /add column processed_outcome text/);
  assert.match(webhook, /async function markProcessed\(eventId: string, outcome: string\)/);
  assert.match(webhook, /processed_outcome: outcome\.slice\(0, 120\)/);
  // A refund or dispute on a PaymentIntent this project does not own is
  // terminal, not a retryable conflict.
  assert.match(webhook, /markProcessed\(event\.id, "foreign_event"\)/);
  assert.doesNotMatch(webhook, /refund_purchase_not_found/);
  assert.match(webhook, /markProcessed\(event\.id, "already_terminal"\)/);
  assert.match(webhook, /\["not_paid", "unknown"\]\.includes\(revoked\)/);
  // Only a refunded settlement is convergent. `invalid_state` means Stripe took
  // money for a row that cannot be settled (typically `expired`), which no
  // watchdog rescans, so it must stay unprocessed and keep Stripe retrying.
  assert.match(webhook, /if \(data === "refunded"\) \{\s*\n\s*await markProcessed\(event\.id, "superseded"\)/);
  assert.doesNotMatch(webhook, /\["refunded", "invalid_state"\]\.includes\(data\)/);
  // `invalid_state` reaches no markProcessed call at all; it falls through.
  assert.doesNotMatch(webhook, /invalid_state"\][^\n]*\)\s*\{\s*\n\s*await markProcessed/);
  assert.match(webhook, /if \(!\["paid", "already_paid"\]\.includes\(data\)\) \{\s*\n\s*throw new HttpError\(409, "fulfillment_conflict"/);
  assert.match(webhook, /markProcessed\(event\.id, "partial_refund_unsupported"\)/);
  assert.match(webhook, /markProcessed\(event\.id, "unsupported_event"\)/);
  // Identity verification still precedes every state change.
  assert.match(webhook, /payment\.metadata\?\.purchase_id !== purchase\.id[\s\S]*dispute_purchase_mismatch/);
});

test("dispute resolution falls back to PaymentIntent metadata like the refund path", async () => {
  const webhook = await read("supabase/functions/stripe-webhook/index.ts");
  const stripe = await read("supabase/functions/_shared/stripe.ts");
  // `stripe_payment_intent_id` is only written at settlement, so resolving a
  // dispute by that column alone can miss and permanently misclassify a real
  // ARTCOVR purchase as `foreign_event`.
  assert.match(stripe, /payment_intent_data\[metadata\]\[purchase_id\]/);
  const resolveStart = webhook.indexOf("async function resolveDisputedPurchase");
  const resolveEnd = webhook.indexOf("Deno.serve", resolveStart);
  assert.ok(resolveStart > 0 && resolveEnd > resolveStart, "resolveDisputedPurchase must exist");
  const resolve = webhook.slice(resolveStart, resolveEnd);
  assert.match(resolve, /\.eq\("stripe_payment_intent_id", payment\.id\)/);
  assert.match(
    resolve,
    /if \(!purchase && payment\.metadata\?\.purchase_id\) \{\s*\n\s*purchase = await getPurchaseById\(payment\.metadata\.purchase_id\);/,
  );
  // The fallback lookup is by id, so identity must still be proven afterwards.
  const fallback = resolve.indexOf("getPurchaseById(payment.metadata.purchase_id)");
  const verification = resolve.indexOf("payment.metadata?.purchase_id !== purchase.id", fallback);
  assert.ok(verification > fallback, "the metadata fallback must still be identity-verified");
});

test("a won dispute restores exactly what charge.dispute.created revoked", async () => {
  const webhook = await read("supabase/functions/stripe-webhook/index.ts");
  const migration = await read("supabase/migrations/202608140009_convergence_hardening.sql");
  assert.match(webhook, /"charge\.dispute\.closed",/);
  assert.match(webhook, /dispute\.status !== "won"/);
  assert.match(webhook, /admin\.rpc\("restore_purchase_access"/);
  assert.match(webhook, /restored === "not_revoked"/);
  assert.match(webhook, /markProcessed\(event\.id, "dispute_not_won"\)/);
  assert.match(migration, /create or replace function public\.restore_purchase_access/);
  assert.match(migration, /access_revocation_reason is distinct from 'payment_dispute'[\s\S]*return 'mismatch'/);
  assert.match(migration, /v_purchase\.status <> 'paid' then return 'mismatch'/);
  assert.match(migration, /access_revoked_at is null then return 'not_revoked'/);
  assert.match(migration, /set access_revoked_at = null,\s*access_revocation_reason = null/);
  assert.match(migration, /grant execute on function public\.restore_purchase_access\(uuid, text\) to service_role/);
});

test("commerce watchdog defers unreconcilable rows instead of starving the batch", async () => {
  const watchdog = await read("supabase/functions/commerce-watchdog/index.ts");
  const migration = await read("supabase/migrations/202608140009_convergence_hardening.sql");
  assert.match(migration, /add column reconciliation_attempts integer not null default 0/);
  assert.match(migration, /add column next_reconcile_at timestamptz/);
  assert.match(migration, /add column reconciliation_blocked_at timestamptz/);
  assert.match(watchdog, /next_reconcile_at\.is\.null,next_reconcile_at\.lte\./);
  assert.match(watchdog, /\.is\("reconciliation_blocked_at", null\)/);
  assert.match(watchdog, /\.limit\(5\)/);
  assert.match(watchdog, /order\("reservation_expires_at", \{ ascending: true \}\)/);
  assert.match(watchdog, /MAXIMUM_BACKOFF_MINUTES = 60/);
  assert.match(watchdog, /QUARANTINE_ATTEMPTS = 20/);
  assert.match(watchdog, /Math\.min\(2 \*\* Math\.min\(attempts, 30\), MAXIMUM_BACKOFF_MINUTES\)/);
  assert.match(watchdog, /reconciliation_attempts: attempts \+ 1/);
  assert.match(watchdog, /reconciliation_attempts: 0, next_reconcile_at: null/);
  assert.match(watchdog, /reconciliation_blocked_at: new Date\(\)\.toISOString\(\)/);
  // A partial failure is durable in the row; the run itself still succeeds.
  assert.doesNotMatch(watchdog, /reservation_reconciliation_failed/);
  assert.match(watchdog, /failed: results\.filter/);
  assert.match(watchdog, /blocked: results\.filter/);
  assert.match(watchdog, /"unauthorized", "Scheduler authentication failed\."/);
});

test("reserve_artwork returns exactly one row and rate-limits reservation floods", async () => {
  const migration = await read("supabase/migrations/202608140009_convergence_hardening.sql");
  const start = migration.indexOf("create or replace function public.reserve_artwork");
  const end = migration.indexOf("create or replace function public.restore_purchase_access");
  assert.ok(start > 0 && end > start, "the new migration must redefine reserve_artwork");
  const reserve = migration.slice(start, end);

  const branches = reserve.match(/return query select[^;]*;/g) ?? [];
  assert.ok(branches.length >= 12, `expected every conflict branch, found ${branches.length}`);
  let cursor = 0;
  for (const branch of branches) {
    const at = reserve.indexOf(branch, cursor);
    assert.match(
      reserve.slice(at + branch.length),
      /^\s*return;/,
      `conflict branch must return exactly one row: ${branch}`,
    );
    cursor = at + branch.length;
  }

  assert.match(reserve, /interval '45 minutes'/);
  assert.doesNotMatch(reserve, /interval '31 minutes'/);
  assert.match(reserve, /'reservation_rate_limited'/);
  // Flood control is an abuse ceiling, not a usage budget: a multi-cover buyer
  // and a shopper who abandons a few checkouts must both stay under it, since
  // there is no cancel path and a reservation holds for 45 minutes.
  assert.match(reserve, /abandoned\.status = 'expired'[\s\S]*abandoned\.stripe_payment_intent_id is null[\s\S]*interval '24 hours'[\s\S]*>= 20/);
  assert.match(reserve, /live\.status in \('reserved', 'pending'\)[\s\S]*live\.reservation_expires_at > now\(\)[\s\S]*>= 8/);
  assert.doesNotMatch(reserve, /interval '24 hours'\s*\n?\s*\) >= 5/);
  assert.doesNotMatch(reserve, /live\.reservation_expires_at > now\(\)\s*\n?\s*\) >= 3/);
  // Flood control must never reject an idempotent retry of an existing row.
  const idempotent = reserve.indexOf("'existing'");
  const floodControl = reserve.indexOf("'reservation_rate_limited'");
  assert.ok(idempotent > 0 && floodControl > idempotent, "flood control must run only for a new reservation");
});

test("create-checkout validates request shape and distinguishes reservation refusals", async () => {
  const checkout = await read("supabase/functions/create-checkout/index.ts");
  assert.match(checkout, /const UUID_PATTERN = /);
  assert.match(checkout, /const CATALOG_ID_PATTERN = \/\^\[a-z0-9\]\[a-z0-9_-\]\{2,95\}\$\//);
  assert.match(checkout, /!UUID_PATTERN\.test\(body\.idempotencyKey\)[\s\S]*idempotencyKey must be a UUID/);
  assert.match(checkout, /!UUID_PATTERN\.test\(body\.selectedPreviewId\)/);
  assert.match(checkout, /!CATALOG_ID_PATTERN\.test\(body\.artworkId\)/);
  assert.match(checkout, /429,\s*"reservation_rate_limited"/);
  assert.match(
    checkout,
    /409,\s*"selected_preview_conflict",\s*"Your active checkout for this artwork uses a different selected preview\. Complete or wait for that checkout to expire, then try again\."/,
  );
  // Shape validation must precede the reservation RPC.
  const validation = checkout.indexOf("CATALOG_ID_PATTERN.test(body.artworkId)");
  const reserve = checkout.indexOf('admin.rpc("reserve_artwork"');
  assert.ok(validation > 0 && reserve > validation, "request shape must be validated before reserving");
});

test("watchdog has executable Vault-backed scheduler provisioning", async () => {
  const scheduler = await read("supabase/scheduler/generation-watchdog.sql");
  const watchdog = await read("supabase/functions/generation-watchdog/index.ts");
  const commerceWatchdog = await read("supabase/functions/commerce-watchdog/index.ts");
  assert.match(scheduler, /cron\.schedule/);
  assert.match(scheduler, /vault\.decrypted_secrets/);
  assert.match(scheduler, /x-cron-secret/);
  assert.match(watchdog, /removePrivate/);
  assert.match(scheduler, /artcovr-commerce-watchdog/);
  assert.match(commerceWatchdog, /retrieveCheckout/);
  assert.match(commerceWatchdog, /retrievePaymentIntent/);
  assert.match(commerceWatchdog, /settle_purchase_paid/);
  assert.match(commerceWatchdog, /expire_purchase/);
  assert.match(commerceWatchdog, /if \(!expired\) return "expiry_race_pending"/);
});
