-- Schedules the "Network" module scheduler every 20 minutes.
-- Uses the service key stored in Vault (cron_service_key). Until that secret exists,
-- it falls back to the key embedded in the existing schedule-actions job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'network-scheduler-cron') then
    perform cron.unschedule('network-scheduler-cron');
  end if;
end $$;

select cron.schedule(
  'network-scheduler-cron',
  '*/20 * * * *',
  $cmd$
    select net.http_post(
      url := 'https://gdwpkojugtggozyofpmw.supabase.co/functions/v1/network-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_key'),
          (select substring(command from 'Bearer ([A-Za-z0-9._-]+)') from cron.job where jobname = 'schedule-actions-cron')
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$
);
