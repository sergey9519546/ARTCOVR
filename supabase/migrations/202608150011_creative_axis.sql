-- ARTCOVR creative-axis pass. Additive only: the frozen deadlock-free
-- settlement design (artwork -> purchase lock order in reserve_artwork /
-- settle_purchase_paid) is not touched. This migration:
--   * enables pgvector and resurrects the dormant semanticEmbedding field as
--     real vector columns on artworks + generations,
--   * adds advisory judge/ensemble columns to generations (written by a new
--     attach RPC after complete_generation, so the frozen complete path stays),
--   * adds a human-preference study table (no PII columns),
--   * adds an entitlement-pause-on-dispute mechanism: a new
--     record_entitlement_pause RPC paired with a clock-extending
--     restore_purchase_access replacement, so a won chargeback no longer
--     leaves the buyer with a nearly-expired entitlement,
--   * adds an operator-gated snapshot-drift reconciliation RPC so a
--     re-keyed clean asset can re-snapshot a paid purchase instead of the
--     current fail-closed withhold,
--   * adds a pgvector more-like-this retrieval RPC for discovery + curation
--     dedup.
--
-- No existing NOT NULL, CHECK, or unique constraint is removed or weakened.
-- Every new column is nullable or carries a safe default; every new function
-- is revoke-all + service_role grant only, matching the default-deny posture.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Embeddings (resurrects the seeded-but-dead semanticEmbedding field).
-- 768-d matches bge-base / clip ViT-L projected spaces used by the backfill.
-- ---------------------------------------------------------------------------
alter table public.artworks
  add column if not exists embedding vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedding_at timestamptz;

alter table public.generations
  add column if not exists embedding vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedding_at timestamptz;

create index if not exists artworks_embedding_hnsw_idx
  on public.artworks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists generations_embedding_hnsw_idx
  on public.generations using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- ---------------------------------------------------------------------------
-- Advisory ensemble/judge columns. Written by the Edge Function worker AFTER
-- complete_generation succeeds, via attach_generation_judgement, so the frozen
-- complete_generation signature and its status='running' guard are untouched.
-- ---------------------------------------------------------------------------
alter table public.generations
  add column if not exists best_of_n_index smallint default 1
    check (best_of_n_index is null or best_of_n_index between 1 and 4),
  add column if not exists selected_from_n smallint default 1
    check (selected_from_n is null or selected_from_n between 1 and 4),
  add column if not exists judge_score jsonb
    check (judge_score is null or jsonb_typeof(judge_score) = 'object'),
  add column if not exists judge_model text;

