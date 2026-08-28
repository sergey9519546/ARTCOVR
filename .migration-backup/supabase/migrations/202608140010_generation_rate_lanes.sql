-- Generation admission lanes. Every earlier migration is already applied to
-- the live project; this pass replaces public.request_generation in full and
-- changes nothing else.
--
-- 202608130008 admitted every request through a single project-wide bucket
-- that ran unconditionally after the entitlement check and counted *every*
-- generations row in the window. Two defects follow from that:
--   * one shared budget across all accounts means a valid paid entitlement is
--     refused whenever free-tier previews have filled the bucket, and
--     unverified magic-link sign-up makes holding it full continuously cheap;
--   * generations rows are never deleted -- release_generation_allowance only
--     flips status and nulls allowance_slot -- so 'blocked', 'failed' and
--     'timed_out' attempts kept consuming a budget they never spent at the
--     provider.
--
-- The replacement splits admission into two lanes. Free previews keep the
-- original bucket under the original advisory key with the original
-- 4-per-minute bound, and it still counts purchased work, so project-wide
-- throughput stays bounded exactly as before. Purchased calls take a separate
-- reserved lane under their own advisory key, itself bounded at four per
-- minute. Both lanes now count only ('queued', 'running', 'succeeded').
--
-- Lock ordering is unchanged and cannot cycle: a caller takes exactly one of
-- the two global keys, then the per-user key, then the per-artwork key, and
-- never holds both global keys at once.
--
-- Per-account limits (6 per 10 minutes, 24 per day) are untouched and still
-- bind preview and purchased calls alike, as does every entitlement, artwork
-- readiness, reference and allowance-slot check. Both lanes still raise
-- 'generation_global_rate_limited' with SQLSTATE P0001, so the Edge Function
-- mapping in supabase/functions/_shared/postgres-errors.ts is unchanged.

create or replace function public.request_generation(
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

  -- Two admission lanes. Free previews keep the original project-wide bucket;
  -- entitled work has its own, so free-tier traffic can never spend a paying
  -- customer's budget. Only rows that represent real consumed work count in
  -- either lane: rows are never deleted (release_generation_allowance only
  -- flips status and nulls allowance_slot), so 'blocked', 'failed' and
  -- 'timed_out' attempts must not keep holding budget they already gave back.
  if p_purchase_id is null then
    -- Start conservatively below the model's launch-tier request ceiling. This
    -- protects the entire project even when many accounts request at once, and
    -- still counts purchased work so total throughput stays bounded.
    perform pg_advisory_xact_lock(hashtextextended('generation-global-rate', 0));
    if (
      select count(*) from public.generations
      where created_at > now() - interval '1 minute'
        and status in ('queued', 'running', 'succeeded')
    ) >= 4 then
      raise exception 'generation_global_rate_limited' using errcode = 'P0001';
    end if;
  else
    -- The entitled lane is reserved, not unbounded: at most four purchased
    -- attempts per minute across the project. No single account can occupy it,
    -- because the per-account limits below still apply to purchased calls.
    perform pg_advisory_xact_lock(hashtextextended('generation-purchased-rate', 0));
    if (
      select count(*) from public.generations
      where created_at > now() - interval '1 minute'
        and purchase_id is not null
        and status in ('queued', 'running', 'succeeded')
    ) >= 4 then
      raise exception 'generation_global_rate_limited' using errcode = 'P0001';
    end if;
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

revoke all on function public.request_generation(text, uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;

grant execute on function public.request_generation(text, uuid, uuid, uuid, text, text, boolean) to service_role;
