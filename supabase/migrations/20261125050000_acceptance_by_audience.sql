-- Acceptance rate by audience, counted so that it can be trusted.
--
-- Before: "accepted in the period" divided by "invited in the period". Those are two different groups
-- of people (someone invited last month and accepted this week counted above the line only), and an
-- invite sent yesterday counted against the rate although nobody had had the time to answer it.
--
-- Now the rate is counted on one group only: the invites sent in the period that are at least 14 days
-- old ("matured"). Younger invites are left out entirely, the accepted ones too: counting a young
-- invite as soon as it is accepted, while its unanswered neighbours of the same day wait, would push
-- the rate up.
--   invited           invites sent in the period
--   accepted          of those, accepted so far (any age)
--   matured           of those, sent at least 14 days ago
--   accepted_matured  of the matured ones, accepted
--   acceptance_rate   accepted_matured / matured, in percent; null when none has matured
--   waiting           invites sent in the period and less than 14 days old (invited - matured)
--   accepted_early    of the waiting ones, already accepted
-- and, for the fit check that decides who is invited (people found in the period):
--   checked           people the fit check gave a verdict on (found but not yet checked, or left out
--                     because they were already a connection, are not counted)
--   passed_filter     of the checked ones, how many it let through
--
-- The top-level 'accepted' keeps its meaning (connections noticed in the period, whenever invited,
-- in an audience or not): it feeds the "New connections" number, so it is not the sum of the rows.
-- 'accepted_at' is the moment the extension noticed the connection, which can be a day or more
-- after the person accepted.
create or replace function public.network_stats(p_days integer default 30)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with me as (select (select auth.uid()) as uid),
  p as (
    select np.id, np.icp_id, np.status, np.fit_score, np.created_at, np.invited_at, np.accepted_at
    from public.network_prospects np, me where np.user_id = me.uid
  ),
  sent as (
    select p.icp_id,
      (p.accepted_at is not null) as is_accepted,
      (p.invited_at < now() - interval '14 days') as is_matured
    from p
    where p.invited_at >= now() - make_interval(days => p_days)
  ),
  found as (
    select p.icp_id, p.status from p
    where p.created_at >= now() - make_interval(days => p_days) and p.fit_score is not null
  ),
  per_icp as (
    select i.id, i.name,
      (select count(*) from sent s where s.icp_id = i.id) as invited,
      (select count(*) from sent s where s.icp_id = i.id and s.is_accepted) as accepted,
      (select count(*) from sent s where s.icp_id = i.id and s.is_matured) as matured,
      (select count(*) from sent s where s.icp_id = i.id and s.is_matured and s.is_accepted) as accepted_matured,
      (select count(*) from sent s where s.icp_id = i.id and not s.is_matured and s.is_accepted) as accepted_early,
      (select count(*) from p where p.icp_id = i.id and p.status = 'invited') as pending,
      (select count(*) from p where p.icp_id = i.id and p.status = 'qualified') as ready_to_invite,
      (select count(*) from found f where f.icp_id = i.id) as checked,
      (select count(*) from found f where f.icp_id = i.id and f.status <> 'rejected') as passed_filter
    from public.icps i
    where i.user_id = (select uid from me)
  ),
  totals as (
    select count(*) as invited,
      count(*) filter (where is_accepted) as accepted_of_sent,
      count(*) filter (where is_matured) as matured,
      count(*) filter (where is_matured and is_accepted) as accepted_matured,
      count(*) filter (where not is_matured and is_accepted) as accepted_early
    from sent
  )
  select jsonb_build_object(
    'period_days', p_days,
    'invited', (select invited from totals),
    'accepted', (select count(*) from p where accepted_at >= now() - make_interval(days => p_days)),
    'accepted_of_sent', (select accepted_of_sent from totals),
    'matured', (select matured from totals),
    'accepted_matured', (select accepted_matured from totals),
    'waiting', (select invited - matured from totals),
    'accepted_early', (select accepted_early from totals),
    'acceptance_rate', (select case when matured > 0 then round(accepted_matured::numeric / matured * 100, 1) end from totals),
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
        'invited', invited, 'accepted', accepted,
        'matured', matured, 'accepted_matured', accepted_matured,
        'waiting', invited - matured, 'accepted_early', accepted_early,
        'acceptance_rate', case when matured > 0 then round(accepted_matured::numeric / matured * 100, 1) end,
        'pending', pending, 'ready_to_invite', ready_to_invite,
        'checked', checked, 'passed_filter', passed_filter) order by invited desc, name) from per_icp), '[]'::jsonb)
  );
$function$;
