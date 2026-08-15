-- ARTCOVR entitlement-dispute-clock + base-drift reconciliation.
-- Additive only. The frozen deadlock-free settlement path (artwork -> purchase
-- lock order, and the existing restore_purchase_access body) is NOT touched.
--
-- Two real, evidenced gaps this closes:
--   1. Dispute-clock burn: restore_purchase_access (202608140009) clears
--      access_revoked_at but never adjusts entitlement_expires_at. A buyer who
--      wins a chargeback after the 30-day window gets a restored row that is
--      already expired and can no longer generate. We add a paused_at column
--      set at dispute creation, and a separate credit RPC applied *after*
--      restore returns 'restored' -- so the frozen function stays intact and
--      the clock extension is a pure post-step.
--   2. Base-drift fail-closed: account_assets (202608140009) withholds a paid
--      base asset when base_source_sha256_snapshot diverges from the artwork's
--      current source_sha256. That is correct for a *substitution*, but a
--      legitimate re-key/transcode leaves a paid buyer with nothing, forever.
--      We add an operator/watchdog-gated reconcile RPC that re-snapshots the
--      purchase to the artwork's CURRENT verified bytes.
--
-- Everything else initially bundled here (pgvector embeddings, a vision
-- judge, ensemble generation, a preference-study table, more-like-this) has
-- no consumer code and is deliberately deferred until there is product intent
-- and code that uses it; this migration only ships what fixes a live defect.
--
-- No existing NOT NULL / CHECK / unique constraint is removed or weakened.
-- Every new column is nullable; every new function is revoke-all +
-- service_role-only, matching the default-deny posture.

-- ---------------------------------------------------------------------------
-- Entitlement pause timestamp. Set by record_entitlement_pause at the moment
-- access is revoked for a payment_dispute, consumed by apply_dispute_pause_credit
-- at dispute win. Nullable so legacy rows (revoked before this migration) are
-- simply credited zero extension.
-- ---------------------------------------------------------------------------
alter table public.purchases
  add column if not exists entitlement_paused_at timestamptz;

