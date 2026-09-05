drop function if exists public.attach_checkout_session(uuid, uuid, text);

create or replace function public.attach_checkout_session(
  p_purchase_id uuid,
  p_user_id uuid,
  p_stripe_checkout_session_id text,
  p_reservation_expires_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.purchases
    set
      stripe_checkout_session_id = p_stripe_checkout_session_id,
      status = 'pending',
      reservation_expires_at = p_reservation_expires_at
    where id = p_purchase_id
      and user_id = p_user_id
      and status in ('reserved', 'pending')
      and (
        stripe_checkout_session_id is null
        or stripe_checkout_session_id = p_stripe_checkout_session_id
      )
      and p_reservation_expires_at > now()
      and p_reservation_expires_at <= now() + interval '32 minutes'
    returning 1
  )
  select exists(select 1 from updated);
$$;

revoke all on function public.attach_checkout_session(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.attach_checkout_session(uuid, uuid, text, timestamptz)
  to service_role;
