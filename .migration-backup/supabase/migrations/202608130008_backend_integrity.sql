-- Immutable purchase assets, durable access revocation, consistent lock order,
-- and user-scoped generation admission control.

alter table public.purchases
  add column base_object_key_snapshot text,
  add column base_source_sha256_snapshot text,
  add column stripe_checkout_expires_at timestamptz,
  add column access_revoked_at timestamptz,
  add column access_revocation_reason text;

update public.purchases p
set base_object_key_snapshot = a.base_object_key,
    base_source_sha256_snapshot = a.source_sha256,
    stripe_checkout_expires_at = p.reservation_expires_at
from public.artworks a
where a.id = p.artwork_id;

alter table public.purchases
  alter column base_object_key_snapshot set not null,
  alter column stripe_checkout_expires_at set not null,
  add constraint purchases_base_object_key_snapshot_present
    check (char_length(trim(base_object_key_snapshot)) > 0),
  add constraint purchases_base_source_sha256_snapshot_format
    check (
      base_source_sha256_snapshot is null
      or base_source_sha256_snapshot ~ '^[0-9a-f]{64}$'
    ),
  add constraint purchases_access_revocation_complete
    check (
      (access_revoked_at is null and access_revocation_reason is null)
      or (
        access_revoked_at is not null
        and char_length(trim(access_revocation_reason)) between 1 and 120
      )
    );

create index purchases_artwork_catalog_id_idx
  on public.purchases (artwork_catalog_id);
create index artworks_rights_approved_by_idx
  on public.artworks (rights_approved_by)
  where rights_approved_by is not null;
create index artworks_publication_approved_by_idx
  on public.artworks (publication_approved_by)
  where publication_approved_by is not null;
create index purchases_selected_preview_generation_id_idx
  on public.purchases (selected_preview_generation_id)
  where selected_preview_generation_id is not null;
create index purchases_active_entitlement_owner_idx
  on public.purchases (user_id, entitlement_expires_at desc)
  where status = 'paid' and access_revoked_at is null;
create index generations_parent_active_idx
  on public.generations (parent_generation_id)
  where parent_generation_id is not null
    and status in ('queued', 'running', 'succeeded');
create index generations_parent_generation_id_idx
  on public.generations (parent_generation_id)
  where parent_generation_id is not null;
create index generations_created_at_idx
  on public.generations (created_at desc);
create index analytics_events_user_idx
  on public.analytics_events (user_id, occurred_at desc)
  where user_id is not null;
create index stripe_events_unprocessed_idx
  on public.stripe_events (received_at)
  where processed_at is null;

