create or replace function public.reserve_artwork(
  p_artwork_id uuid,
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
  v_expires timestamptz := now() + interval '30 minutes';
begin
  select * into v_existing from public.purchases
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return query select 'existing', v_existing.id, v_existing.reservation_expires_at;
    return;
  end if;

  select * into v_art from public.artworks where id = p_artwork_id for update;
  if not found or not v_art.is_listed or v_art.published_at is null or v_art.published_at > now()
    or v_art.rights_approved_at is null or v_art.publication_approved_at is null then
    return query select 'unavailable', null::uuid, null::timestamptz;
    return;
  end if;
  if v_art.sale_mode = 'exclusive' and v_art.sold_at is not null then
    return query select 'sold', null::uuid, null::timestamptz;
    return;
  end if;

  if p_selected_preview_generation_id is not null then
    select * into v_selected from public.generations
    where id = p_selected_preview_generation_id and artwork_id = v_art.id and user_id = p_user_id
      and phase = 'preview' and status = 'succeeded' and expires_at > now();
    if not found or exists (
      select 1 from public.generations child
      where child.parent_generation_id is not distinct from p_selected_preview_generation_id
        and child.status = 'succeeded'
    ) then raise exception 'invalid_selected_preview' using errcode = '42501'; end if;
  end if;

  if v_art.sale_mode = 'exclusive' then
    select * into v_existing from public.purchases
    where artwork_id = v_art.id and sale_mode = 'exclusive' and status in ('reserved', 'pending')
    order by created_at desc limit 1 for update;
    if found and v_existing.reservation_expires_at <= now() then
      return query select 'expired_pending', v_existing.id, v_existing.reservation_expires_at;
      return;
    elsif found then
      if v_existing.user_id = p_user_id then
        return query select 'existing', v_existing.id, v_existing.reservation_expires_at;
      else
        return query select 'reserved', null::uuid, v_existing.reservation_expires_at;
      end if;
      return;
    end if;
  end if;

  insert into public.purchases (
    artwork_id, user_id, sale_mode, amount_cents, currency, reservation_expires_at, idempotency_key, selected_preview_generation_id, license_version
  ) values (
    v_art.id, p_user_id, v_art.sale_mode, v_art.price_cents, v_art.currency, v_expires, p_idempotency_key, p_selected_preview_generation_id, v_art.license_version
  ) returning id into purchase_id;
  reservation_expires_at := v_expires;
  outcome := 'reserved';
  return next;
end;
$$;

create or replace function public.attach_checkout_session(
  p_purchase_id uuid, p_user_id uuid, p_stripe_checkout_session_id text
)
returns boolean language sql security definer set search_path = '' as $$
  with updated as (
    update public.purchases
    set stripe_checkout_session_id = p_stripe_checkout_session_id, status = 'pending'
    where id = p_purchase_id and user_id = p_user_id and status = 'reserved'
      and stripe_checkout_session_id is null and reservation_expires_at > now()
    returning 1
  ) select exists(select 1 from updated);
$$;

create or replace function public.settle_purchase_paid(
  p_purchase_id uuid, p_stripe_checkout_session_id text, p_stripe_payment_intent_id text
)
returns text language plpgsql security definer set search_path = '' as $$
declare v_purchase public.purchases%rowtype; v_art public.artworks%rowtype;
begin
  select a.* into v_art from public.artworks a join public.purchases p on p.artwork_id = a.id
  where p.id = p_purchase_id for update of a;
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found or v_purchase.stripe_checkout_session_id is distinct from p_stripe_checkout_session_id then return 'unknown'; end if;
  if v_purchase.status = 'paid' then return 'already_paid'; end if;
  if v_art.sale_mode = 'exclusive' and v_art.sold_at is not null then return 'exclusive_conflict'; end if;
  update public.purchases set status = 'paid', paid_at = now(), entitlement_expires_at = now() + interval '30 days', stripe_payment_intent_id = p_stripe_payment_intent_id where id = v_purchase.id;
  if v_art.sale_mode = 'exclusive' then
    update public.artworks set sold_at = now(), is_listed = false where id = v_art.id;
  end if;
  return 'paid';
end;
$$;

create or replace function public.expire_purchase(p_purchase_id uuid, p_stripe_checkout_session_id text)
returns boolean language sql security definer set search_path = '' as $$
  with updated as (
    update public.purchases set status = 'expired', expired_at = now()
    where id = p_purchase_id and stripe_checkout_session_id is not distinct from p_stripe_checkout_session_id
      and status in ('reserved', 'pending')
    returning 1
  ) select exists(select 1 from updated);
$$;

create or replace function public.request_generation(
  p_artwork_id uuid,
  p_user_id uuid,
  p_purchase_id uuid,
  p_reference_generation_id uuid,
  p_prompt text,
  p_openai_model text
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
  select * into v_art from public.artworks where id = p_artwork_id;
  if not found or v_art.rights_approved_at is null or v_art.publication_approved_at is null
    or v_art.published_at is null or v_art.published_at > now()
    or (p_purchase_id is null and (not v_art.is_listed or v_art.sold_at is not null)) then
    raise exception 'artwork_not_generation_ready' using errcode = '42501';
  end if;
  if p_purchase_id is null then
    v_limit := 2;
    v_phase := 'preview';
  else
    select * into v_purchase from public.purchases
    where id = p_purchase_id and artwork_id = p_artwork_id and user_id = p_user_id and status = 'paid';
    if not found or v_purchase.entitlement_expires_at <= now() then raise exception 'purchase_not_entitled' using errcode = '42501'; end if;
    v_limit := 4;
    v_phase := 'purchased';
  end if;

  if p_reference_generation_id is null then
    if p_purchase_id is null and exists (
      select 1 from public.generations current_preview
      where current_preview.artwork_id = p_artwork_id and current_preview.user_id = p_user_id
        and current_preview.phase = 'preview' and current_preview.status = 'succeeded'
        and not exists (
          select 1 from public.generations child
          where child.parent_generation_id is not distinct from current_preview.id and child.status = 'succeeded'
        )
    ) then raise exception 'preview_current_reference_required' using errcode = '22023'; end if;
    if p_purchase_id is not null and v_purchase.selected_preview_generation_id is not null then
      select * into v_reference from public.generations
      where id = v_purchase.selected_preview_generation_id and user_id = p_user_id and artwork_id = p_artwork_id
        and phase = 'preview' and status = 'succeeded';
      if not found then raise exception 'selected_preview_unavailable' using errcode = '42501'; end if;
      v_source := v_reference.clean_object_key;
      p_reference_generation_id := v_reference.id;
    else
      v_source := v_art.base_object_key;
    end if;
  else
    select * into v_reference from public.generations
    where id = p_reference_generation_id and artwork_id = p_artwork_id and user_id = p_user_id and status = 'succeeded';
    if not found then raise exception 'invalid_generation_reference' using errcode = '42501'; end if;
    if v_reference.expires_at <= now() then raise exception 'generation_reference_expired' using errcode = '42501'; end if;
    if p_purchase_id is null and v_reference.phase <> 'preview' then raise exception 'preview_cannot_reference_purchased_result' using errcode = '42501'; end if;
    if p_purchase_id is not null and v_reference.phase = 'preview' and v_reference.id is distinct from v_purchase.selected_preview_generation_id then
      raise exception 'reference_is_not_selected_preview' using errcode = '42501';
    end if;
    if p_purchase_id is not null and v_reference.phase = 'purchased' and v_reference.purchase_id is distinct from p_purchase_id then
      raise exception 'reference_belongs_to_another_purchase' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.generations child
      where child.parent_generation_id is not distinct from v_reference.id and child.status = 'succeeded'
    ) then raise exception 'reference_is_not_current' using errcode = '22023'; end if;
    v_source := v_reference.clean_object_key;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_artwork_id, p_user_id, coalesce(p_purchase_id::text, 'preview')), 0));
  select slot::smallint into v_slot
  from generate_series(1, v_limit) as slot
  where not exists (
    select 1 from public.generations g
    where g.artwork_id = p_artwork_id and g.user_id = p_user_id
      and g.purchase_id is not distinct from p_purchase_id
      and g.allowance_slot = slot
      and g.status in ('queued', 'running', 'succeeded')
  ) order by slot limit 1;
  if v_slot is null then raise exception 'generation_allowance_exhausted' using errcode = 'P0001'; end if;

  insert into public.generations (
    artwork_id, user_id, purchase_id, parent_generation_id, phase, allowance_slot,
    prompt, source_object_key, openai_model, expires_at
  ) values (
    p_artwork_id, p_user_id, p_purchase_id, p_reference_generation_id, v_phase, v_slot,
    trim(p_prompt), v_source, p_openai_model, now() + case when p_purchase_id is null then interval '7 days' else interval '30 days' end
  ) returning id into generation_id;
  allowance_slot := v_slot;
  source_object_key := v_source;
  return next;
