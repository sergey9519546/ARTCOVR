-- ARTCOVR behavioural verification. Run against a DISPOSABLE migrated PostgreSQL.
--
-- `contract_invariants.sql` proves the schema's *shape*: tables, columns, RPC
-- entrypoints, indexes, grants. This file proves its *behaviour* — that the
-- guards named in .agent-state/FAILURE_GRAPH.md actually hold when exercised.
-- Together they are gate G8 in .agent-state/RELEASE_GATES.md.
--
-- Usage (see supabase/tests/README.md):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/behaviour_checks.sql
--
-- Every check raises on failure, so a non-zero psql exit is a real defect. A
-- check that cannot exercise its path raises INCONCLUSIVE rather than passing
-- silently — a test that cannot fail proves nothing.
--
-- NEVER point this at production. It writes rows.

\set ON_ERROR_STOP on

-- ------------------------------------------------------------------ fixtures
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'freeuser@example.test')
on conflict do nothing;

delete from public.generations;
delete from public.purchases;
delete from public.artworks where catalog_id like 'art_%test%';

insert into public.artworks (
  catalog_id, slug, title, prompt_base, sale_mode, price_cents, currency,
  license_version, is_listed, base_object_key, catalog_object_key,
  rights_approved_at, publication_approved_at, published_at,
  source_sha256, source_width, source_height, source_bytes, source_mime_type,
  mood_tags, keywords, avoids, palette
) values
  ('art_behaviourtest0001', 'behaviour-test-work', 'Behaviour Test Work',
   'a test base prompt', 'repeatable', 3500, 'USD', 'v1', true,
   'artworks/art_behaviourtest0001/base', 'assets/behaviour-test-work.jpg',
   now(), now(), now(), repeat('a', 64), 1280, 1280, 1019350, 'image/png',
   '{}', '{}', '{}', '{}'),
  ('art_exclusivetest0001', 'exclusive-test-work', 'Exclusive Test Work',
   'a test base prompt', 'exclusive', 20000, 'USD', 'v1', true,
   'artworks/art_exclusivetest0001/base', 'assets/exclusive-test-work.jpg',
   now(), now(), now(), repeat('b', 64), 1280, 1280, 1019350, 'image/png',
   '{}', '{}', '{}', '{}');

-- ============================================================================
-- CHECK 1 — DUAL-LANE GENERATION ADMISSION  (migration 202608140010)
-- FAILURE_GRAPH risk 3. Free-tier traffic must not be able to deny generation
-- to a paying customer. Saturate the free lane, then assert a purchased call is
-- still admitted.
-- ============================================================================
do $$
declare
  v_free uuid := '22222222-2222-2222-2222-222222222222';
  v_paid uuid := '11111111-1111-1111-1111-111111111111';
  v_purchase uuid;
  v_admitted int := 0;
  v_refused int := 0;
  i int;
begin
  for i in 1..8 loop
    begin
      perform public.request_generation('art_behaviourtest0001', v_free, null, null,
        'free lane probe ' || i, 'gpt-image-2-2026-04-21', false, null);
      v_admitted := v_admitted + 1;
    exception when others then
      v_refused := v_refused + 1;
    end;
  end loop;

  raise notice 'CHECK 1: free lane -> % admitted, % refused', v_admitted, v_refused;
  if v_refused = 0 then
    raise exception 'CHECK 1 FAILED: free lane never refused across 8 rapid attempts; the bound is not enforced';
  end if;

  insert into public.purchases (
    artwork_id, user_id, status, sale_mode, amount_cents, currency,
    reservation_expires_at, idempotency_key, artwork_catalog_id, artwork_title,
    base_object_key_snapshot, stripe_checkout_expires_at, paid_at, entitlement_expires_at
  )
  select a.id, v_paid, 'paid', a.sale_mode, a.price_cents, a.currency,
         now() + interval '45 minutes', gen_random_uuid(), a.catalog_id, a.title,
         a.base_object_key, now() + interval '45 minutes', now(), now() + interval '30 days'
  from public.artworks a where a.catalog_id = 'art_behaviourtest0001'
  returning id into v_purchase;

  begin
    perform public.request_generation('art_behaviourtest0001', v_paid, v_purchase, null,
      'purchased lane probe', 'gpt-image-2-2026-04-21', false, null);
  exception when others then
    raise exception 'CHECK 1 FAILED: free-lane saturation denied a PAYING customer (%). Lane separation is broken.', sqlerrm;
  end;
  raise notice 'CHECK 1 PASS: purchased request admitted while the free lane was saturated';
end
$$;

