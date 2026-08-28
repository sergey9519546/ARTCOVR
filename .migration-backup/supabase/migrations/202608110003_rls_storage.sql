alter table public.artworks enable row level security;
alter table public.generations enable row level security;
alter table public.purchases enable row level security;
alter table public.stripe_events enable row level security;
alter table public.inquiries enable row level security;
alter table public.analytics_events enable row level security;

create or replace view public.catalog_artworks
with (security_invoker = false, security_barrier = true) as
select id, slug, title, description, sale_mode, price_cents, currency, published_at
from public.artworks
where is_listed
  and published_at is not null
  and published_at <= now()
  and rights_approved_at is not null
  and publication_approved_at is not null
  and sold_at is null;

grant select on public.catalog_artworks to anon, authenticated;
revoke all on public.artworks, public.generations, public.purchases, public.stripe_events, public.inquiries, public.analytics_events from anon, authenticated;
-- Authenticated users access private state only through Edge Functions. This
-- prevents storage object keys, Stripe identifiers, and internal errors from
-- leaking through direct table selects even to the row owner.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('art-assets', 'art-assets', false, 20971520, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are created. Browser clients cannot list, upload,
-- download, or sign source/clean objects; Edge Functions use service-role access.
revoke all on storage.objects from anon, authenticated;
revoke all on storage.buckets from anon, authenticated;
