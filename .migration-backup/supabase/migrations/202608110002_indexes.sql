create index artworks_listed_catalog_idx on public.artworks (published_at desc, id)
  where is_listed and published_at is not null and sold_at is null;
create index purchases_artwork_idx on public.purchases (artwork_id);
create index purchases_user_idx on public.purchases (user_id, created_at desc);
create index purchases_active_expiry_idx on public.purchases (reservation_expires_at)
  where status in ('reserved', 'pending');
create unique index purchases_one_active_exclusive_reservation on public.purchases (artwork_id)
  where sale_mode = 'exclusive' and status in ('reserved', 'pending');
create index generations_owner_idx on public.generations (user_id, created_at desc);
create index generations_artwork_owner_idx on public.generations (artwork_id, user_id, created_at desc);
create index generations_purchase_idx on public.generations (purchase_id, created_at desc) where purchase_id is not null;
create index generations_watchdog_idx on public.generations (started_at)
  where status in ('queued', 'running');
create index generations_expiry_idx on public.generations (expires_at) where status = 'succeeded';
create unique index generations_claimed_allowance_slot on public.generations
  (artwork_id, user_id, coalesce(purchase_id, '00000000-0000-0000-0000-000000000000'::uuid), allowance_slot)
  where allowance_slot is not null and status in ('queued', 'running', 'succeeded');
create index inquiries_owner_idx on public.inquiries (user_id, created_at desc);
create index analytics_events_artwork_idx on public.analytics_events (artwork_id, occurred_at desc) where artwork_id is not null;
create index analytics_events_purchase_idx on public.analytics_events (purchase_id, occurred_at desc) where purchase_id is not null;
