-- Stable public catalog identifiers, publication integrity, and transactional
-- checkout/generation contracts. Internal relationships continue to use UUIDs;
-- browser/API callers use artworks.catalog_id.

alter table public.artworks add column catalog_id text;

update public.artworks
set catalog_id = case
  when source_sha256 is not null then 'art_' || substr(source_sha256, 1, 20)
  else 'legacy_' || replace(id::text, '-', '')
end
where catalog_id is null;

-- Fail with an actionable message before the unique index is built if legacy
-- data contains duplicate source bytes/catalog identities.
do $$
begin
  if exists (
    select 1 from public.artworks
    where source_sha256 is not null
    group by source_sha256 having count(*) > 1
  ) then
    raise exception 'duplicate_artwork_source_sha256';
  end if;
end;
$$;

alter table public.artworks
  alter column catalog_id set not null,
  add constraint artworks_catalog_id_format check (
    catalog_id ~ '^[a-z0-9][a-z0-9_-]{2,95}$'
  ),
  add constraint artworks_publication_integrity check (
    (not is_listed and published_at is null)
    or (
      rights_approved_at is not null
      and publication_approved_at is not null
      and published_at is not null
      and source_sha256 is not null
      and source_width is not null
      and source_height is not null
      and source_width >= 1024
      and source_width = source_height
      and source_bytes is not null
      and source_bytes > 0
      and source_mime_type in ('image/jpeg', 'image/png')
      and char_length(trim(base_object_key)) > 0
      and char_length(trim(catalog_object_key)) > 0
    )
  );

create unique index artworks_catalog_id_unique_idx on public.artworks (catalog_id);
create unique index artworks_source_sha256_unique_idx on public.artworks (source_sha256)
  where source_sha256 is not null;

alter table public.purchases
  add column artwork_catalog_id text,
  add column artwork_title text;

update public.purchases p
set artwork_catalog_id = a.catalog_id,
    artwork_title = a.title
from public.artworks a
where a.id = p.artwork_id;

alter table public.purchases
  alter column artwork_catalog_id set not null,
  alter column artwork_title set not null,
  add constraint purchases_artwork_catalog_id_fkey
    foreign key (artwork_catalog_id) references public.artworks(catalog_id) on update restrict on delete restrict,
  add constraint purchases_artwork_title_present check (char_length(trim(artwork_title)) between 1 and 160);

drop view if exists public.catalog_artworks;
create view public.catalog_artworks
with (security_invoker = true, security_barrier = true) as
select catalog_id as id, slug, title, description, sale_mode, price_cents, currency, published_at
from public.artworks
where is_listed
  and published_at is not null
  and published_at <= now()
  and rights_approved_at is not null
  and publication_approved_at is not null
  and source_sha256 is not null
  and source_width >= 1024
  and source_height = source_width
  and source_bytes > 0
  and source_mime_type in ('image/jpeg', 'image/png')
  and sold_at is null;
revoke all on public.catalog_artworks from public, anon, authenticated;

drop function if exists public.reserve_artwork(uuid, uuid, uuid, uuid);
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
  v_expires timestamptz := now() + interval '30 minutes';
