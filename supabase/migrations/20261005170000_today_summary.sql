-- Today page: one round trip with everything the daily briefing needs, for the signed-in user.
-- SECURITY INVOKER: every read goes through the caller's RLS, and all filters use auth.uid().
create or replace function public.today_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with me as (
  select (select auth.uid()) as uid
),
ext as (
  select e.* from public.extension_status e, me where e.user_id = me.uid limit 1
),
tz as (
  select coalesce((select timezone from ext), 'America/New_York') as name
),
bounds as (
  select
    now() - interval '7 days' as week_ago,
    (date_trunc('day', now() at time zone (select name from tz)) at time zone (select name from tz)) as day_start,
    date_trunc('month', now()) as month_start
)
select jsonb_build_object(
  'timezone', (select name from tz),

  'inbox', jsonb_build_object(
    'replies', (select count(*) from public.campaign_leads l, me
                where l.user_id = me.uid and l.status = 'replied' and l.reply_handled_at is null),
    'comments', (select count(*) from public.monitored_posts p, me
                 where p.user_id = me.uid and p.status = 'pending'),
    'messages', (select count(*) from public.campaign_leads l, me
                 where l.user_id = me.uid and l.status = 'dm_pending_approval'),
    'signals', (select count(*) from public.monitored_posts p, me
                where p.user_id = me.uid and p.status = 'pending'
                  and p.signal_type in ('business_opportunity', 'hiring', 'pain_point'))
  ),

  'top_reply', (
    select jsonb_build_object(
      'name', coalesce(l.full_name, concat_ws(' ', l.first_name, l.last_name)),
      'text', l.reply_text, 'intent', l.reply_intent, 'at', l.replied_at)
    from public.campaign_leads l, me
    where l.user_id = me.uid and l.status = 'replied' and l.reply_handled_at is null
    order by l.replied_at desc nulls last limit 1
  ),

  'opportunities', coalesce((
    select jsonb_agg(o order by o->>'at' desc) from (
      select jsonb_build_object(
        'id', p.id, 'name', p.author_name, 'headline', p.author_headline,
        'signal', p.signal_type, 'why', p.signal_reason, 'post_url', p.post_url,
        'status', p.status, 'at', p.created_at) as o
      from public.monitored_posts p, me, bounds b
      where p.user_id = me.uid and p.created_at >= b.week_ago
        and p.signal_type in ('business_opportunity', 'hiring', 'pain_point')
      order by p.created_at desc limit 5
    ) s), '[]'::jsonb),

  'plan', coalesce((
    select jsonb_agg(jsonb_build_object('type', a.action_type, 'count', a.n, 'next_at', a.next_at) order by a.next_at)
    from (
      select q.action_type, count(*) as n, min(q.scheduled_for) as next_at
      from public.action_queue q, me
      where q.user_id = me.uid and q.status = 'pending'
        and q.scheduled_for < now() + interval '24 hours'
      group by q.action_type
    ) a), '[]'::jsonb),

  'limits', jsonb_build_object(
    'invites_week',
      (select count(*) from public.network_prospects n, me, bounds b where n.user_id = me.uid and n.invited_at >= b.week_ago)
      + (select count(*) from public.campaign_leads l, me, bounds b where l.user_id = me.uid and l.connection_sent_at >= b.week_ago),
    'invite_limit', coalesce((select weekly_invite_limit from ext), 100),
    'comments_today',
      (select count(*) from public.monitored_posts p, me, bounds b where p.user_id = me.uid and p.status = 'posted' and p.campaign_lead_id is null and p.commented_at >= b.day_start)
      + (select count(*) from public.campaign_leads l, me, bounds b where l.user_id = me.uid and l.comment_posted_at >= b.day_start),
    'comment_limit', coalesce((select daily_comment_limit from ext), 20),
    'searches_month', (select count(*) from public.network_search_runs r, me, bounds b
                       where r.user_id = me.uid and r.kind in ('people', 'connections') and r.created_at >= b.month_start
                         and r.status in ('completed', 'failed', 'limit_reached')),
    'search_budget', coalesce((select monthly_people_search_budget from ext), 250)
  ),

  'week', jsonb_build_object(
    'new_connections',
      (select count(*) from public.network_prospects n, me, bounds b where n.user_id = me.uid and n.accepted_at >= b.week_ago)
      + (select count(*) from public.campaign_leads l, me, bounds b where l.user_id = me.uid and l.connection_accepted_at >= b.week_ago),
    'invites',
      (select count(*) from public.network_prospects n, me, bounds b where n.user_id = me.uid and n.invited_at >= b.week_ago)
      + (select count(*) from public.campaign_leads l, me, bounds b where l.user_id = me.uid and l.connection_sent_at >= b.week_ago),
    'replies', (select count(*) from public.campaign_leads l, me, bounds b where l.user_id = me.uid and l.replied_at >= b.week_ago),
    'positive_replies', (select count(*) from public.campaign_leads l, me, bounds b
                         where l.user_id = me.uid and l.replied_at >= b.week_ago and l.reply_sentiment = 'positive'),
    'comments_posted',
      (select count(*) from public.monitored_posts p, me, bounds b where p.user_id = me.uid and p.status = 'posted' and p.campaign_lead_id is null and p.commented_at >= b.week_ago)
      + (select count(*) from public.campaign_leads l, me, bounds b where l.user_id = me.uid and l.comment_posted_at >= b.week_ago),
    'opportunities', (select count(*) from public.monitored_posts p, me, bounds b
                      where p.user_id = me.uid and p.created_at >= b.week_ago
                        and p.signal_type in ('business_opportunity', 'hiring', 'pain_point'))
  ),

  'campaigns', coalesce((
    select jsonb_agg(c order by (c->>'rank')::int, c->>'name') from (
      select jsonb_build_object(
        'id', cp.id, 'name', cp.name, 'mode', coalesce(cp.campaign_mode, 'outreach'), 'status', cp.status,
        'rank', case cp.status when 'active' then 0 when 'paused' then 1 else 2 end,
        'people', (select count(*) from public.campaign_leads l where l.campaign_profile_id = cp.id),
        'connected', (select count(*) from public.campaign_leads l where l.campaign_profile_id = cp.id and l.connection_accepted_at is not null),
        'replied', (select count(*) from public.campaign_leads l where l.campaign_profile_id = cp.id and l.replied_at is not null),
        'engaged', (select count(*) from public.campaign_leads l where l.campaign_profile_id = cp.id and l.comment_posted_at is not null)
      ) as c
      from public.campaign_profiles cp, me
      where cp.user_id = me.uid and cp.status in ('active', 'paused')
    ) s), '[]'::jsonb),

  'network_active', exists (select 1 from public.icps i, me where i.user_id = me.uid and i.is_active),
  'contacts', (select count(*) from public.linkedin_connections c, me where c.user_id = me.uid)
);
$$;

revoke all on function public.today_summary() from public, anon;
grant execute on function public.today_summary() to authenticated;
