-- Email the user when the extension has been silent for 60+ minutes inside the active window with
-- work pending (function extension-offline-alert, every 15 minutes). One alert per stoppage; the
-- user can turn it off or snooze it.
alter table public.extension_status
  add column if not exists offline_alerts_enabled boolean not null default true,
  add column if not exists offline_alerts_snoozed_until timestamptz,
  add column if not exists offline_alert_sent_at timestamptz;

comment on column public.extension_status.offline_alerts_enabled is 'Email the user when the extension has been silent for 60+ min inside the active window with work pending';
comment on column public.extension_status.offline_alerts_snoozed_until is 'No offline alert before this time (travel, holidays)';
comment on column public.extension_status.offline_alert_sent_at is 'Last offline alert. One alert per stoppage: no new one until a heartbeat arrives after it';

select cron.unschedule('extension-offline-alert-cron') where exists (select 1 from cron.job where jobname = 'extension-offline-alert-cron');
select cron.schedule('extension-offline-alert-cron', '7,22,37,52 * * * *', $cron$
    select net.http_post(
      url := 'https://gdwpkojugtggozyofpmw.supabase.co/functions/v1/extension-offline-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_key')
      ),
      body := '{"source":"pg_cron"}'::jsonb,
      timeout_milliseconds := 30000
    );
$cron$);
