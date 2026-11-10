-- Backstop for the scheduler: warm-up and engagement actions of a campaign (profile visits, follows,
-- finding/liking a post, posting an approved comment) may only be queued
--   * inside the user's active days and hours, in the user's own timezone, and
--   * for visits/follows, within extension_status.daily_limit_visits per local day.
-- On 2026-11-09 the scheduler queued 183 visits in one evening (limit 80) and ran them until 22:45
-- local time. schedule-actions now enforces both rules itself; this trigger makes sure no other
-- code path (or an older deployed version) can exceed them. A rejected insert leaves the lead
-- untouched, so the scheduler simply tries again in a later run.
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

  if new.action_type in ('visit_profile', 'follow_profile') then
    day_start := date_trunc('day', local_ts) at time zone tz;
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

  return new;
end;
$$;

drop trigger if exists action_queue_human_hours_guard on public.action_queue;
create trigger action_queue_human_hours_guard
  before insert on public.action_queue
  for each row
  execute function public.action_queue_human_hours_guard();
