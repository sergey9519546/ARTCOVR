import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RasterValidationError,
  inspectWebp,
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
