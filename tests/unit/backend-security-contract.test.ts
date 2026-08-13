import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("database maps stable catalog IDs to UUID rows and snapshots checkout identity", async () => {
  const sql = await read("supabase/migrations/202608130007_security_contracts.sql");
  assert.match(sql, /add column catalog_id text/);
  assert.match(sql, /artworks_catalog_id_unique_idx/);
  assert.match(sql, /add column artwork_catalog_id text/);
  assert.match(sql, /add column artwork_title text/);
  assert.match(sql, /foreign key \(artwork_catalog_id\) references public\.artworks\(catalog_id\)/);
  assert.match(sql, /p_catalog_id text/);
});

test("publication requires technical provenance and unique source content", async () => {
  const sql = await read("supabase/migrations/202608130007_security_contracts.sql");
  assert.match(sql, /artworks_publication_integrity/);
  assert.match(sql, /source_width >= 1024/);
  assert.match(sql, /source_width = source_height/);
  assert.match(sql, /artworks_source_sha256_unique_idx[\s\S]*where source_sha256 is not null/);
  assert.match(sql, /create view public\.catalog_artworks[\s\S]*source_sha256 is not null/);
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /revoke all on public\.catalog_artworks from public, anon, authenticated/);
});

test("idempotency keys cannot be replayed across artworks", async () => {
  const sql = await read("supabase/migrations/202608130007_security_contracts.sql");
  const checkout = await read("supabase/functions/create-checkout/index.ts");
  assert.match(sql, /v_existing\.artwork_id is distinct from v_art\.id/);
  assert.match(sql, /'idempotency_conflict'/);
  assert.match(checkout, /select\("artwork_id,artwork_catalog_id,artwork_title,amount_cents,currency,stripe_checkout_session_id,stripe_checkout_expires_at"\)/);
  assert.doesNotMatch(checkout, /select\("title,price_cents,currency"\)/);
});

test("fulfillment verifies immutable amounts and detects refunded payment before settlement", async () => {
  const stripe = await read("supabase/functions/_shared/stripe.ts");
  const webhook = await read("supabase/functions/stripe-webhook/index.ts");
  const sql = await read("supabase/migrations/202608130007_security_contracts.sql");
  assert.match(stripe, /payment_intent_data\[metadata\]\[purchase_id\]/);
  assert.match(stripe, /retrievePaymentIntent/);
  assert.match(webhook, /canonical\.amount_total !== purchase\.amount_cents/);
  assert.match(webhook, /latestCharge\?\.refunded/);
  assert.match(webhook, /reconcile_full_refund/);
  assert.match(webhook, /refund_purchase_mismatch/);
  assert.match(webhook, /p_amount_cents: canonical\.amount_total/);
  assert.match(sql, /v_purchase\.amount_cents is distinct from p_amount_cents/);
  assert.match(sql, /create function public\.reconcile_full_refund/);
  assert.match(sql, /where id = p_purchase_id[\s\S]*for update;[\s\S]*v_purchase\.status = 'paid'[\s\S]*status = 'refunded'/);
  assert.match(sql, /v_purchase\.status in \('reserved', 'pending'\)[\s\S]*status = 'expired'/);
});

test("server credentials stay server-only and local environment files are ignored", async () => {
  const gitignore = await read(".gitignore");
  const browserEnv = await read(".env.example");
  const serverEnv = await read("supabase/.env.example");
  assert.match(gitignore, /^\.env\*$/m);
  assert.doesNotMatch(browserEnv, /SERVICE_ROLE|OPENAI_API_KEY|STRIPE_SECRET_KEY/);
  assert.match(serverEnv, /SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY/);
  assert.match(serverEnv, /OPENAI_API_KEY=YOUR_SERVER_ONLY_OPENAI_KEY/);
  assert.match(serverEnv, /STRIPE_SECRET_KEY=YOUR_SERVER_ONLY_STRIPE_KEY/);
});

test("generation lineage locks before validation and supports an explicit base reset", async () => {
  const sql = await read("supabase/migrations/202608130007_security_contracts.sql");
  const edge = await read("supabase/functions/generate-image/index.ts");
  const lock = sql.indexOf("pg_advisory_xact_lock");
  const currentReference = sql.indexOf("preview_current_reference_required", lock);
  assert.ok(lock > 0 && currentReference > lock, "lineage lock must precede current-reference validation");
  assert.match(sql, /p_reset_to_base boolean default false/);
  assert.match(sql, /if p_reset_to_base then[\s\S]*v_source := v_art\.base_object_key/);
  assert.match(sql, /child\.status in \('queued', 'running', 'succeeded'\)/);
  const relock = sql.indexOf("for update;", lock);
  assert.ok(relock > lock, "paid entitlement must be re-locked after the lineage lock");
  assert.match(edge, /p_reset_to_base: body\.resetToBase === true/);
});

test("account functions emit public catalog IDs and revoke refunded purchased previews", async () => {
  const account = await read("supabase/functions/my-images/index.ts");
  const status = await read("supabase/functions/generation-status/index.ts");
  const sql = await read("supabase/migrations/202608130007_security_contracts.sql");
  assert.match(account, /artworkId: purchase\.artwork_catalog_id/);
  assert.match(account, /artworkId: artworkRelation\?\.catalog_id/);
  assert.match(account, /previewAllowed = generation\.purchase_id === null \|\| activePurchases\.has/);
  assert.match(status, /!generation\.purchase_id \|\| purchasedAccess/);
  assert.match(sql, /returns table\(asset_kind text, artwork_id text/);
});

test("legacy open-port websocket demo is absent", async () => {
  await assert.rejects(access(new URL("Caddyfile", root)));
  await assert.rejects(access(new URL("examples/websocket/server.ts", root)));
  await assert.rejects(access(new URL("examples/websocket/frontend.tsx", root)));
});
