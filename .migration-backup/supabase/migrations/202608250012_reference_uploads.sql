-- User-supplied reference uploads for image generation.
--
-- Until now every generation source was resolved entirely server-side from
-- owner-approved rows: the artwork's private base object, the purchase's base
-- snapshot, or a prior generation's clean object. This pass adds a *second*
-- input image that the signed-in user supplies, without weakening that rule.
-- The client never names a storage path, a signed URL, a filesystem path or a
-- third-party URL. It POSTs raw bytes to the upload-reference Edge Function,
-- which re-encodes them and writes the only object that will ever exist for
-- that upload; afterwards the client can refer to it only by the opaque row id
-- issued here, and public.request_generation resolves that id back to an object
-- key itself. An id that is not owned by the caller, not finalized, already
-- consumed, expired, or bound to a different artwork resolves to nothing.
--
-- Admission is two-phase on purpose. public.admit_reference_upload counts and
-- inserts the pending row inside one advisory-locked transaction, exactly the
-- way public.request_generation counts and inserts a generation, so the
-- 10-per-hour and 40-per-day per-account bounds cannot be overshot by
-- concurrent requests that each read a stale count. The Edge Function then
-- decodes, re-encodes and stores the bytes and calls
-- public.finalize_reference_upload; anything that fails in between deletes the
-- pending row and the stored object, releasing the allowance and leaving no
-- orphan. A row is therefore usable as a generation reference only once
-- uploaded_at is set.
--
-- Lock order is unchanged and still cannot cycle. request_generation takes one
-- global rate key, then the per-user key, then the per-artwork key, then the
-- purchases row, and only then the reference_uploads row. admit_reference_upload
-- takes a single reference-upload rate key and no other lock;
-- finalize_reference_upload and the purge helper touch one reference_uploads row
-- and nothing else.
--
-- public.request_generation is dropped and recreated rather than replaced:
-- adding the reference_upload_object_key output column changes the function's
-- return type, which CREATE OR REPLACE refuses, and the new p_reference_upload_id
-- parameter would make a surviving 7-argument overload ambiguous. The body below
-- is 202608140010's body verbatim plus the reference-upload resolution; every
-- other admission, entitlement, lineage and allowance rule is untouched.

create table public.reference_uploads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  artwork_id uuid not null references public.artworks(id) on delete restrict,
  object_key text not null unique,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  width integer check (width is null or width between 1 and 1024),
  height integer check (height is null or height between 1 and 1024),
  bytes bigint check (bytes is null or bytes > 0),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  -- A row is either pending (admitted, nothing stored yet) or finalized with a
  -- complete description of the stored WebP. There is no partially described
  -- state a reader would have to guess about.
  check (
    (uploaded_at is null and sha256 is null and width is null and height is null and bytes is null)
    or (uploaded_at is not null and sha256 is not null and width is not null
      and height is not null and bytes is not null)
  ),
  -- Only a finalized upload can be consumed by a generation.
  check (consumed_at is null or uploaded_at is not null)
);

create index reference_uploads_user_created_idx
  on public.reference_uploads (user_id, created_at desc);
create index reference_uploads_expiry_idx
  on public.reference_uploads (expires_at)
  where consumed_at is null;

alter table public.reference_uploads enable row level security;
-- No policies are created. Browser clients never read or write this table; the
-- upload-reference and generate-image Edge Functions use service-role access,
-- which bypasses RLS, so an enabled-but-policy-less table is a deny-all table.
revoke all on public.reference_uploads from public, anon, authenticated;

-- Provenance: which uploaded reference, if any, produced this generation. The
-- reference is deleted when a generation fails, so the link is set null rather
-- than restricting that cleanup.
alter table public.generations
  add column reference_upload_id uuid references public.reference_uploads(id) on delete set null;

create index generations_reference_upload_idx
  on public.generations (reference_upload_id)
  where reference_upload_id is not null;

-- Admits one reference upload attempt for an account and reserves its row.
-- Returns the artwork UUID the upload is bound to, so the Edge Function never
-- has to resolve a public catalog id to a private row itself.
create function public.admit_reference_upload(
  p_user_id uuid,
  p_catalog_id text,
  p_upload_id uuid,
  p_object_key text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_art public.artworks%rowtype;
begin
  if p_upload_id is null or p_object_key is null or char_length(p_object_key) < 1 then
    raise exception 'invalid_reference_upload' using errcode = '22023';
  end if;

  -- The same publication gate request_generation applies. An unapproved,
  -- unpublished or provenance-less work cannot accumulate reference uploads.
  select * into v_art
  from public.artworks
  where catalog_id = p_catalog_id;
  if not found or v_art.rights_approved_at is null or v_art.publication_approved_at is null
    or v_art.published_at is null or v_art.published_at > now()
    or v_art.source_sha256 is null then
    raise exception 'artwork_not_generation_ready' using errcode = '42501';
  end if;

  -- One user lock makes the rolling upload limits concurrency-safe, and the
  -- pending row is inserted in the same transaction as the count, so an
  -- in-flight upload is already visible to the next caller.
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'reference-upload-user-rate', p_user_id), 0
  ));
  if (
    select count(*) from public.reference_uploads
    where user_id = p_user_id and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'reference_upload_rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.reference_uploads
    where user_id = p_user_id and created_at > now() - interval '24 hours'
  ) >= 40 then
    raise exception 'reference_upload_daily_limit' using errcode = 'P0001';
  end if;

  insert into public.reference_uploads (id, user_id, artwork_id, object_key)
  values (p_upload_id, p_user_id, v_art.id, p_object_key);

  return v_art.id;
