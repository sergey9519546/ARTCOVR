import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("public catalog IDs resolve to internal artwork UUIDs", async () => {
  const migration = await read(
    "supabase/migrations/202608130007_security_contracts.sql",
  );
  const checkout = await read("supabase/functions/create-checkout/index.ts");
  const status = await read("supabase/functions/generation-status/index.ts");

  assert.match(migration, /catalog_id\s+text/i);
  assert.match(migration, /where\s+catalog_id\s*=\s*p_catalog_id/i);
  assert.match(checkout, /p_catalog_id:\s*body\.artworkId/);
  assert.match(status, /\.eq\("catalog_id", artworkId\)/);
});

test("Reset can explicitly return preview generation to the base artwork", async () => {
  const migration = await read(
    "supabase/migrations/202608130007_security_contracts.sql",
  );
  assert.match(migration, /p_reset_to_base boolean default false/i);
  assert.match(migration, /if p_reset_to_base then\s+v_source := v_art\.base_object_key/i);
  const lock = migration.indexOf("perform pg_advisory_xact_lock");
  const reset = migration.indexOf("if p_reset_to_base then");
  assert.ok(lock >= 0 && reset > lock, "lineage validation must happen under the generation lock");
  assert.match(migration, /child\.status in \('queued', 'running', 'succeeded'\)/i);
});

test("My Images exposes paid generation controls and preserves generation chaining", async () => {
  const page = await read("src/app/my-images/page.tsx");
  const studio = await read("src/components/artcovr/PurchasedGenerationStudio.tsx");
  assert.match(page, /PurchasedGenerationStudio/);
  assert.match(studio, /purchaseId: purchase\.id/);
  assert.match(studio, /referenceGenerationId: currentResultId\.current/);
  assert.match(studio, /resetToBase: true/);
});

test("checkout rotates only terminally unusable idempotency keys", async () => {
  const client = await read("src/lib/artcovr/functions.ts");
  const checkout = await read("src/components/artcovr/CheckoutReview.tsx");
  assert.match(client, /class ArtcovrApiError/);
  assert.match(checkout, /shouldRotateCheckoutKey/);
  assert.match(checkout, /sessionStorage\.removeItem\(keyName\)/);
});

test("active source no longer carries the archive demo namespace", async () => {
  await assert.rejects(access(new URL("../../src/components/outfit", import.meta.url)));
  await assert.rejects(access(new URL("../../src/hooks/outfit", import.meta.url)));
});

test("private catalog staging is explicit and separated from the public projection", async () => {
  const catalog = await read("src/lib/artcovr/artworks.ts");
  const browserProjection = await read("src/lib/artcovr/curated-public.json");
  assert.match(catalog, /process\.env\.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1"/);
  assert.match(catalog, /curatedReview/);
  assert.match(catalog, /curatedPublic/);
  assert.match(catalog, /getArtworkBySlug[\s\S]*displayArtworks\.find/);
  assert.doesNotMatch(browserProjection, /"reviewFlags"/);
});

test("auth callback keeps redirect destinations on the app origin", async () => {
  const callback = await read("src/app/auth/callback/page.tsx");
  assert.match(callback, /safeNext/);
  assert.match(callback, /sign-in\?error=callback/);
  assert.match(callback, /getSupabaseBrowserClient/);
  assert.match(callback, /exchangeCodeForSession/);
});

test("contact confirms only after persisting an inquiry", async () => {
  const contact = await read("src/app/contact/page.tsx");
  const client = await read("src/lib/artcovr/functions.ts");
  assert.match(contact, /await submitInquiry/);
  assert.match(client, /export function submitInquiry/);
});

test("checkout uses the reserved purchase snapshot, never the mutable request artwork price", async () => {
  const checkout = await read("supabase/functions/create-checkout/index.ts");
  assert.match(
    checkout,
    /artwork_id,artwork_catalog_id,artwork_title,amount_cents,currency,stripe_checkout_session_id/,
  );
  assert.match(checkout, /title:\s*purchase\.artwork_title/);
  assert.match(checkout, /amount:\s*purchase\.amount_cents/);
  assert.doesNotMatch(checkout, /\.from\("artworks"\)/);
});

test("canonical payment and refund state are reconciled before entitlement activation", async () => {
  const webhook = await read("supabase/functions/stripe-webhook/index.ts");
  assert.match(webhook, /retrievePaymentIntent\(canonical\.payment_intent\)/);
  assert.match(webhook, /payment\.amount\s*!==\s*purchase\.amount_cents/);
  assert.match(webhook, /latestCharge\?\.refunded/);
  const refundGuard = webhook.indexOf("latestCharge?.refunded");
  const settlement = webhook.indexOf('admin.rpc("settle_purchase_paid"');
  assert.ok(refundGuard >= 0 && settlement > refundGuard, "refund state must be checked before settlement");
});