end;
$$;

create or replace function public.claim_generation(p_generation_id uuid, p_user_id uuid)
returns table(generation_id uuid, artwork_id uuid, purchase_id uuid, prompt text, source_object_key text, openai_model text)
language sql security definer set search_path = '' as $$
  update public.generations
  set status = 'running', started_at = now()
  where id = p_generation_id and user_id = p_user_id and status = 'queued'
  returning id, artwork_id, purchase_id, prompt, source_object_key, openai_model;
$$;

create or replace function public.complete_generation(
  p_generation_id uuid, p_preview_object_key text, p_clean_object_key text,
  p_openai_request_id text, p_usage jsonb
)
returns boolean language sql security definer set search_path = '' as $$
  with updated as (
    update public.generations
    set status = 'succeeded', preview_object_key = p_preview_object_key,
        clean_object_key = p_clean_object_key, openai_request_id = p_openai_request_id,
        usage = coalesce(p_usage, '{}'::jsonb), finished_at = now()
    where id = p_generation_id and status = 'running'
    returning 1
  ) select exists(select 1 from updated);
$$;

create or replace function public.release_generation_allowance(p_generation_id uuid, p_status public.generation_status, p_error_code text)
returns boolean language sql security definer set search_path = '' as $$
  with updated as (
    update public.generations
    set status = p_status, allowance_slot = null, error_code = p_error_code, finished_at = now()
    where id = p_generation_id and status in ('queued', 'running')
      and p_status in ('blocked', 'failed', 'timed_out')
    returning 1
  ) select exists(select 1 from updated);
