-- Daily budget of LinkedIn profile pages, second version.
--
-- The first version (20261110180000) started at 15 pages a day, added 5 a week and stopped at 40.
-- It was set right after LinkedIn objected to about 250 profile pages in under 24 hours, with no
-- ramp, on our own account. Measured since: 14 to 20 pages a day with no warning. A comparison of
-- what other tools use for an established account (25/11/2026) puts the usual range at 80 to 150
-- profile pages a day, reached gradually.
--
-- New rule, in one place (profile_page_day_limit) so that the scheduler's reading and the queue
-- guard cannot drift apart:
--   * 20 pages a day, plus 20 for every full week since profile_page_ramp_start.
--   * Ceiling: daily_profile_page_limit when set; otherwise 100 on a free LinkedIn account and 150
--     on Premium or Sales Navigator (LinkedIn widens its browsing limit on paid plans).
--   * Resuming after an automatic pause still restarts the ramp (now at 20).
alter table public.extension_status
  alter column daily_profile_page_limit drop not null,
  alter column daily_profile_page_limit drop default;

-- 40 was the old default, not a choice anyone made: those rows follow the new rule.
update public.extension_status set daily_profile_page_limit = null where daily_profile_page_limit = 40;

comment on column public.extension_status.daily_profile_page_limit is 'Ceiling of LinkedIn profile pages (/in/...) per local day once the ramp is complete. Null: 100 on a free account, 150 on a paid one';
comment on column public.extension_status.profile_page_ramp_start is 'The daily profile page budget is 20 + 20 per full week since this date, up to the ceiling';

create or replace function public.profile_page_day_limit(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select least(
    coalesce(e.daily_profile_page_limit,
             case when e.linkedin_account_tier in ('premium', 'sales_navigator') then 150 else 100 end),
    20 + 20 * greatest(0, floor(extract(epoch from (now() - coalesce(e.profile_page_ramp_start, now()))) / 604800)::int)
  )
  from (select 1) one
  left join public.extension_status e on e.user_id = p_user_id;
$$;

revoke all on function public.profile_page_day_limit(uuid) from public, anon, authenticated;
grant execute on function public.profile_page_day_limit(uuid) to service_role;

create or replace function public.profile_page_budget(p_user_id uuid)
returns table (day_limit integer, used integer, day_start timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ext record;
  tz text;
  d_start timestamptz;
begin
  select timezone into ext from extension_status where user_id = p_user_id;
  tz := coalesce(nullif(ext.timezone, ''), 'America/New_York');
  begin
    d_start := date_trunc('day', now() at time zone tz) at time zone tz;
  exception when others then
    tz := 'America/New_York';
    d_start := date_trunc('day', now() at time zone tz) at time zone tz;
  end;

  day_limit := public.profile_page_day_limit(p_user_id);
  select count(*)::int into used
    from action_queue
   where user_id = p_user_id
     and linkedin_url ilike '%linkedin.com/in/%'
     and status in ('pending', 'in_progress', 'completed', 'failed')
     and scheduled_for >= d_start
     and scheduled_for < d_start + interval '1 day';
  day_start := d_start;
  return next;
end;
$$;

create or replace function public.action_queue_human_hours_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ext record;
  tz text;
  local_ts timestamp;
  day_key text;
  start_t time;
  end_t time;
  day_start timestamptz;
  used int;
  page_limit int;
begin
  if new.campaign_lead_id is null
     or new.action_type not in ('visit_profile', 'follow_profile', 'find_latest_post', 'like_post', 'post_comment') then
    return new;
  end if;

  select timezone, active_days, active_hours_start, active_hours_end, daily_limit_visits
    into ext from extension_status where user_id = new.user_id;
  tz := coalesce(nullif(ext.timezone, ''), 'America/New_York');
  begin
    local_ts := coalesce(new.scheduled_for, now()) at time zone tz;
  exception when others then
    tz := 'America/New_York';
    local_ts := coalesce(new.scheduled_for, now()) at time zone tz;
  end;

  day_key := to_char(local_ts, 'dy');
  start_t := coalesce(nullif(ext.active_hours_start::text, ''), '08:00')::time;
  end_t := coalesce(nullif(ext.active_hours_end::text, ''), '18:00')::time;

  if ext.active_days is not null and array_length(ext.active_days, 1) > 0 and not (day_key = any (ext.active_days)) then
    raise exception 'human_hours_guard: % is not an active day for this user', day_key using errcode = 'P0001';
  end if;
  if local_ts::time < start_t or local_ts::time >= end_t then
    raise exception 'human_hours_guard: % local time is outside the active hours (% to %)', to_char(local_ts, 'HH24:MI'), start_t, end_t using errcode = 'P0001';
  end if;

  day_start := date_trunc('day', local_ts) at time zone tz;

  if new.action_type in ('visit_profile', 'follow_profile') then
    select count(*) into used
      from action_queue
     where user_id = new.user_id
       and action_type in ('visit_profile', 'follow_profile')
       and campaign_lead_id is not null
       and status in ('pending', 'in_progress', 'completed')
       and scheduled_for >= day_start
       and scheduled_for < day_start + interval '1 day';
    if used >= coalesce(ext.daily_limit_visits, 80) then
      raise exception 'human_hours_guard: daily visit limit reached (% of %)', used, coalesce(ext.daily_limit_visits, 80) using errcode = 'P0001';
    end if;
  end if;

  -- One budget for every profile page, counted on the day the action is scheduled for.
  if new.linkedin_url ilike '%linkedin.com/in/%' then
    page_limit := public.profile_page_day_limit(new.user_id);
    select count(*) into used
      from action_queue
     where user_id = new.user_id
       and linkedin_url ilike '%linkedin.com/in/%'
       and status in ('pending', 'in_progress', 'completed', 'failed')
       and scheduled_for >= day_start
       and scheduled_for < day_start + interval '1 day';
    if used >= page_limit then
      raise exception 'human_hours_guard: daily profile page budget reached (% of %)', used, page_limit using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
