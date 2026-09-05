-- Run this once in the Supabase SQL editor after creating both Vault secrets:
--   select vault.create_secret('https://PROJECT.supabase.co', 'artcovr_project_url');
--   select vault.create_secret('A_LONG_RANDOM_VALUE', 'artcovr_scheduler_secret');
-- Set the identical random value as the Edge Function secret CRON_SECRET.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'artcovr_project_url' and decrypted_secret is not null
  ) then
    raise exception 'missing Vault secret: artcovr_project_url';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'artcovr_scheduler_secret' and decrypted_secret is not null
  ) then
    raise exception 'missing Vault secret: artcovr_scheduler_secret';
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'artcovr-generation-watchdog';

select cron.schedule(
  'artcovr-generation-watchdog',
  '* * * * *',
  $schedule$
    select net.http_post(
      url := rtrim((
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'artcovr_project_url'
        limit 1
      ), '/') || '/functions/v1/generation-watchdog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'artcovr_scheduler_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $schedule$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'artcovr-commerce-watchdog';

select cron.schedule(
  'artcovr-commerce-watchdog',
  '* * * * *',
  $schedule$
    select net.http_post(
      url := rtrim((
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'artcovr_project_url'
        limit 1
      ), '/') || '/functions/v1/commerce-watchdog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'artcovr_scheduler_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $schedule$
);

-- Verification:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname in ('artcovr-generation-watchdog', 'artcovr-commerce-watchdog');
-- select status, return_message, start_time, end_time
-- from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname = 'artcovr-generation-watchdog')
-- order by start_time desc limit 10;