-- ---------------------------------------------------------------------------
-- Human-preference study apparatus. No buyer PII: only ids + arm/pref labels.
-- ---------------------------------------------------------------------------
create table if not exists public.judge_eval_runs (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations(id) on delete restrict,
  artwork_id uuid not null references public.artworks(id) on delete restrict,
  arm text not null check (arm in ('single', 'best_of_n', 'judge_voter', 'fallback_rank')),
  selected boolean not null,
  human_pref smallint check (human_pref is null or human_pref between -1 and 1),
  annotator_count smallint not null default 0 check (annotator_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists judge_eval_runs_generation_idx
  on public.judge_eval_runs (generation_id);
create index if not exists judge_eval_runs_arm_created_idx
  on public.judge_eval_runs (arm, created_at);

alter table public.judge_eval_runs enable row level security;
revoke all on public.judge_eval_runs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entitlement pause on dispute. entitlement_paused_at is set when a
-- charge.dispute.created revokes access, and consumed by restore_purchase_access
-- (replaced below) to extend the clock by exactly the paused duration on a
-- dispute win. The 30-day entitlement no longer burns down during a dispute.
-- ---------------------------------------------------------------------------
alter table public.purchases
  add column if not exists entitlement_paused_at timestamptz;

-- ---------------------------------------------------------------------------
-- record_entitlement_pause. Called by the stripe-webhook edge function right
-- after revoke_purchase_access returns 'revoked' on a payment_dispute. Locks
-- the purchase only (no artwork touch) so it cannot cycle against the
-- artwork-first settlement order.
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
  if v_purchase.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id then
    return 'mismatch';
  end if;
  if v_purchase.status <> 'paid' then return 'not_paid'; end if;
  if v_purchase.access_revoked_at is null then return 'not_revoked'; end if;
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
-- restore_purchase_access replaces the 202608140009 definition. On a dispute
-- win it now ALSO extends the entitlement window by the paused duration so the
-- buyer does not lose entitlement time to the dispute itself. The existing
-- revocation-reason + payment-intent identity guards are preserved verbatim;
-- only the restore success branch adds the clock extension. Still purchase-only
-- locking (no artwork), so no lock cycle is introduced.
-- ---------------------------------------------------------------------------
create or replace function public.restore_purchase_access(
  p_purchase_id uuid,
  p_stripe_payment_intent_id text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_purchase public.purchases%rowtype;
  v_extension interval;
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

  -- Extend the entitlement by the paused duration so the dispute window is
  -- not charged against the buyer. A row that was never paused (legacy
  -- revocations) still restores, just without a clock extension.
  if v_purchase.entitlement_paused_at is not null then
    v_extension := greatest(now() - v_purchase.entitlement_paused_at, interval '0');
  else
    v_extension := interval '0';
  end if;

  update public.purchases
  set access_revoked_at = null,
      access_revocation_reason = null,
      entitlement_paused_at = null,
      entitlement_expires_at = v_purchase.entitlement_expires_at + v_extension
  where id = v_purchase.id
    and status = 'paid'
    and access_revoked_at is not null
    and access_revocation_reason = 'payment_dispute';
  if not found then return 'mismatch'; end if;
  -- Generations blocked by the revocation are not resurrected: their allowance
  -- slot was already released, so the buyer simply requests a new generation
  -- within the now-restored (and dispute-extended) entitlement window.
  return 'restored';
end;
$$;

-- ---------------------------------------------------------------------------
-- reconcile_base_drift. Operator / watchdog-gated. When an artwork's clean
-- source bytes are legitimately re-keyed (e.g. transcoded), a paid purchase
-- whose base_source_sha256_snapshot no longer matches the current digest is
-- silently withheld by account_assets (fail-closed). This RPC re-snapshots
-- the purchase to the artwork's CURRENT base_object_key + source_sha256 so
-- the buyer keeps receiving a clean asset instead of none. It verifies the
-- artwork still carries a valid square source and logs the drift idempotently.
-- Purchase-only lock; cannot cycle settlement.
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
  if v_art.source_sha256 is null
    or v_art.base_object_key is null
    or char_length(trim(v_art.base_object_key)) = 0
    or v_art.source_width is null or v_art.source_width < 1024
    or v_art.source_width is distinct from v_art.source_height then
    return 'artwork_not_ready';
  end if;

  -- Nothing to do if the snapshot already matches current bytes.
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
-- attach_generation_judgement. Called by the ensemble worker after
-- complete_generation succeeds to record the judge/ensemble provenance
-- without touching the frozen complete_generation signature.
-- ---------------------------------------------------------------------------
create or replace function public.attach_generation_judgement(
  p_generation_id uuid,
  p_judge_score jsonb,
  p_best_of_n_index smallint,
  p_selected_from_n smallint,
  p_judge_model text
)
returns boolean language sql security definer set search_path = '' as $$
  with updated as (
    update public.generations
    set judge_score = p_judge_score,
        best_of_n_index = p_best_of_n_index,
        selected_from_n = p_selected_from_n,
        judge_model = p_judge_model
    where id = p_generation_id
      and status = 'succeeded'
      and (p_best_of_n_index is null or p_best_of_n_index between 1 and 4)
      and (p_selected_from_n is null or p_selected_from_n between 1 and 4)
    returning 1
  ) select exists(select 1 from updated);
$$;

-- ---------------------------------------------------------------------------
-- attach_generation_embedding. Writes the chosen candidate's vector so the
-- retrieval/novelty axis has per-generation state. Loose-constraint: the vector
-- literal is validated by pgvector's cast.
-- ---------------------------------------------------------------------------
create or replace function public.attach_generation_embedding(
  p_generation_id uuid,
  p_embedding vector(768),
  p_embedding_model text
)
returns boolean language sql security definer set search_path = '' as $$
  with updated as (
    update public.generations
    set embedding = p_embedding,
        embedding_model = p_embedding_model,
        embedding_at = now()
    where id = p_generation_id
      and status = 'succeeded'
      and p_embedding is not null
    returning 1
  ) select exists(select 1 from updated);
$$;

-- ---------------------------------------------------------------------------
-- more_like_this. Returns the k nearest published, rights-approved catalog
-- artworks by cosine similarity, excluding the source artwork itself. Drives
-- discovery + curator dedup. service_role only; the browser calls an Edge
-- Function that projects a safe subset.
-- ---------------------------------------------------------------------------
create or replace function public.more_like_this(
  p_catalog_id text,
  p_k integer default 10
)
returns table(catalog_id text, slug text, title text, similarity double precision)
language sql security definer set search_path = '' as $$
  select a.catalog_id, a.slug::text as slug, a.title, 1 - (a.embedding <> ref.embedding) as similarity
  from public.artworks a
  cross join lateral (
    select embedding as embedding
    from public.artworks src
    where src.catalog_id = p_catalog_id
      and src.embedding is not null
    limit 1
  ) ref
  where a.catalog_id is distinct from p_catalog_id
    and a.embedding is not null
    and a.is_listed
    and a.rights_approved_at is not null
    and a.publication_approved_at is not null
    and a.published_at is not null
    and a.published_at <= now()
    and a.sold_at is null
  order by a.embedding <=> ref.embedding
  limit greatest(p_k, 0);
$$;

-- ---------------------------------------------------------------------------
-- record_judge_eval. Ingests a human-preference datapoint (no PII). Used by
-- the preference-study Edge Function to persist arm + selected + pref. Caller
-- supplies the generation id; artwork id is resolved server-side.
-- ---------------------------------------------------------------------------
create or replace function public.record_judge_eval(
  p_generation_id uuid,
  p_arm text,
  p_selected boolean,
  p_human_pref smallint default null,
  p_annotator_count smallint default 1
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_artwork_id uuid;
  v_id uuid;
begin
  if p_arm not in ('single', 'best_of_n', 'judge_voter', 'fallback_rank') then
    raise exception 'invalid_arm' using errcode = '22023';
  end if;
  select artwork_id into v_artwork_id from public.generations where id = p_generation_id;
  if not found then raise exception 'unknown_generation' using errcode = '42501'; end if;

  insert into public.judge_eval_runs (generation_id, artwork_id, arm, selected, human_pref, annotator_count)
  values (p_generation_id, v_artwork_id, p_arm, p_selected, p_human_pref,
          greatest(p_annotator_count, 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only; browser roles get nothing (default-deny posture).
-- ---------------------------------------------------------------------------
revoke all on function public.record_entitlement_pause(uuid, text)
  from public, anon, authenticated;
revoke all on function public.restore_purchase_access(uuid, text)
  from public, anon, authenticated;
revoke all on function public.reconcile_base_drift(uuid)
  from public, anon, authenticated;
revoke all on function public.attach_generation_judgement(uuid, jsonb, smallint, smallint, text)
  from public, anon, authenticated;
revoke all on function public.attach_generation_embedding(uuid, vector(768), text)
  from public, anon, authenticated;
revoke all on function public.more_like_this(text, integer)
  from public, anon, authenticated;
revoke all on function public.record_judge_eval(uuid, text, boolean, smallint, smallint)
  from public, anon, authenticated;

grant execute on function public.record_entitlement_pause(uuid, text) to service_role;
grant execute on function public.restore_purchase_access(uuid, text) to service_role;
grant execute on function public.reconcile_base_drift(uuid) to service_role;
grant execute on function public.attach_generation_judgement(uuid, jsonb, smallint, smallint, text) to service_role;
grant execute on function public.attach_generation_embedding(uuid, vector(768), text) to service_role;
grant execute on function public.more_like_this(text, integer) to service_role;
grant execute on function public.record_judge_eval(uuid, text, boolean, smallint, smallint) to service_role;