end;
$$;

-- Records the stored WebP against its pending row. The digest and dimensions
-- describe the re-encoded object, never the bytes the client sent.
create function public.finalize_reference_upload(
  p_upload_id uuid,
  p_user_id uuid,
  p_object_key text,
  p_sha256 text,
  p_width integer,
  p_height integer,
  p_bytes bigint
)
returns boolean
language sql security definer set search_path = '' as $$
  with updated as (
    update public.reference_uploads
    set uploaded_at = now(),
        sha256 = p_sha256,
        width = p_width,
        height = p_height,
        bytes = p_bytes
    where id = p_upload_id
      and user_id = p_user_id
      and object_key = p_object_key
      and uploaded_at is null
      and consumed_at is null
      and expires_at > now()
    returning 1
  ) select exists(select 1 from updated);
$$;

-- Deletes reference uploads that expired without being consumed and returns
-- their object keys so the caller can remove the stored bytes. Nothing invokes
-- this yet; see the deployment notes for the scheduler wiring.
create function public.purge_expired_reference_uploads(
  p_before timestamptz default now()
)
returns table(upload_id uuid, object_key text)
language sql security definer set search_path = '' as $$
  delete from public.reference_uploads
  where consumed_at is null
    and expires_at < p_before
  returning id, reference_uploads.object_key;
$$;

drop function if exists public.request_generation(text, uuid, uuid, uuid, text, text, boolean);

create function public.request_generation(
  p_catalog_id text,
  p_user_id uuid,
  p_purchase_id uuid,
  p_reference_generation_id uuid,
  p_prompt text,
  p_openai_model text,
  p_reset_to_base boolean default false,
  p_reference_upload_id uuid default null
)
returns table(
  generation_id uuid,
  allowance_slot smallint,
  source_object_key text,
  reference_upload_object_key text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_art public.artworks%rowtype;
  v_purchase public.purchases%rowtype;
  v_reference public.generations%rowtype;
  v_upload public.reference_uploads%rowtype;
  v_limit smallint;
  v_phase public.generation_phase;
  v_slot smallint;
  v_source text;
  v_upload_key text;
begin
  if char_length(trim(p_prompt)) < 1 or char_length(p_prompt) > 12000 then
    raise exception 'invalid_prompt' using errcode = '22023';
  end if;
  if p_reset_to_base and p_reference_generation_id is not null then
    raise exception 'reset_reference_conflict' using errcode = '22023';
  end if;
  -- A prior result is the *source* being edited; an upload is only a style
  -- reference. Accepting both would leave the caller's intent ambiguous, so the
  -- combination is refused here as well as in the Edge Function.
  if p_reference_generation_id is not null and p_reference_upload_id is not null then
    raise exception 'dual_reference_conflict' using errcode = '22023';
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

  -- Resolved last, so a request that is going to be refused for any other
  -- reason never burns the upload. The client supplies an opaque row id and
  -- never an object key; the key below is read from the row, and only for a
  -- finalized, unconsumed, unexpired upload this account made for this artwork.
  if p_reference_upload_id is not null then
    select * into v_upload
    from public.reference_uploads
    where id = p_reference_upload_id
      and user_id = p_user_id
    for update;
    if not found or v_upload.artwork_id is distinct from v_art.id
      or v_upload.uploaded_at is null then
      raise exception 'invalid_reference_upload' using errcode = '42501';
    end if;
    if v_upload.consumed_at is not null then
      raise exception 'reference_upload_consumed' using errcode = '42501';
    end if;
    if v_upload.expires_at <= now() then
      raise exception 'reference_upload_expired' using errcode = '42501';
    end if;
    update public.reference_uploads
    set consumed_at = now()
    where id = v_upload.id;
    v_upload_key := v_upload.object_key;
  end if;

  insert into public.generations (
    artwork_id, user_id, purchase_id, parent_generation_id, phase, allowance_slot,
    prompt, source_object_key, openai_model, expires_at, reference_upload_id
  ) values (
    v_art.id, p_user_id, p_purchase_id, p_reference_generation_id, v_phase, v_slot,
    trim(p_prompt), v_source, p_openai_model,
    now() + case when p_purchase_id is null then interval '7 days' else interval '30 days' end,
    p_reference_upload_id
  ) returning id into generation_id;
  allowance_slot := v_slot;
  source_object_key := v_source;
  reference_upload_object_key := v_upload_key;
  return next;
end;
$$;

revoke all on function public.admit_reference_upload(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.finalize_reference_upload(uuid, uuid, text, text, integer, integer, bigint)
  from public, anon, authenticated;
revoke all on function public.purge_expired_reference_uploads(timestamptz)
  from public, anon, authenticated;
revoke all on function public.request_generation(text, uuid, uuid, uuid, text, text, boolean, uuid)
  from public, anon, authenticated;

grant execute on function public.admit_reference_upload(uuid, text, uuid, text) to service_role;
grant execute on function public.finalize_reference_upload(uuid, uuid, text, text, integer, integer, bigint) to service_role;
grant execute on function public.purge_expired_reference_uploads(timestamptz) to service_role;
grant execute on function public.request_generation(text, uuid, uuid, uuid, text, text, boolean, uuid) to service_role;