-- ============================================================================
-- CHECK 2 — EXCLUSIVE DOUBLE-SELL PREVENTION
-- FAILURE_GRAPH risk 1. reserve_artwork signals conflict through its RETURNED
-- outcome, not an exception, so assert on committed rows — the ground truth a
-- double-sell would actually show up in.
-- ============================================================================
do $$
declare
  v_a uuid := '11111111-1111-1111-1111-111111111111';
  v_b uuid := '22222222-2222-2222-2222-222222222222';
  v_first_id uuid;
  v_second_id uuid;
  v_rows int;
begin
  select purchase_id into v_first_id
    from public.reserve_artwork('art_exclusivetest0001', v_a, gen_random_uuid(), null);
  select purchase_id into v_second_id
    from public.reserve_artwork('art_exclusivetest0001', v_b, gen_random_uuid(), null);

  select count(*) into v_rows
    from public.purchases p join public.artworks a on a.id = p.artwork_id
   where a.catalog_id = 'art_exclusivetest0001'
     and p.status in ('reserved', 'pending');

  raise notice 'CHECK 2: first=%, second=%, live reservation rows=%',
    coalesce(v_first_id::text, 'null'), coalesce(v_second_id::text, 'null'), v_rows;

  if v_first_id is null then
    raise exception 'CHECK 2 INCONCLUSIVE: the first reservation did not succeed; the path was never exercised';
  end if;
  if v_second_id is not null then
    raise exception 'CHECK 2 FAILED: a second user received a purchase id for an already-reserved exclusive artwork';
  end if;
  if v_rows <> 1 then
    raise exception 'CHECK 2 FAILED: % live reservations exist on one exclusive artwork; expected exactly 1', v_rows;
  end if;
  raise notice 'CHECK 2 PASS: exactly one live reservation; the losing caller got a null purchase id';
end
$$;

-- ============================================================================
-- CHECK 3 — BROWSER ROLES CANNOT REACH MONEY STATE
-- AGENTS.md: browser clients never directly read or write settlement state.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['purchases', 'stripe_events', 'generations'] loop
    if has_table_privilege('anon', 'public.' || t, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'CHECK 3 FAILED: a browser role can read %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       or has_table_privilege('anon', 'public.' || t, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || t, 'INSERT') then
      raise exception 'CHECK 3 FAILED: a browser role can write %', t;
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.purchases'::regclass) then
    raise exception 'CHECK 3 FAILED: RLS is not enabled on purchases';
  end if;
  raise notice 'CHECK 3 PASS: browser roles cannot read or write purchases, stripe_events or generations';
end
$$;

-- ============================================================================
-- CHECK 4 — PAID-STATE MACHINE IS DATABASE-ENFORCED
-- A purchase must not be able to claim 'paid' without the evidence of payment.
-- This is what stops a bug elsewhere from manufacturing an entitlement.
-- ============================================================================
do $$
declare v_art uuid;
begin
  select id into v_art from public.artworks where catalog_id = 'art_behaviourtest0001';
  begin
    insert into public.purchases (
      artwork_id, user_id, status, sale_mode, amount_cents, currency,
      reservation_expires_at, idempotency_key, artwork_catalog_id, artwork_title,
      base_object_key_snapshot, stripe_checkout_expires_at
    ) values (
      v_art, '11111111-1111-1111-1111-111111111111', 'paid', 'repeatable', 3500, 'USD',
      now() + interval '45 minutes', gen_random_uuid(), 'art_behaviourtest0001',
      'Behaviour Test Work', 'artworks/x/base', now() + interval '45 minutes'
    );
    raise exception 'CHECK 4 FAILED: a purchase was marked paid with no paid_at and no entitlement expiry';
  exception
    when check_violation then
      raise notice 'CHECK 4 PASS: the database refused a paid purchase lacking payment evidence';
  end;
end
$$;

-- ============================================================================
-- CHECK 5 — PRIVATE ASSET BUCKET
-- ============================================================================
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'art-assets') then
    raise exception 'CHECK 5 INCONCLUSIVE: the art-assets bucket was not created by the migrations';
  end if;
  if exists (select 1 from storage.buckets where id = 'art-assets' and public) then
    raise exception 'CHECK 5 FAILED: the art-assets bucket is public';
  end if;
  raise notice 'CHECK 5 PASS: art-assets exists and is private';
end
$$;

-- ---------------------------------------------------------------- teardown
delete from public.generations;
delete from public.purchases;
delete from public.artworks where catalog_id like 'art_%test%';

select 'ALL BEHAVIOURAL CHECKS PASSED' as result;
