-- ARTCOVR contract invariants. Run against a disposable Supabase/Postgres DB.
-- Each query must return true.
select to_regclass('public.artworks') is not null as artworks_exists;
select to_regclass('public.generations') is not null as generations_exists;
select to_regclass('public.purchases') is not null as purchases_exists;
select to_regclass('public.stripe_events') is not null as stripe_events_exists;
select to_regclass('public.inquiries') is not null as inquiries_exists;
select to_regclass('public.analytics_events') is not null as analytics_events_exists;
select exists (select 1 from pg_type where typname = 'sale_mode') as sale_mode_exists;
select exists (select 1 from pg_type where typname = 'generation_status') as generation_status_exists;
select exists (select 1 from pg_type where typname = 'purchase_status') as purchase_status_exists;
select exists (select 1 from pg_type where typname = 'generation_phase') as generation_phase_exists;
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchases' and column_name = 'selected_preview_generation_id') as selected_preview_snapshot_exists;
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchases' and column_name = 'entitlement_expires_at') as entitlement_expiry_exists;
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'generations' and column_name = 'expires_at') as generation_expiry_exists;
select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'purchases_one_active_exclusive_reservation') as exclusive_reservation_index_exists;
select not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'purchases' and indexdef ilike '%where%status = ''paid''%') as no_global_paid_purchase_constraint;
select exists (select 1 from pg_proc where proname = 'reserve_artwork') as reserve_artwork_exists;
select exists (select 1 from pg_proc where proname = 'request_generation') as request_generation_exists;
select exists (select 1 from pg_proc where proname = 'reap_stale_generations') as reap_stale_generations_exists;
select relrowsecurity from pg_class where oid = 'public.artworks'::regclass;
select relrowsecurity from pg_class where oid = 'public.generations'::regclass;
select relrowsecurity from pg_class where oid = 'public.purchases'::regclass;
select not exists (select 1 from storage.buckets where id = 'art-assets' and public) as assets_bucket_is_private;
select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'artworks' and column_name = 'catalog_id' and is_nullable = 'NO'
) as stable_catalog_id_exists;
select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'purchases' and column_name = 'artwork_catalog_id' and is_nullable = 'NO'
) as purchase_catalog_snapshot_exists;
select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'purchases' and column_name = 'artwork_title' and is_nullable = 'NO'
) as purchase_title_snapshot_exists;
select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'artworks_source_sha256_unique_idx') as source_hash_unique_index_exists;
select exists (select 1 from pg_constraint where conname = 'artworks_publication_integrity') as publication_integrity_constraint_exists;
select to_regprocedure('public.reserve_artwork(text,uuid,uuid,uuid)') is not null as catalog_reservation_rpc_exists;
select to_regprocedure('public.request_generation(text,uuid,uuid,uuid,text,text,boolean)') is not null as catalog_generation_rpc_exists;
select to_regprocedure('public.settle_purchase_paid(uuid,text,text,integer,text)') is not null as amount_checked_settlement_rpc_exists;
select to_regprocedure('public.reconcile_full_refund(uuid,text)') is not null as atomic_refund_reconciliation_rpc_exists;
select reloptions @> array['security_invoker=true']
from pg_class where oid = 'public.catalog_artworks'::regclass;
select not has_table_privilege('anon', 'public.catalog_artworks', 'SELECT') as anon_catalog_view_revoked;
select not has_table_privilege('authenticated', 'public.catalog_artworks', 'SELECT') as authenticated_catalog_view_revoked;

-- Fail the script when a hardened contract is absent. The result-only checks
-- above remain useful in CI logs; this block makes the file executable as a
-- launch gate rather than relying on a human to notice a `false` row.
do $contract$
begin
  if to_regclass('public.artworks') is null
    or to_regclass('public.generations') is null
    or to_regclass('public.purchases') is null
    or to_regclass('public.stripe_events') is null then
    raise exception 'required ARTCOVR tables are missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchases'
      and column_name = 'base_object_key_snapshot' and is_nullable = 'NO'
  ) then
    raise exception 'immutable purchase base snapshot is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchases'
      and column_name = 'access_revoked_at'
  ) then
    raise exception 'purchase access revocation state is missing';
  end if;
  if to_regprocedure('public.revoke_purchase_access(uuid,text,text)') is null then
    raise exception 'purchase access revocation RPC is missing';
  end if;
  if to_regprocedure('public.account_assets(uuid)') is null then
    raise exception 'purchase-scoped account asset RPC is missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'purchases_artwork_catalog_id_idx'
  ) then
    raise exception 'purchase catalog foreign-key index is missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'generations_parent_active_idx'
  ) then
    raise exception 'generation lineage index is missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'generations_parent_generation_id_idx'
  ) then
    raise exception 'generation parent foreign-key index is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.artworks'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.generations'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.purchases'::regclass) then
    raise exception 'RLS must remain enabled on private domain tables';
  end if;
  if has_table_privilege('anon', 'public.purchases', 'SELECT')
    or has_table_privilege('authenticated', 'public.purchases', 'SELECT') then
    raise exception 'browser roles must not read purchases directly';
  end if;
  if exists (select 1 from storage.buckets where id = 'art-assets' and public) then
    raise exception 'art-assets bucket must remain private';
  end if;
end;
$contract$;
