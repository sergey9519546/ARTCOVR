create extension if not exists citext;

create type public.sale_mode as enum ('exclusive', 'repeatable');
create type public.generation_status as enum ('queued', 'running', 'succeeded', 'blocked', 'failed', 'timed_out');
create type public.generation_phase as enum ('preview', 'purchased');
create type public.purchase_status as enum ('reserved', 'pending', 'paid', 'expired', 'refunded');

create table public.artworks (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  prompt_base text not null default '' check (char_length(prompt_base) <= 12000),
  sale_mode public.sale_mode not null,
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  license_version text not null default 'v1',
  is_listed boolean not null default false,
  rights_approved_at timestamptz,
  rights_approved_by uuid references auth.users(id) on delete set null,
  publication_approved_at timestamptz,
  publication_approved_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  sold_at timestamptz,
  base_object_key text not null,
  catalog_object_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((published_at is null) or (rights_approved_at is not null and publication_approved_at is not null)),
  check ((sold_at is null) or sale_mode = 'exclusive')
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  sale_mode public.sale_mode not null,
  status public.purchase_status not null default 'reserved',
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reservation_expires_at timestamptz not null,
  idempotency_key uuid not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  selected_preview_generation_id uuid,
  license_version text not null default 'v1',
  entitlement_expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expired_at timestamptz,
  refunded_at timestamptz,
  unique (user_id, idempotency_key),
  check (
    (status in ('reserved', 'pending') and paid_at is null and expired_at is null and refunded_at is null)
    or (status = 'paid' and paid_at is not null and expired_at is null and refunded_at is null and entitlement_expires_at is not null)
    or (status = 'expired' and paid_at is null and expired_at is not null and refunded_at is null)
    or (status = 'refunded' and paid_at is not null and expired_at is null and refunded_at is not null)
  )
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  purchase_id uuid references public.purchases(id) on delete restrict,
  parent_generation_id uuid references public.generations(id) on delete restrict,
  phase public.generation_phase not null,
  status public.generation_status not null default 'queued',
  allowance_slot smallint check (allowance_slot between 1 and 4),
  prompt text not null check (char_length(prompt) between 1 and 12000),
  source_object_key text not null,
  preview_object_key text,
  clean_object_key text,
  openai_model text not null,
  openai_request_id text,
  usage jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (purchase_id is not null or allowance_slot is null or allowance_slot between 1 and 2),
  check ((phase = 'preview') = (purchase_id is null)),
  check ((status = 'succeeded') = (clean_object_key is not null and preview_object_key is not null and finished_at is not null)),
  check ((status in ('blocked', 'failed', 'timed_out')) = (allowance_slot is null and finished_at is not null))
);

alter table public.purchases
  add constraint purchases_selected_preview_generation_id_fkey
  foreign key (selected_preview_generation_id) references public.generations(id) on delete restrict;

create table public.stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  email citext not null,
  name text check (char_length(name) <= 160),
  message text not null check (char_length(message) between 1 and 5000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  artwork_id uuid references public.artworks(id) on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  event_name text not null check (event_name in ('artwork_viewed', 'checkout_started', 'checkout_redirected', 'generation_requested', 'generation_completed', 'inquiry_submitted')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger artworks_set_updated_at before update on public.artworks
for each row execute function public.set_updated_at();