begin
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
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.artwork_id is distinct from v_art.id
      or v_existing.selected_preview_generation_id is distinct from p_selected_preview_generation_id then
      return query select 'idempotency_conflict', null::uuid, null::timestamptz;
    elsif v_existing.status in ('expired', 'refunded') then
      return query select 'idempotency_expired', null::uuid, v_existing.reservation_expires_at;
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
      and expires_at > now();
    if not found or exists (
      select 1 from public.generations child
      where child.parent_generation_id = p_selected_preview_generation_id
        and child.status = 'succeeded'
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
        return query select 'existing', v_existing.id, v_existing.reservation_expires_at;
      end if;
      return query select 'reserved', null::uuid, v_existing.reservation_expires_at;
      return;
    end if;
  end if;

  insert into public.purchases (
    artwork_id, artwork_catalog_id, artwork_title, user_id, sale_mode,
    amount_cents, currency, reservation_expires_at, idempotency_key,
    selected_preview_generation_id, license_version
  ) values (
    v_art.id, v_art.catalog_id, v_art.title, p_user_id, v_art.sale_mode,
    v_art.price_cents, v_art.currency, v_expires, p_idempotency_key,
    p_selected_preview_generation_id, v_art.license_version
  ) returning id into purchase_id;
  reservation_expires_at := v_expires;
  outcome := 'reserved';
  return next;
end;
$$;

drop function if exists public.settle_purchase_paid(uuid, text, text);
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
  v_purchase public.purchases%rowtype;
  v_art public.artworks%rowtype;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if not found or v_purchase.stripe_checkout_session_id is distinct from p_stripe_checkout_session_id then
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

  select * into v_art from public.artworks where id = v_purchase.artwork_id for update;
  if not found then return 'unknown'; end if;
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
    update public.artworks set sold_at = now(), is_listed = false where id = v_art.id;
  end if;
  return 'paid';
end;
$$;

-- A full refund can arrive before or concurrently with Checkout fulfillment.
-- Lock the purchase and converge both cases on one terminal state instead of
-- branching on a status snapshot previously read by an Edge Function.
drop function if exists public.reconcile_full_refund(uuid, text);
create function public.reconcile_full_refund(
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
  if v_purchase.stripe_payment_intent_id is not null
    and v_purchase.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id then
    return 'payment_intent_mismatch';
  end if;
  if v_purchase.status = 'refunded' then return 'already_refunded'; end if;
  if v_purchase.status = 'paid' then
    update public.purchases
    set status = 'refunded',
        refunded_at = now(),
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_stripe_payment_intent_id)
    where id = v_purchase.id and status = 'paid';
    update public.generations
    set status = 'blocked', allowance_slot = null,
        error_code = 'purchase_refunded', finished_at = now()
    where purchase_id = v_purchase.id and status in ('queued', 'running');
    return 'refunded';
  end if;
  if v_purchase.status in ('reserved', 'pending') then
    update public.purchases
    -- `expired` rows intentionally keep paid_at null. The PaymentIntent is
    -- still recoverable from the persisted Stripe event and its metadata;
    -- avoid occupying the unique PI column before a paid settlement.
    set status = 'expired', expired_at = now()
    where id = v_purchase.id and status in ('reserved', 'pending');
    return 'expired_refunded';
  end if;
  return 'already_expired';
end;
$$;

drop function if exists public.request_generation(uuid, uuid, uuid, uuid, text, text);
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

  select * into v_art from public.artworks where catalog_id = p_catalog_id;
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
      and status = 'paid';
    if not found or v_purchase.entitlement_expires_at <= now() then
      raise exception 'purchase_not_entitled' using errcode = '42501';
    end if;
    v_limit := 4;
    v_phase := 'purchased';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', v_art.id, p_user_id, coalesce(p_purchase_id::text, 'preview')), 0
  ));

  -- The entitlement can be refunded while this request waits for the lineage
  -- lock. Re-lock and revalidate it before claiming an allowance or resolving
  -- any clean source object.
  if p_purchase_id is not null then
    select * into v_purchase
    from public.purchases
    where id = p_purchase_id
      and artwork_id = v_art.id
      and artwork_catalog_id = p_catalog_id
      and user_id = p_user_id
    for update;
    if not found or v_purchase.status <> 'paid'
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
    v_source := v_art.base_object_key;
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
        and status = 'succeeded';
      if not found then
        raise exception 'selected_preview_unavailable' using errcode = '42501';
      end if;
      v_source := v_reference.clean_object_key;
      p_reference_generation_id := v_reference.id;
    else
      v_source := v_art.base_object_key;
    end if;
  else
    select * into v_reference
    from public.generations
    where id = p_reference_generation_id
      and artwork_id = v_art.id
      and user_id = p_user_id
      and status = 'succeeded';
    if not found then
      raise exception 'invalid_generation_reference' using errcode = '42501';
    end if;
    if v_reference.expires_at <= now()
      and v_reference.id is distinct from v_purchase.selected_preview_generation_id then
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

-- PostgreSQL does not allow changing an existing function's return row type;
-- remove the UUID-returning contract before exposing catalog IDs.
drop function if exists public.account_assets(uuid);
create function public.account_assets(p_user_id uuid)
returns table(asset_kind text, artwork_id text, generation_id uuid, object_key text, expires_at timestamptz)
language sql security definer set search_path = '' as $$
  select 'base'::text, a.catalog_id, null::uuid, a.base_object_key, p.entitlement_expires_at
  from public.purchases p join public.artworks a on a.id = p.artwork_id
  where p.user_id = p_user_id and p.status = 'paid' and p.entitlement_expires_at > now()
  union all
  select 'selected_preview'::text, p.artwork_catalog_id, g.id, g.clean_object_key, p.entitlement_expires_at
  from public.purchases p join public.generations g on g.id = p.selected_preview_generation_id
  where p.user_id = p_user_id and p.status = 'paid' and p.entitlement_expires_at > now()
  union all
  select 'purchased_result'::text, p.artwork_catalog_id, g.id, g.clean_object_key, p.entitlement_expires_at
  from public.purchases p join public.generations g on g.purchase_id = p.id
  where p.user_id = p_user_id and p.status = 'paid' and p.entitlement_expires_at > now()
    and g.status = 'succeeded';
$$;

revoke all on function public.reserve_artwork(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_purchase_paid(uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.reconcile_full_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.request_generation(text, uuid, uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.account_assets(uuid) from public, anon, authenticated;
grant execute on function public.reserve_artwork(text, uuid, uuid, uuid) to service_role;
grant execute on function public.settle_purchase_paid(uuid, text, text, integer, text) to service_role;
grant execute on function public.reconcile_full_refund(uuid, text) to service_role;
grant execute on function public.request_generation(text, uuid, uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.account_assets(uuid) to service_role;
