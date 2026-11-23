-- What Copilot read and what it did with it, for the Today page: posts that became a draft, posts left
-- alone because they were not about the person's subjects, and drafts held back because there was
-- nothing specific to say. Two periods: today (in the person's time zone) and the last 7 days.
-- Sources: monitored_posts (posts found by searches, and the drafts of campaign contacts) and
-- activity_log (campaign contacts whose post was skipped: no monitored_posts row is created for those).
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
      where m.user_id = me.uid and m.created_at >= p.since
        and m.status in ('pending', 'approved', 'queued', 'posted', 'dismissed', 'failed')),
  'off_topic',
    (select count(*) from public.monitored_posts m, me
      where m.user_id = me.uid and m.created_at >= p.since
        and m.status = 'ignored' and coalesce(m.last_error, '') not like 'quality skip%')
    + (select count(*) from public.activity_log a, me
        where a.user_id = me.uid and a.created_at >= p.since and a.action = 'comment_skipped_off_topic'),
  'quality',
    (select count(*) from public.monitored_posts m, me
      where m.user_id = me.uid and m.created_at >= p.since
        and m.status = 'ignored' and m.last_error like 'quality skip%')
    + (select count(*) from public.activity_log a, me
        where a.user_id = me.uid and a.created_at >= p.since and a.action = 'comment_skipped_quality')
)), '{}'::jsonb)
from periods p;
$$;

revoke all on function public.reading_summary() from public, anon;
grant execute on function public.reading_summary() to authenticated;
