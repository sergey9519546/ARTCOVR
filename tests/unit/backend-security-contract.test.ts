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

test("no public-schema helper function is executable by PUBLIC", async () => {
  const sql = await read("supabase/migrations/202608130005_artwork_metadata.sql");
  assert.match(sql, /create function public\.immutable_text_array_join\(p_values text\[\]\)/);
  assert.match(
    sql,
    /revoke all on function public\.immutable_text_array_join\(text\[\]\)\s*\n?\s*from public, anon, authenticated;/,
  );
  // 202608110004's blanket `grant execute on all functions ... to service_role`
  // already ran, so revoking PUBLIC leaves service_role with nothing — and the
  // artworks.search_vector generated column is evaluated as the writer.
  assert.match(
    sql,
    /grant execute on function public\.immutable_text_array_join\(text\[\]\) to service_role;/,
  );
  const created = sql.indexOf("create function public.immutable_text_array_join");
  const revoked = sql.indexOf("revoke all on function public.immutable_text_array_join");
  const granted = sql.indexOf("grant execute on function public.immutable_text_array_join");
  assert.ok(created > 0 && revoked > created, "the revoke must follow the function definition");
  assert.ok(granted > revoked, "the service_role grant must follow the revoke");
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

test("the unverified refund RPC is dropped and its removal is a launch gate", async () => {
  const migration = await read("supabase/migrations/202608140009_convergence_hardening.sql");
  const invariants = await read("supabase/tests/contract_invariants.sql");
  assert.match(migration, /drop function if exists public\.refund_purchase\(uuid\);/);
  assert.match(invariants, /to_regprocedure\('public\.refund_purchase\(uuid\)'\) is null/);
  assert.match(invariants, /raise exception 'unverified refund_purchase RPC must not exist'/);
  // A non-unique partial index on paid purchases is expected; only a unique one
  // would globally serialize fulfillment.
  assert.match(invariants, /indexdef ilike 'create unique index%'[\s\S]*no_global_paid_purchase_constraint/);
  assert.match(invariants, /raise exception 'a unique paid-purchase index would globally serialize fulfillment'/);
  assert.match(invariants, /raise exception 'reconciliation backoff columns are missing'/);
  assert.match(invariants, /raise exception 'stripe event outcome classification column is missing'/);
});

test("the base download is bound to the purchased source bytes", async () => {
  const migration = await read("supabase/migrations/202608140009_convergence_hardening.sql");
  const account = await read("supabase/functions/my-images/index.ts");
  assert.match(migration, /create or replace function public\.account_assets/);
  // The base row is withheld on a real mismatch only. A null snapshot is
  // unverifiable legacy data, and `null = anything` is never true, so joining
  // on equality alone would silently swallow a paid buyer's clean download.
  assert.match(
    migration,
    /select 'base'::text[\s\S]*join public\.artworks a\s*\n\s*on a\.id = p\.artwork_id\s*\n[\s\S]*?and \(p\.base_source_sha256_snapshot is null\s*\n\s*or a\.source_sha256 = p\.base_source_sha256_snapshot\)/,
  );
  // Resolvable null snapshots are filled in before the function starts reading
  // the column, and no NOT NULL is added (it would abort on a digest-less work).
  const backfill = migration.indexOf("set base_source_sha256_snapshot = a.source_sha256");
  const replacement = migration.indexOf("create or replace function public.account_assets");
  assert.ok(backfill > 0 && replacement > backfill, "the snapshot backfill must precede account_assets");
  assert.match(
    migration,
    /update public\.purchases p\s*\n\s*set base_source_sha256_snapshot = a\.source_sha256\s*\n\s*from public\.artworks a\s*\n\s*where a\.id = p\.artwork_id\s*\n\s*and p\.base_source_sha256_snapshot is null\s*\n\s*and a\.source_sha256 is not null;/,
  );
  assert.doesNotMatch(migration, /alter column base_source_sha256_snapshot set not null/);
  // A missing base row must degrade gracefully: downloads are mapped, never indexed.
  assert.match(account, /\(assetResult\.data \?\? \[\]\)\.map/);
  assert.match(account, /downloads = signedDownloads\.filter/);
  assert.match(account, /remainingGenerations: activePurchases\.has\(purchase\.id\)/);
  assert.match(account, /const entitledPreview = selectedPreviews\.has\(generation\.id\)/);
  assert.match(account, /\(active \|\| entitledPreview\) && previewAllowed/);
});

test("generation-status hides artworks the public catalog view hides", async () => {
  const status = await read("supabase/functions/generation-status/index.ts");
  const view = await read("supabase/migrations/202608130007_security_contracts.sql");
  assert.match(view, /create view public\.catalog_artworks[\s\S]*source_mime_type in \('image\/jpeg', 'image\/png'\)/);
  assert.match(status, /function isPubliclyVisible/);
  assert.match(status, /artwork\.source_width >= 1024/);
  assert.match(status, /artwork\.source_height === artwork\.source_width/);
  assert.match(status, /Number\(artwork\.source_bytes\) > 0/);
  assert.match(status, /artwork\.source_mime_type === "image\/jpeg" \|\| artwork\.source_mime_type === "image\/png"/);
  assert.match(status, /\/\^\[0-9a-f\]\{64\}\$\/\.test\(artwork\.source_sha256\)/);
  assert.match(status, /!isPubliclyVisible\(catalogArtwork\)[\s\S]*artwork_not_found/);
  // Response shape is unchanged.
  assert.match(status, /privateJson\(\{ artworkId, catalogUrl: await signPrivate\(/);
});

test("postgres error classification reads SQLSTATE and message tokens only", async () => {
  const errors = await read("supabase/functions/_shared/postgres-errors.ts");
  assert.match(errors, /sqlstate: "22023"/);
  assert.match(errors, /sqlstate: "42501"/);
  assert.match(errors, /sqlstate: "P0001"/);
  assert.match(errors, /const sqlstate = typeof error\.code === "string"/);
  assert.match(errors, /const message = typeof error\.message === "string"/);
  assert.match(errors, /sqlstate === "" \|\| sqlstate === entry\.sqlstate/);
  assert.match(errors, /\(\^\|\[\^a-z0-9_\]\)\$\{token\}\(\[\^a-z0-9_\]\|\$\)/);
  // `details` and `hint` are data-influenced free text and must not classify.
  assert.doesNotMatch(errors, /error\.details \?\? ""/);
  assert.doesNotMatch(errors, /\$\{error\.hint/);
  // The token to HTTP mapping is preserved.
  assert.match(errors, /token: "generation_daily_limit"[^\n]*status: 429/);
  assert.match(errors, /token: "purchase_not_entitled"[^\n]*status: 403/);
  assert.match(errors, /token: "artwork_not_generation_ready"[^\n]*status: 409/);
  assert.match(errors, /token: "invalid_prompt"[^\n]*status: 400/);
});

test("contact submissions are bounded per authenticated account", async () => {
  const inquiry = await read("supabase/functions/submit-inquiry/index.ts");
  assert.match(inquiry, /\{ count: "exact", head: true \}/);
  assert.match(inquiry, /\.eq\("user_id", user\.id\)/);
  assert.match(inquiry, /\(count \?\? 0\) >= 5/);
  assert.match(inquiry, /429, "inquiry_rate_limited"/);
  // The limit is checked before the insert, not after.
  const limit = inquiry.indexOf('429, "inquiry_rate_limited"');
  const insert = inquiry.indexOf('.insert({ user_id: user.id, email: user.email');
  assert.ok(limit > 0 && insert > limit, "the rate limit must precede the insert");
});

test("legacy open-port websocket demo is absent", async () => {
  await assert.rejects(access(new URL("Caddyfile", root)));
  await assert.rejects(access(new URL("examples/websocket/server.ts", root)));
  await assert.rejects(access(new URL("examples/websocket/frontend.tsx", root)));
});