$$;

create or replace function public.reap_stale_generations(p_before timestamptz default now() - interval '145 seconds')
returns table(generation_id uuid)
language sql security definer set search_path = '' as $$
  update public.generations
  set status = 'timed_out', allowance_slot = null, error_code = 'watchdog_timeout', finished_at = now()
  where status in ('queued', 'running')
    and coalesce(started_at, created_at) < p_before
  returning id;
$$;

create or replace function public.account_assets(p_user_id uuid)
returns table(asset_kind text, artwork_id uuid, generation_id uuid, object_key text, expires_at timestamptz)
language sql security definer set search_path = '' as $$
  select 'base'::text, a.id, null::uuid, a.base_object_key, p.entitlement_expires_at
  from public.purchases p join public.artworks a on a.id = p.artwork_id
  where p.user_id = p_user_id and p.status = 'paid' and p.entitlement_expires_at > now()
  union all
  select 'selected_preview'::text, p.artwork_id, g.id, g.clean_object_key, p.entitlement_expires_at
  from public.purchases p join public.generations g on g.id = p.selected_preview_generation_id
  where p.user_id = p_user_id and p.status = 'paid' and p.entitlement_expires_at > now()
  union all
  select 'purchased_result'::text, g.artwork_id, g.id, g.clean_object_key, p.entitlement_expires_at
  from public.purchases p join public.generations g on g.purchase_id = p.id
  where p.user_id = p_user_id and p.status = 'paid' and p.entitlement_expires_at > now()
    and g.status = 'succeeded';
$$;

create or replace function public.refund_purchase(p_purchase_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_purchase public.purchases%rowtype;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found or v_purchase.status <> 'paid' then return false; end if;
  update public.purchases set status = 'refunded', refunded_at = now() where id = p_purchase_id;
  -- An exclusive work remains delisted after refund; unused future generations are disabled.
  update public.generations set status = 'blocked', allowance_slot = null, error_code = 'purchase_refunded', finished_at = now()
  where purchase_id = p_purchase_id and status in ('queued', 'running');
  return true;
end;
$$;

revoke all on function public.reserve_artwork(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.attach_checkout_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.settle_purchase_paid(uuid, text, text) from public, anon, authenticated;
revoke all on function public.expire_purchase(uuid, text) from public, anon, authenticated;
revoke all on function public.request_generation(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_generation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_generation(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.release_generation_allowance(uuid, public.generation_status, text) from public, anon, authenticated;
revoke all on function public.reap_stale_generations(timestamptz) from public, anon, authenticated;
revoke all on function public.refund_purchase(uuid) from public, anon, authenticated;
revoke all on function public.account_assets(uuid) from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