-- ---------------------------------------------------------------------------
-- record_entitlement_pause. Called by the stripe-webhook edge function in the
-- charge.dispute.created branch, right after revoke_purchase_access returns
-- 'revoked'/'already_revoked'. Locks the purchase row only (no artwork touch),
-- so it cannot cycle against the artwork-first settlement lock order.
-- Idempotent: a purchase already carrying a paused_at is a no-op success.
-- ---------------------------------------------------------------------------
create or replace function public.record_entitlement_pause(
  p_purchase_id uuid,
  p_stripe_payment_intent_id text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_purchase public.purchases%rowtype;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if not found then return 'unknown'; end if;
  if v_purchase.stripe_payment_intent_id is null
    or v_purchase.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id then
    return 'mismatch';
  end if;
  if v_purchase.status <> 'paid' then return 'not_paid'; end if;
  if v_purchase.access_revoked_at is null then return 'not_revoked'; end if;
  -- Only a payment_dispute revocation anchors a pause: a refund-then-dispute
  -- ordering must not anchor a clock credit on a non-dispute revocation.
  if v_purchase.access_revocation_reason is distinct from 'payment_dispute' then
    return 'not_dispute';
  end if;
  -- Already paused (re-delivery of dispute.created): nothing to do.
  if v_purchase.entitlement_paused_at is not null then return 'already_paused'; end if;

  update public.purchases
  set entitlement_paused_at = now()
  where id = v_purchase.id
    and status = 'paid'
    and access_revoked_at is not null
    and entitlement_paused_at is null;
  if not found then return 'already_paused'; end if;
  return 'paused';
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_dispute_pause_credit. Called by the stripe-webhook edge function in the
-- charge.dispute.closed (won) branch, right AFTER restore_purchase_access
-- returns 'restored'. restore cleared access_revoked_at but left
-- entitlement_paused_at in place, so this reads the paused duration, extends
-- entitlement_expires_at by exactly that span, and clears paused_at.
--
-- Guards (every one must hold or it does nothing and returns a safe code):
--   * paid purchase with a matching PaymentIntent identity;
--   * access is no longer revoked (restore already ran) -- otherwise the
--     credit would be applied while access is still withheld;
--   * a paused_at exists (legacy revocations without one credit zero and are
--     a no-op success, so restore-only legacy rows keep working);
--   * extension is clamped to a sane ceiling so a pathological paused_at
--     can never inflate the entitlement arbitrarily.
--
-- Purchase-only lock; cannot cycle settlement. The frozen restore function is
-- not called, replaced, or redefined here.
-- ---------------------------------------------------------------------------
create or replace function public.apply_dispute_pause_credit(
  p_purchase_id uuid,
  p_stripe_payment_intent_id text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_purchase public.purchases%rowtype;
  v_extension interval;
  v_ceiling constant interval := interval '90 days';
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if not found then return 'unknown'; end if;
  if v_purchase.stripe_payment_intent_id is null
    or v_purchase.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id then
    return 'mismatch';
  end if;
  if v_purchase.status <> 'paid' then return 'mismatch'; end if;
  -- restore must have run first. While access is still revoked, extending the
  -- entitlement window is pointless and would mis-state a still-withheld asset.
  if v_purchase.access_revoked_at is not null then return 'restore_pending'; end if;
  if v_purchase.entitlement_expires_at is null then return 'no_entitlement'; end if;

  -- Legacy revocation (paused before this migration, or via a path that never
  -- recorded a pause): there is nothing to credit. Treat as a clean no-op so
  -- the webhook's post-restore step never errors on old rows.
  if v_purchase.entitlement_paused_at is null then return 'no_pause'; end if;

  v_extension := least(
    greatest(now() - v_purchase.entitlement_paused_at, interval '0'),
    v_ceiling
  );

  update public.purchases
  set entitlement_expires_at = v_purchase.entitlement_expires_at + v_extension,
      entitlement_paused_at = null
  where id = v_purchase.id
    and status = 'paid'
    and access_revoked_at is null
    and entitlement_paused_at is not null;
  if not found then return 'no_pause'; end if;
  return 'credited';
end;
$$;

-- ---------------------------------------------------------------------------
-- reconcile_base_drift. Operator/watchdog-gated. When an artwork's clean
-- source bytes are legitimately re-keyed (transcode/re-export), a paid purchase
-- whose base_source_sha256_snapshot no longer matches the current digest is
-- silently withheld by account_assets (fail-closed). This re-snapshots the
-- purchase to the artwork's CURRENT base_object_key + source_sha256 so the
-- buyer keeps receiving a verified clean asset instead of none.
--
-- It refuses to act unless the artwork currently carries a valid square source
-- (>=1024, width = height, non-empty key, real digest), and is a no-op if the
-- snapshot already matches. Purchase-only lock; cannot cycle settlement.
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_base_drift(
  p_purchase_id uuid
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_purchase public.purchases%rowtype;
  v_art public.artworks%rowtype;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if not found then return 'unknown'; end if;
  if v_purchase.status <> 'paid' then return 'not_paid'; end if;

  select * into v_art
  from public.artworks
  where id = v_purchase.artwork_id;
  if not found then return 'unknown'; end if;
  -- Refuse to re-snapshot onto an artwork that is not currently a verified
  -- clean square source: drifting the snapshot to garbage would be worse than
  -- withholding.
  if v_art.source_sha256 is null
    or v_art.base_object_key is null
    or btrim(v_art.base_object_key) = ''
    or v_art.source_width is null or v_art.source_width < 1024
    or v_art.source_width is distinct from v_art.source_height then
    return 'artwork_not_ready';
  end if;

  if v_purchase.base_source_sha256_snapshot is not null
    and v_purchase.base_source_sha256_snapshot = v_art.source_sha256
    and v_purchase.base_object_key_snapshot = v_art.base_object_key then
    return 'already_aligned';
  end if;

  update public.purchases
  set base_object_key_snapshot = v_art.base_object_key,
      base_source_sha256_snapshot = v_art.source_sha256
  where id = v_purchase.id
    and status = 'paid';
  if not found then return 'not_paid'; end if;
  return 'reconciled';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only; browser roles get nothing (default-deny posture).
-- ---------------------------------------------------------------------------
revoke all on function public.record_entitlement_pause(uuid, text)
  from public, anon, authenticated;
revoke all on function public.apply_dispute_pause_credit(uuid, text)
  from public, anon, authenticated;
revoke all on function public.reconcile_base_drift(uuid)
  from public, anon, authenticated;

grant execute on function public.record_entitlement_pause(uuid, text) to service_role;
grant execute on function public.apply_dispute_pause_credit(uuid, text) to service_role;
grant execute on function public.reconcile_base_drift(uuid) to service_role;
