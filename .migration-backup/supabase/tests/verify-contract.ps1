param(
  [string]$MigrationPath = (Join-Path $PSScriptRoot '..\migrations'),
  [string]$FunctionsPath = (Join-Path $PSScriptRoot '..\functions')
)

$ErrorActionPreference = 'Stop'
$migrationFiles = Get-ChildItem -LiteralPath $MigrationPath -Filter '*.sql' | Sort-Object Name
if ($migrationFiles.Count -eq 0) { throw 'Expected at least one migration.' }
$sql = ($migrationFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
$requiredSql = @(
  'create type public.sale_mode',
  'create type public.generation_phase',
  'create table public.artworks',
  'create table public.generations',
  'create table public.purchases',
  'selected_preview_generation_id',
  'license_version',
  'entitlement_expires_at',
  'expires_at timestamptz',
  'create table public.stripe_events',
  'create table public.inquiries',
  'create table public.analytics_events',
  'add column catalog_id text',
  'artworks_publication_integrity',
  'artworks_source_sha256_unique_idx',
  'security_invoker = true',
  'revoke all on public.catalog_artworks from public, anon, authenticated',
  'add column artwork_catalog_id text',
  'add column artwork_title text',
  'p_catalog_id text',
  'p_reset_to_base boolean',
  'idempotency_conflict',
  'selected_preview_conflict',
  'v_existing.artwork_id is distinct from v_art.id',
  'v_purchase.amount_cents is distinct from p_amount_cents',
  'function public.reserve_artwork',
  'function public.attach_checkout_session',
  'p_reservation_expires_at timestamptz',
  'function public.request_generation',
  'function public.reconcile_full_refund',
  'function public.reap_stale_generations',
  'function public.account_assets',
  'base_object_key_snapshot',
  'stripe_checkout_expires_at',
  'access_revoked_at',
  'function public.revoke_purchase_access',
  'generation_global_rate_limited',
  'generation_rate_limited',
  'generation_daily_limit',
  'purchases_artwork_catalog_id_idx',
  'generations_parent_active_idx',
  'generations_parent_generation_id_idx',
  'generations_created_at_idx',
  'artworks_rights_approved_by_idx',
  'analytics_events_user_idx',
  'alter table public.artworks enable row level security',
  'insert into storage.buckets',
  "'art-assets', 'art-assets', false",
  'is not distinct from',
  'add column processed_outcome text',
  'add column reconciliation_attempts integer',
  'add column next_reconcile_at timestamptz',
  'add column reconciliation_blocked_at timestamptz',
  'drop function if exists public.refund_purchase(uuid)',
  'function public.restore_purchase_access',
  'reservation_rate_limited',
  "interval '45 minutes'",
  "interval '180 seconds'"
)
foreach ($needle in $requiredSql) {
  if (-not $sql.ToLowerInvariant().Contains($needle)) {
    throw "Missing SQL contract: $needle"
  }
}

$functionNames = @(
  'generate-image',
  'generation-status',
  'create-checkout',
  'stripe-webhook',
  'submit-inquiry',
  'generation-watchdog',
  'commerce-watchdog',
  'my-images'
)
foreach ($functionName in $functionNames) {
  if (-not (Test-Path -LiteralPath (Join-Path $FunctionsPath "$functionName\index.ts"))) {
    throw "Missing Edge Function: $functionName"
  }
}

$functionSource = (Get-ChildItem -LiteralPath $FunctionsPath -Filter '*.ts' -Recurse |
  ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
$functionNeedles = @(
  'EdgeRuntime.waitUntil',
  '}, 202)',
  'Cache-Control": "private, no-store"',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'Idempotency-Key',
  'artcovr_checkout_',
  '/my-images?checkout=return',
  'partial_refund',
  'retrievePaymentIntent',
  'checkout_amount_mismatch',
  'reconcile_full_refund',
  'p_reset_to_base: body.resetToBase === true',
  'artworkId: purchase.artwork_catalog_id',
  'artworks!purchases_artwork_id_fkey(slug)',
  'artworks!generations_artwork_id_fkey(catalog_id)',
  'charge.dispute.created',
  'charge.dispute.closed',
  'restore_purchase_access',
  'watermark_passthrough',
  'reconciliation_attempts',
  'revoke_purchase_access',
  'payment_method_types[0]',
  'stripe_checkout_expires_at',
  'validateSquareWebp',
  'removePrivate'
)
foreach ($needle in $functionNeedles) {
  if (-not $functionSource.Contains($needle)) {
    throw "Missing function contract: $needle"
  }
}

$corsSource = Get-Content -Raw -LiteralPath (Join-Path $FunctionsPath '_shared\cors.ts')
foreach ($header in @('apikey', 'x-client-info')) {
  if (-not $corsSource.Contains($header)) {
    throw "Missing browser CORS header: $header"
  }
}

$schedulerPath = Join-Path (Split-Path $FunctionsPath -Parent) 'scheduler\generation-watchdog.sql'
if (-not (Test-Path -LiteralPath $schedulerPath)) {
  throw 'Missing generation watchdog scheduler provisioning.'
}
$schedulerSource = Get-Content -Raw -LiteralPath $schedulerPath
foreach ($needle in @('cron.schedule', 'vault.decrypted_secrets', 'x-cron-secret', 'artcovr-commerce-watchdog')) {
  if (-not $schedulerSource.Contains($needle)) {
    throw "Missing scheduler contract: $needle"
  }
}

Write-Output 'Static contract checks passed.'
