-- One daily budget for every LinkedIn profile page (/in/...) the extension opens, whatever the
-- action: profile visit, activity page, like, comment, invite, message.
--
-- Why: on 2026-11-10 LinkedIn logged the account out with "your account has accessed a high volume
-- of LinkedIn profile data". The only daily limit (daily_limit_visits = 80) counted visit_profile
-- and follow_profile; activity pages, likes and comments opened the same people's pages again and
-- were not counted. About 250 profile pages were opened in under 24 hours.
--
-- Rules
--   * The budget starts at 15 pages a day and grows by 5 for every full week since
--     profile_page_ramp_start, up to daily_profile_page_limit (default 40).
--   * Every queued action whose URL is a profile page counts, from every module.
--   * Campaign actions (campaign_lead_id set) are refused once the day's budget is used. Network
--     invites are not refused here (they have their own weekly limit) but they do use the budget,
--     so campaigns get what is left.
--   * Resuming after an automatic pause (LinkedIn warning) restarts the ramp at 15.
alter table public.extension_status
  add column if not exists daily_profile_page_limit integer not null default 40,
  add column if not exists profile_page_ramp_start timestamptz not null default now();

comment on column public.extension_status.daily_profile_page_limit is 'Ceiling of LinkedIn profile pages (/in/...) opened per local day once the ramp is complete';
comment on column public.extension_status.profile_page_ramp_start is 'The daily profile page budget is 15 + 5 per full week since this date, capped at daily_profile_page_limit';

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
  select timezone, daily_profile_page_limit, profile_page_ramp_start
    into ext from extension_status where user_id = p_user_id;
  tz := coalesce(nullif(ext.timezone, ''), 'America/New_York');
  begin
    d_start := date_trunc('day', now() at time zone tz) at time zone tz;
  exception when others then
    tz := 'America/New_York';
    d_start := date_trunc('day', now() at time zone tz) at time zone tz;
  end;

  day_limit := least(
    coalesce(ext.daily_profile_page_limit, 40),
    15 + 5 * greatest(0, floor(extract(epoch from (now() - coalesce(ext.profile_page_ramp_start, now()))) / 604800)::int)
  );
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
revoke all on function public.profile_page_budget(uuid) from public, anon, authenticated;

-- Backstop in the queue itself (same trigger that already enforces active hours and the visit limit).
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

  select timezone, active_days, active_hours_start, active_hours_end, daily_limit_visits,
         daily_profile_page_limit, profile_page_ramp_start
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
    page_limit := least(
      coalesce(ext.daily_profile_page_limit, 40),
      15 + 5 * greatest(0, floor(extract(epoch from (now() - coalesce(ext.profile_page_ramp_start, now()))) / 604800)::int)
    );
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

-- Resuming after an automatic pause (LinkedIn warning) restarts the ramp.
create or replace function public.extension_status_restart_ramp_on_resume()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_paused is true and new.is_paused is false and old.auto_paused_at is not null then
    new.profile_page_ramp_start := now();
    new.auto_paused_at := null;
    new.auto_paused_reason := null;
  end if;
  return new;
end;
$$;
revoke all on function public.extension_status_restart_ramp_on_resume() from public, anon, authenticated;

drop trigger if exists extension_status_restart_ramp_on_resume on public.extension_status;
create trigger extension_status_restart_ramp_on_resume
  before update of is_paused on public.extension_status
  for each row
  execute function public.extension_status_restart_ramp_on_resume();
