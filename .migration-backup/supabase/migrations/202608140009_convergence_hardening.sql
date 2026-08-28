-- Convergent webhook outcomes, reconciliation backoff, reservation flood
-- control, dispute-win restoration, and snapshot-bound base entitlements.
-- Every earlier migration is already applied to the live project; all schema
-- and function changes for this pass live here.

-- Terminal no-op webhook outcomes must be observable. `processing_error` keeps
-- its meaning (an unprocessed event that failed); `processed_outcome` records
-- why a processed event changed nothing.
alter table public.stripe_events
  add column processed_outcome text,
  add constraint stripe_events_processed_outcome_format check (
    processed_outcome is null
    or char_length(trim(processed_outcome)) between 1 and 120
  );

-- Expired-reservation reconciliation retries with exponential backoff so a
-- permanently unreconcilable row cannot occupy the bounded watchdog batch.
alter table public.purchases
  add column reconciliation_attempts integer not null default 0
    check (reconciliation_attempts >= 0),
  add column next_reconcile_at timestamptz,
  add column reconciliation_blocked_at timestamptz;

create index purchases_reconciliation_queue_idx
  on public.purchases (reservation_expires_at)
  where status in ('reserved', 'pending') and reconciliation_blocked_at is null;

-- Superseded by reconcile_full_refund/revoke_purchase_access. It bypassed
-- PaymentIntent identity verification and must not remain callable.
drop function if exists public.refund_purchase(uuid);

