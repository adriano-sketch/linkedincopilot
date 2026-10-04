-- Applied to production on 2026-10-03 (via MCP): safety caps, FK indexes, atomic counters.
-- 2) Tetos de segurança para não queimar a conta LinkedIn do cliente
alter table public.extension_status add constraint extension_status_limits_range check (
      (daily_limit_visits is null or daily_limit_visits between 0 and 150)
  and (daily_limit_connection_requests is null or daily_limit_connection_requests between 0 and 100)
  and (daily_limit_messages is null or daily_limit_messages between 0 and 150)
);

-- 5) Índices: FKs sem índice, consultas quentes, e remoção do índice duplicado
create index if not exists idx_action_queue_campaign_lead on public.action_queue (campaign_lead_id);
create index if not exists idx_action_queue_user_created on public.action_queue (user_id, created_at desc);
create index if not exists idx_activity_log_campaign_lead on public.activity_log (campaign_lead_id);
create index if not exists idx_activity_log_user_created on public.activity_log (user_id, created_at desc);
create index if not exists idx_campaign_profiles_vertical on public.campaign_profiles (vertical_id);
create index if not exists idx_generated_messages_event on public.generated_messages (event_id);
create index if not exists idx_jobs_event on public.jobs (event_id);
create index if not exists idx_linkedin_events_campaign_profile on public.linkedin_events (campaign_profile_id);
create index if not exists idx_profile_snapshots_event on public.profile_snapshots (event_id);
-- 6) Contadores atômicos (antes: lê o valor, soma no código, grava -> chamadas
--    simultâneas perdiam incrementos). Só o service role pode chamar.

-- Consome N créditos de outreach se houver saldo. max_leads_per_cycle <= 0 = ilimitado.
create or replace function public.consume_lead_credits(p_user_id uuid, p_amount integer default 1)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with upd as (
    update public.user_settings
    set leads_used_this_cycle = leads_used_this_cycle + p_amount,
        updated_at = now()
    where user_id = p_user_id
      and (max_leads_per_cycle <= 0 or leads_used_this_cycle + p_amount <= max_leads_per_cycle)
    returning 1
  )
  select exists (select 1 from upd);
$$;

-- Soma processamento (ScrapIn etc.) sem checar limite; retorna o novo total.
create or replace function public.add_leads_processed(p_user_id uuid, p_amount integer default 1)
returns integer
language sql
security invoker
set search_path = ''
as $$
  update public.user_settings
  set leads_processed_this_cycle = coalesce(leads_processed_this_cycle, 0) + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning leads_processed_this_cycle;
$$;

-- Incrementa contadores diários da extensão conforme o tipo de ação.
create or replace function public.bump_extension_counters(p_user_id uuid, p_action_type text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.extension_status
  set actions_today = coalesce(actions_today, 0) + 1,
      visits_today = coalesce(visits_today, 0)
        + case when p_action_type in ('visit_profile', 'follow_profile') then 1 else 0 end,
      connection_requests_today = coalesce(connection_requests_today, 0)
        + case when p_action_type = 'send_connection_request' then 1 else 0 end,
      messages_today = coalesce(messages_today, 0)
        + case when p_action_type in ('send_dm', 'send_followup') then 1 else 0 end,
      last_action_at = now()
  where user_id = p_user_id;
$$;

revoke execute on function public.consume_lead_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.add_leads_processed(uuid, integer) from public, anon, authenticated;
revoke execute on function public.bump_extension_counters(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_lead_credits(uuid, integer) to service_role;
grant execute on function public.add_leads_processed(uuid, integer) to service_role;
grant execute on function public.bump_extension_counters(uuid, text) to service_role;

