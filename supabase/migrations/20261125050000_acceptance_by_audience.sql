-- Acceptance rate by audience, counted so that it can be trusted.
--
-- Before: "accepted in the period" divided by "invited in the period". Those are two different groups
-- of people (someone invited last month and accepted this week counted above the line only), and an
-- invite sent yesterday counted against the rate although nobody had had the time to answer it.
--
-- Now everything is about the invites SENT in the period:
--   invited          invites sent in the period
--   accepted         of those, how many were accepted (so far)
--   settled          of those, how many have an answer or have had time for one: accepted, withdrawn,
--                    or sent at least 14 days ago
--   waiting          of those, how many are still too recent to count (invited - settled)
--   acceptance_rate  accepted / settled, in percent; null when nothing is settled yet
-- and, for the filter that decides who is invited:
--   found            people the search brought for the audience in the period
--   passed_filter    of those, how many the fit check let through
--
-- The top-level 'accepted' keeps its meaning (connections made in the period, whenever invited): it
-- feeds the "New connections" number. 'accepted_at' is the moment the extension noticed the
-- connection, which can be a day or more after the person accepted.
create or replace function public.network_stats(p_days integer default 30)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with me as (select (select auth.uid()) as uid),
  p as (select np.* from public.network_prospects np, me where np.user_id = me.uid),
  sent as (
    select p.*,
      (p.accepted_at is not null) as is_accepted,
      (p.accepted_at is not null or p.withdrawn_at is not null or p.invited_at < now() - interval '14 days') as is_settled
    from p
    where p.invited_at >= now() - make_interval(days => p_days)
  ),
  per_icp as (
    select i.id, i.name,
      (select count(*) from sent s where s.icp_id = i.id) as invited,
      (select count(*) from sent s where s.icp_id = i.id and s.is_accepted) as accepted,
      (select count(*) from sent s where s.icp_id = i.id and s.is_settled) as settled,
      (select count(*) from p where p.icp_id = i.id and p.status = 'invited') as pending,
      (select count(*) from p where p.icp_id = i.id and p.status = 'qualified') as ready_to_invite,
      (select count(*) from p where p.icp_id = i.id and p.created_at >= now() - make_interval(days => p_days)) as found,
      (select count(*) from p where p.icp_id = i.id and p.created_at >= now() - make_interval(days => p_days) and p.status <> 'rejected') as passed_filter
    from public.icps i
    where i.user_id = (select uid from me)
  ),
  totals as (
    select count(*) as invited, count(*) filter (where is_accepted) as accepted_of_sent, count(*) filter (where is_settled) as settled from sent
  )
  select jsonb_build_object(
    'period_days', p_days,
    'invited', (select invited from totals),
    'accepted', (select count(*) from p where accepted_at >= now() - make_interval(days => p_days)),
    'accepted_of_sent', (select accepted_of_sent from totals),
    'settled', (select settled from totals),
    'waiting', (select invited - settled from totals),
    'acceptance_rate', (select case when settled > 0 then round(accepted_of_sent::numeric / settled * 100, 1) end from totals),
    'pending_invites', (select count(*) from p where status = 'invited'),
    'qualified_waiting', (select count(*) from p where status = 'qualified'),
    'invited_last_7d', (select count(*) from p where invited_at >= now() - interval '7 days'),
    'people_searches_this_month', (select count(*) from public.network_search_runs r, me
        where r.user_id = me.uid and r.kind = 'people' and r.status <> 'queued'
          and r.created_at >= date_trunc('month', now())),
    'comments_pending_approval', (select count(*) from public.monitored_posts m, me where m.user_id = me.uid and m.status = 'pending'),
    'comments_posted', (select count(*) from public.monitored_posts m, me where m.user_id = me.uid and m.status = 'posted'
        and m.commented_at >= now() - make_interval(days => p_days)),
    'opportunities_open', (select count(*) from public.monitored_posts m, me where m.user_id = me.uid
        and m.status in ('pending','approved','queued') and m.signal_type in ('business_opportunity','hiring','pain_point')),
    'by_icp', coalesce((select jsonb_agg(jsonb_build_object('icp_id', id, 'name', name,
        'invited', invited, 'accepted', accepted, 'settled', settled, 'waiting', invited - settled,
        'acceptance_rate', case when settled > 0 then round(accepted::numeric / settled * 100, 1) end,
        'pending', pending, 'ready_to_invite', ready_to_invite,
        'found', found, 'passed_filter', passed_filter) order by invited desc, name) from per_icp), '[]'::jsonb)
  );
$function$;