-- reserve_artwork replaces the 202608130008 definition with three changes:
--   * every conflict branch returns exactly one row (`return;` after each),
--   * abandoned-reservation and concurrent-reservation flood control,
--   * a 45-minute Checkout window (Stripe's floor is 30 minutes) so an
--     indeterminate transport failure still has a usable recovery window.
create or replace function public.reserve_artwork(
  p_catalog_id text,
  p_user_id uuid,
  p_idempotency_key uuid,
  p_selected_preview_generation_id uuid default null
)
returns table(outcome text, purchase_id uuid, reservation_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_art public.artworks%rowtype;
  v_existing public.purchases%rowtype;
  v_selected public.generations%rowtype;
  -- Stripe Checkout requires an expiry at least 30 minutes in the future.
  -- Freeze the window once so retries have identical input, and keep it well
  -- above that floor: an indeterminate create must stay recoverable by an
  -- idempotent retry before the reservation lapses.
  v_expires timestamptz := date_trunc('second', clock_timestamp()) + interval '45 minutes';
begin
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'checkout-idempotency', p_user_id, p_idempotency_key), 0
  ));

  -- Checkout transactions that touch both tables always lock artwork first.
  select * into v_art
  from public.artworks
  where catalog_id = p_catalog_id
  for update;
  if not found then
    return query select 'unavailable', null::uuid, null::timestamptz;
    return;
  end if;

  select * into v_existing
  from public.purchases
  where user_id = p_user_id and idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.artwork_id is distinct from v_art.id
      or v_existing.selected_preview_generation_id is distinct from p_selected_preview_generation_id then
      return query select 'idempotency_conflict', null::uuid, null::timestamptz;
      return;
    elsif v_existing.status in ('expired', 'refunded') then
      return query select 'idempotency_expired', null::uuid, v_existing.reservation_expires_at;
      return;
    elsif v_existing.status in ('reserved', 'pending')
      and v_existing.reservation_expires_at <= now() then
      return query select 'expired_pending', v_existing.id, v_existing.reservation_expires_at;
      return;
    end if;
    return query select 'existing', v_existing.id, v_existing.reservation_expires_at;
    return;
  end if;

  if not v_art.is_listed or v_art.published_at is null or v_art.published_at > now()
    or v_art.rights_approved_at is null or v_art.publication_approved_at is null
    or v_art.source_sha256 is null or v_art.source_width is null
    or v_art.source_height is null or v_art.source_width < 1024
    or v_art.source_width is distinct from v_art.source_height
    or v_art.source_bytes is null or v_art.source_bytes <= 0
    or v_art.source_mime_type not in ('image/jpeg', 'image/png') then
    return query select 'unavailable', null::uuid, null::timestamptz;
    return;
  end if;
  if v_art.sale_mode = 'exclusive' and v_art.sold_at is not null then
    return query select 'sold', null::uuid, null::timestamptz;
    return;
  end if;

  if p_selected_preview_generation_id is not null then
    select * into v_selected
    from public.generations
    where id = p_selected_preview_generation_id
      and artwork_id = v_art.id
      and user_id = p_user_id
      and phase = 'preview'
      and status = 'succeeded'
      and clean_object_key is not null
      and expires_at > now();
    if not found or exists (
      select 1 from public.generations child
      where child.parent_generation_id = p_selected_preview_generation_id
        and child.status in ('queued', 'running', 'succeeded')
    ) then
      raise exception 'invalid_selected_preview' using errcode = '42501';
    end if;
  end if;

  if v_art.sale_mode = 'exclusive' then
    select * into v_existing
    from public.purchases
    where artwork_id = v_art.id
      and sale_mode = 'exclusive'
      and status in ('reserved', 'pending')
    order by created_at desc
    limit 1
    for update;
    if found and v_existing.reservation_expires_at <= now() then
      return query select 'expired_pending', v_existing.id, v_existing.reservation_expires_at;
      return;
    elsif found then
      if v_existing.user_id = p_user_id then
        if v_existing.selected_preview_generation_id
          is distinct from p_selected_preview_generation_id then
          return query select 'selected_preview_conflict', null::uuid, v_existing.reservation_expires_at;
          return;
        end if;
        return query select 'existing', v_existing.id, v_existing.reservation_expires_at;
        return;
      end if;
      return query select 'reserved', null::uuid, v_existing.reservation_expires_at;
      return;
    end if;
  end if;

  -- Reservation flood control, evaluated only for a genuinely new row so an
  -- idempotent retry is never rejected. An `expired` purchase that never
  -- received a PaymentIntent is an abandoned checkout; a stream of them holds
  -- exclusive inventory hostage.
  --
  -- The thresholds are abuse ceilings, not usage budgets. A label buying a run
  -- of covers in one sitting, and a shopper who browses several checkouts
  -- before deciding, are both legitimate; there is no cancel-reservation path
  -- and the window is 45 minutes, so a tight cap would lock a real buyer out
  -- for up to a day. Twenty abandoned reservations per 24 hours and eight
  -- concurrent live ones still bound automated inventory squatting.
  if (
    select count(*)
    from public.purchases abandoned
    where abandoned.user_id = p_user_id
      and abandoned.status = 'expired'
      and abandoned.stripe_payment_intent_id is null
      and abandoned.created_at > now() - interval '24 hours'
  ) >= 20 then
    return query select 'reservation_rate_limited', null::uuid, null::timestamptz;
    return;
  end if;
  if (
    select count(*)
    from public.purchases live
    where live.user_id = p_user_id
      and live.status in ('reserved', 'pending')
      and live.reservation_expires_at > now()
  ) >= 8 then
    return query select 'reservation_rate_limited', null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.purchases (
    artwork_id, artwork_catalog_id, artwork_title, user_id, sale_mode,
    amount_cents, currency, reservation_expires_at, stripe_checkout_expires_at,
    idempotency_key, selected_preview_generation_id, license_version,
    base_object_key_snapshot, base_source_sha256_snapshot
  ) values (
    v_art.id, v_art.catalog_id, v_art.title, p_user_id, v_art.sale_mode,
    v_art.price_cents, v_art.currency, v_expires, v_expires,
    p_idempotency_key, p_selected_preview_generation_id, v_art.license_version,
    v_art.base_object_key, v_art.source_sha256
  ) returning id into purchase_id;
  reservation_expires_at := v_expires;
  outcome := 'reserved';
  return next;
end;
$$;