drop function if exists public.reserve_artwork(text, uuid, uuid, uuid);
create function public.reserve_artwork(
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
  -- Freeze a one-minute transport margin once so retries have identical input.
  v_expires timestamptz := date_trunc('second', clock_timestamp()) + interval '31 minutes';
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
    elsif v_existing.status in ('expired', 'refunded') then
      return query select 'idempotency_expired', null::uuid, v_existing.reservation_expires_at;
    elsif v_existing.status in ('reserved', 'pending')
      and v_existing.reservation_expires_at <= now() then
      return query select 'expired_pending', v_existing.id, v_existing.reservation_expires_at;
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
      end if;
      return query select 'reserved', null::uuid, v_existing.reservation_expires_at;
      return;
    end if;
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

create or replace function public.attach_checkout_session(
  p_purchase_id uuid,
  p_user_id uuid,
  p_stripe_checkout_session_id text,
  p_reservation_expires_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.purchases
    set stripe_checkout_session_id = p_stripe_checkout_session_id,
        status = 'pending',
        reservation_expires_at = stripe_checkout_expires_at
    where id = p_purchase_id
      and user_id = p_user_id
      and status in ('reserved', 'pending')
      and (
        stripe_checkout_session_id is null
        or stripe_checkout_session_id = p_stripe_checkout_session_id
      )
      and stripe_checkout_expires_at = p_reservation_expires_at
      and stripe_checkout_expires_at > now()
    returning 1
  )
  select exists(select 1 from updated);
$$;

drop function if exists public.settle_purchase_paid(uuid, text, text, integer, text);
create function public.settle_purchase_paid(
  p_purchase_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_cents integer,
  p_currency text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_artwork_id uuid;
  v_purchase public.purchases%rowtype;
  v_art public.artworks%rowtype;
begin
  -- Read the relationship without a row lock, then use the same artwork ->
  -- purchase lock order as reserve_artwork. Revalidate after both are locked.
  select artwork_id into v_artwork_id
  from public.purchases
  where id = p_purchase_id;
  if not found then return 'unknown'; end if;

  select * into v_art
  from public.artworks
  where id = v_artwork_id
  for update;
  if not found then return 'unknown'; end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if not found or v_purchase.artwork_id is distinct from v_art.id
    or v_purchase.stripe_checkout_session_id is distinct from p_stripe_checkout_session_id then
    return 'unknown';
  end if;
  if v_purchase.amount_cents is distinct from p_amount_cents
    or lower(v_purchase.currency) is distinct from lower(p_currency) then
    return 'amount_mismatch';
  end if;
  if p_stripe_payment_intent_id is null or char_length(p_stripe_payment_intent_id) < 3 then
    return 'invalid_payment_intent';
  end if;
  if v_purchase.status = 'paid' then return 'already_paid'; end if;
  if v_purchase.status = 'refunded' then return 'refunded'; end if;
  if v_purchase.status not in ('reserved', 'pending') then return 'invalid_state'; end if;
  if v_art.sale_mode = 'exclusive' and v_art.sold_at is not null then
    return 'exclusive_conflict';
  end if;

  update public.purchases
  set status = 'paid',
      paid_at = now(),
      entitlement_expires_at = now() + interval '30 days',
      stripe_payment_intent_id = p_stripe_payment_intent_id
  where id = v_purchase.id and status in ('reserved', 'pending');
  if not found then return 'invalid_state'; end if;

  if v_art.sale_mode = 'exclusive' then
    update public.artworks
    set sold_at = now(), is_listed = false
    where id = v_art.id;
  end if;
  return 'paid';
end;
$$;

create function public.revoke_purchase_access(
  p_purchase_id uuid,
  p_stripe_payment_intent_id text,
  p_reason text
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
  if v_purchase.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id then
    return 'payment_intent_mismatch';
  end if;
  if v_purchase.status <> 'paid' then return 'not_paid'; end if;
  if v_purchase.access_revoked_at is not null then return 'already_revoked'; end if;
  if char_length(trim(p_reason)) not between 1 and 120 then return 'invalid_reason'; end if;

  update public.purchases
  set access_revoked_at = now(),
      access_revocation_reason = trim(p_reason)
  where id = v_purchase.id
    and status = 'paid'
    and access_revoked_at is null;
  update public.generations
  set status = 'blocked',
      allowance_slot = null,
      error_code = 'purchase_access_revoked',
      finished_at = now()
  where purchase_id = v_purchase.id
    and status in ('queued', 'running');
  return 'revoked';
end;
$$;

drop function if exists public.request_generation(text, uuid, uuid, uuid, text, text, boolean);
create function public.request_generation(
  p_catalog_id text,
  p_user_id uuid,
  p_purchase_id uuid,
  p_reference_generation_id uuid,
  p_prompt text,
  p_openai_model text,
  p_reset_to_base boolean default false
)
returns table(generation_id uuid, allowance_slot smallint, source_object_key text)
language plpgsql security definer set search_path = '' as $$
declare
  v_art public.artworks%rowtype;
  v_purchase public.purchases%rowtype;
  v_reference public.generations%rowtype;
  v_limit smallint;
  v_phase public.generation_phase;
  v_slot smallint;
  v_source text;
begin
  if char_length(trim(p_prompt)) < 1 or char_length(p_prompt) > 12000 then
    raise exception 'invalid_prompt' using errcode = '22023';
  end if;
  if p_reset_to_base and p_reference_generation_id is not null then
    raise exception 'reset_reference_conflict' using errcode = '22023';
  end if;

  select * into v_art
  from public.artworks
  where catalog_id = p_catalog_id;
  if not found or v_art.rights_approved_at is null or v_art.publication_approved_at is null
    or v_art.published_at is null or v_art.published_at > now()
    or v_art.source_sha256 is null or v_art.source_width is null
    or v_art.source_height is null or v_art.source_width < 1024
    or v_art.source_width is distinct from v_art.source_height
    or v_art.source_bytes is null or v_art.source_bytes <= 0
    or v_art.source_mime_type not in ('image/jpeg', 'image/png')
    or (p_purchase_id is null and (not v_art.is_listed or v_art.sold_at is not null)) then
    raise exception 'artwork_not_generation_ready' using errcode = '42501';
  end if;

  if p_purchase_id is null then
    v_limit := 2;
    v_phase := 'preview';
  else
    select * into v_purchase
    from public.purchases
    where id = p_purchase_id
      and artwork_id = v_art.id
      and artwork_catalog_id = p_catalog_id
      and user_id = p_user_id
      and status = 'paid'
      and access_revoked_at is null;
    if not found or v_purchase.entitlement_expires_at <= now() then
      raise exception 'purchase_not_entitled' using errcode = '42501';
    end if;
    v_limit := 4;
    v_phase := 'purchased';
  end if;

  -- Start conservatively below the model's launch-tier request ceiling. This
  -- protects the entire project even when many accounts request at once.
  perform pg_advisory_xact_lock(hashtextextended('generation-global-rate', 0));
  if (
    select count(*) from public.generations
    where created_at > now() - interval '1 minute'
  ) >= 4 then
    raise exception 'generation_global_rate_limited' using errcode = 'P0001';
  end if;

  -- One user lock makes the rolling attempt limit concurrency-safe across art.
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'generation-user-rate', p_user_id), 0
  ));
  if (
    select count(*) from public.generations
    where user_id = p_user_id and created_at > now() - interval '10 minutes'
  ) >= 6 then
    raise exception 'generation_rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.generations
    where user_id = p_user_id and created_at > now() - interval '24 hours'
  ) >= 24 then
    raise exception 'generation_daily_limit' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', v_art.id, p_user_id, coalesce(p_purchase_id::text, 'preview')), 0
  ));

  if p_purchase_id is not null then
    select * into v_purchase
    from public.purchases
    where id = p_purchase_id
      and artwork_id = v_art.id
      and artwork_catalog_id = p_catalog_id
      and user_id = p_user_id
    for update;
    if not found or v_purchase.status <> 'paid'
      or v_purchase.access_revoked_at is not null
      or v_purchase.entitlement_expires_at <= now() then
      raise exception 'purchase_not_entitled' using errcode = '42501';
    end if;
  end if;

  if exists (
    select 1 from public.generations active
    where active.artwork_id = v_art.id
      and active.user_id = p_user_id
      and active.purchase_id is not distinct from p_purchase_id
      and active.status in ('queued', 'running')
  ) then
    raise exception 'generation_in_progress' using errcode = 'P0001';
  end if;

  if p_reset_to_base then
    v_source := case
      when p_purchase_id is null then v_art.base_object_key
      else v_purchase.base_object_key_snapshot
    end;
  elsif p_reference_generation_id is null then
    if p_purchase_id is null and exists (
      select 1 from public.generations current_preview
      where current_preview.artwork_id = v_art.id
        and current_preview.user_id = p_user_id
        and current_preview.phase = 'preview'
        and current_preview.status = 'succeeded'
        and not exists (
          select 1 from public.generations child
          where child.parent_generation_id = current_preview.id
            and child.status in ('queued', 'running', 'succeeded')
        )
    ) then
      raise exception 'preview_current_reference_required' using errcode = '22023';
    end if;
    if p_purchase_id is not null and v_purchase.selected_preview_generation_id is not null then
      select * into v_reference
      from public.generations
      where id = v_purchase.selected_preview_generation_id
        and user_id = p_user_id
        and artwork_id = v_art.id
        and phase = 'preview'
        and status = 'succeeded'
        and clean_object_key is not null;
      if not found then
        raise exception 'selected_preview_unavailable' using errcode = '42501';
      end if;
      v_source := v_reference.clean_object_key;
      p_reference_generation_id := v_reference.id;
    elsif p_purchase_id is not null then
      v_source := v_purchase.base_object_key_snapshot;
    else
      v_source := v_art.base_object_key;
    end if;
  else
    select * into v_reference
    from public.generations
    where id = p_reference_generation_id
      and artwork_id = v_art.id
      and user_id = p_user_id
      and status = 'succeeded'
      and clean_object_key is not null;
    if not found then
      raise exception 'invalid_generation_reference' using errcode = '42501';
    end if;
    if v_reference.expires_at <= now()
      and (p_purchase_id is null
        or v_reference.id is distinct from v_purchase.selected_preview_generation_id) then
      raise exception 'generation_reference_expired' using errcode = '42501';
    end if;
    if p_purchase_id is null and v_reference.phase <> 'preview' then
      raise exception 'preview_cannot_reference_purchased_result' using errcode = '42501';
    end if;
    if p_purchase_id is not null and v_reference.phase = 'preview'
      and v_reference.id is distinct from v_purchase.selected_preview_generation_id then
      raise exception 'reference_is_not_selected_preview' using errcode = '42501';
    end if;
    if p_purchase_id is not null and v_reference.phase = 'purchased'
      and v_reference.purchase_id is distinct from p_purchase_id then
      raise exception 'reference_belongs_to_another_purchase' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.generations child
      where child.parent_generation_id = v_reference.id
        and child.status in ('queued', 'running', 'succeeded')
    ) then
      raise exception 'reference_is_not_current' using errcode = '22023';
    end if;
    v_source := v_reference.clean_object_key;
  end if;

  select slot::smallint into v_slot
  from generate_series(1, v_limit) as slot
  where not exists (
    select 1 from public.generations g
    where g.artwork_id = v_art.id
      and g.user_id = p_user_id
      and g.purchase_id is not distinct from p_purchase_id
      and g.allowance_slot = slot
      and g.status in ('queued', 'running', 'succeeded')
  )
  order by slot
  limit 1;
  if v_slot is null then
    raise exception 'generation_allowance_exhausted' using errcode = 'P0001';
  end if;

  insert into public.generations (
    artwork_id, user_id, purchase_id, parent_generation_id, phase, allowance_slot,
    prompt, source_object_key, openai_model, expires_at
  ) values (
    v_art.id, p_user_id, p_purchase_id, p_reference_generation_id, v_phase, v_slot,
    trim(p_prompt), v_source, p_openai_model,
    now() + case when p_purchase_id is null then interval '7 days' else interval '30 days' end
  ) returning id into generation_id;
  allowance_slot := v_slot;
  source_object_key := v_source;
  return next;
end;
$$;

drop function if exists public.account_assets(uuid);
create function public.account_assets(p_user_id uuid)
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

drop function if exists public.reap_stale_generations(timestamptz);
create function public.reap_stale_generations(
  p_before timestamptz default now() - interval '135 seconds'
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
revoke all on function public.attach_checkout_session(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.settle_purchase_paid(uuid, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.revoke_purchase_access(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.request_generation(text, uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.account_assets(uuid)
  from public, anon, authenticated;
revoke all on function public.reap_stale_generations(timestamptz)
  from public, anon, authenticated;

grant execute on function public.reserve_artwork(text, uuid, uuid, uuid) to service_role;
grant execute on function public.attach_checkout_session(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.settle_purchase_paid(uuid, text, text, integer, text) to service_role;
grant execute on function public.revoke_purchase_access(uuid, text, text) to service_role;
grant execute on function public.request_generation(text, uuid, uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.account_assets(uuid) to service_role;
grant execute on function public.reap_stale_generations(timestamptz) to service_role;
