-- When Copilot decided what to do with a post (draft, off-topic, nothing worth adding). A post can be
-- found before midnight and processed after it, so the Today card must count by this moment and not
-- by created_at. Set by trigger, so no function has to remember to write it.
alter table public.monitored_posts add column if not exists decided_at timestamptz;

create or replace function public.monitored_posts_set_decided_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'new' then new.decided_at := now(); end if;
  elsif new.status is distinct from old.status and (old.status = 'new' or new.status = 'pending') then
    -- first decision, or a fresh draft written on a row that had been decided before
    new.decided_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mp_decided_at on public.monitored_posts;
create trigger trg_mp_decided_at
  before insert or update of status on public.monitored_posts
  for each row execute function public.monitored_posts_set_decided_at();

-- Rows decided before this column existed: the moment is not known, created_at is the closest record.
update public.monitored_posts set decided_at = created_at where decided_at is null and status <> 'new';

create index if not exists monitored_posts_user_decided_idx on public.monitored_posts (user_id, decided_at);

create or replace function public.reading_summary()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
with me as (
  select auth.uid() as uid
),
tz as (
  select coalesce((select e.timezone from public.extension_status e, me where e.user_id = me.uid limit 1), 'America/New_York') as name
),
periods as (
  select 'today'::text as k, (date_trunc('day', now() at time zone (select name from tz)) at time zone (select name from tz)) as since
  union all
  select 'week', now() - interval '7 days'
)
select coalesce(jsonb_object_agg(p.k, jsonb_build_object(
  'drafts',
    (select count(*) from public.monitored_posts m, me
      where m.user_id = me.uid and m.decided_at >= p.since
        and m.status in ('pending', 'approved', 'queued', 'posted', 'dismissed', 'failed')),
  'off_topic',
    (select count(*) from public.monitored_posts m, me
      where m.user_id = me.uid and m.decided_at >= p.since
        and m.status = 'ignored' and coalesce(m.last_error, '') not like 'quality skip%')
    + (select count(*) from public.activity_log a, me
        where a.user_id = me.uid and a.created_at >= p.since and a.action = 'comment_skipped_off_topic'),
  'quality',
    (select count(*) from public.monitored_posts m, me
      where m.user_id = me.uid and m.decided_at >= p.since
        and m.status = 'ignored' and m.last_error like 'quality skip%')
    + (select count(*) from public.activity_log a, me
        where a.user_id = me.uid and a.created_at >= p.since and a.action = 'comment_skipped_quality')
)), '{}'::jsonb)
from periods p;
$$;

revoke all on function public.reading_summary() from public, anon;
grant execute on function public.reading_summary() to authenticated;