-- A dispute resolved in the seller's favour must restore exactly what
-- `charge.dispute.created` revoked, and nothing else. Any other revocation
-- reason, status, or PaymentIntent identity leaves the revocation in place.
create or replace function public.restore_purchase_access(
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
  if v_purchase.status <> 'paid' then return 'mismatch'; end if;
  if v_purchase.access_revoked_at is null then return 'not_revoked'; end if;
  if v_purchase.access_revocation_reason is distinct from 'payment_dispute' then
    return 'mismatch';
  end if;

  update public.purchases
  set access_revoked_at = null,
      access_revocation_reason = null
  where id = v_purchase.id
    and status = 'paid'
    and access_revoked_at is not null
    and access_revocation_reason = 'payment_dispute';
  if not found then return 'mismatch'; end if;
  -- Generations blocked by the revocation are not resurrected: their allowance
  -- slot was already released, so the buyer simply requests a new generation.
  return 'restored';
end;
$$;

-- 202608130008 backfilled base_source_sha256_snapshot from artworks.source_sha256,
-- which is itself nullable, so purchases made before the artwork carried a
-- digest still hold a null snapshot. Fill in every one that can be resolved now
-- before account_assets starts reading the column, so the null branch below is
-- limited to genuinely unresolvable rows.
update public.purchases p
set base_source_sha256_snapshot = a.source_sha256
from public.artworks a
where a.id = p.artwork_id
  and p.base_source_sha256_snapshot is null
  and a.source_sha256 is not null;
-- No `set not null` follows: an artwork that still lacks source_sha256 would
-- abort the migration, and the constraint is not what protects the buyer.

-- account_assets replaces the 202608130008 definition. The immutable base
-- original is released only while the purchase snapshot still matches the
-- artwork's current source bytes; a mismatch omits the row rather than handing
-- out a silently substituted asset.
create or replace function public.account_assets(p_user_id uuid)
returns table(
  asset_kind text,
  purchase_id uuid,
  artwork_id text,
  generation_id uuid,
  object_key text,
  expires_at timestamptz
)
language sql security definer set search_path = '' as $$
  select 'base'::text, p.id, p.artwork_catalog_id, null::uuid,
    p.base_object_key_snapshot, p.entitlement_expires_at
  from public.purchases p
  join public.artworks a
    on a.id = p.artwork_id
   -- Fail closed on a *true* mismatch only. A non-null snapshot that differs
   -- from the artwork's current digest means the bytes at the purchased key
   -- changed, and handing out a substituted asset is worse than withholding
   -- it. A null snapshot is unverifiable legacy data, not evidence of a
   -- substitution; withholding a paid download on that basis, silently, is
   -- the worse failure.
   and (p.base_source_sha256_snapshot is null
        or a.source_sha256 = p.base_source_sha256_snapshot)
  where p.user_id = p_user_id
    and p.status = 'paid'
    and p.access_revoked_at is null
    and p.entitlement_expires_at > now()
  union all
  select 'selected_preview'::text, p.id, p.artwork_catalog_id, g.id,
    g.clean_object_key, p.entitlement_expires_at
  from public.purchases p
  join public.generations g on g.id = p.selected_preview_generation_id
  where p.user_id = p_user_id
    and p.status = 'paid'
    and p.access_revoked_at is null
    and p.entitlement_expires_at > now()
    and g.status = 'succeeded'
    and g.clean_object_key is not null
  union all
  select 'purchased_result'::text, p.id, p.artwork_catalog_id, g.id,
    g.clean_object_key, p.entitlement_expires_at
  from public.purchases p
  join public.generations g on g.purchase_id = p.id
  where p.user_id = p_user_id
    and p.status = 'paid'
    and p.access_revoked_at is null
    and p.entitlement_expires_at > now()
    and g.status = 'succeeded'
    and g.clean_object_key is not null;
$$;

-- The worker budget is provider timeout (<= 130s) + watermark render (15s) +
-- finalization margin (30s). The reaper cutoff must stay above that sum so a
-- still-running job is never reaped out from under its own worker.
create or replace function public.reap_stale_generations(
  p_before timestamptz default now() - interval '180 seconds'
)
returns table(generation_id uuid, artwork_id uuid)
language sql security definer set search_path = '' as $$
  update public.generations
  set status = 'timed_out',
      allowance_slot = null,
      error_code = 'watchdog_timeout',
      finished_at = now()
  where status in ('queued', 'running')
    and coalesce(started_at, created_at) < p_before
  returning id, generations.artwork_id;
$$;

revoke all on function public.reserve_artwork(text, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.restore_purchase_access(uuid, text)
  from public, anon, authenticated;
revoke all on function public.account_assets(uuid)
  from public, anon, authenticated;
revoke all on function public.reap_stale_generations(timestamptz)
  from public, anon, authenticated;

grant execute on function public.reserve_artwork(text, uuid, uuid, uuid) to service_role;
grant execute on function public.restore_purchase_access(uuid, text) to service_role;
grant execute on function public.account_assets(uuid) to service_role;
grant execute on function public.reap_stale_generations(timestamptz) to service_role;
