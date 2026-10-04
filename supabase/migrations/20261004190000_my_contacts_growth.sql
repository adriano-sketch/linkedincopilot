-- My contacts + Growth approval queue (2026-10-04)
--
-- 1. linkedin_connections: the user's own 1st-degree connections, imported from LinkedIn's
--    official data export (Connections.csv) or found by the extension (people search
--    restricted to 1st-degree connections).
-- 2. connection_matches: Claude's fit score of each connection for a Growth campaign, plus
--    whether the user selected it as a target.
-- 3. network_search_runs gains kind 'connections' (and the campaign it belongs to).
-- 4. Growth comments stop being auto-approved: generate-comment puts them in the same
--    approval queue as the Network module (monitored_posts.campaign_lead_id). Approving or
--    skipping in the dashboard moves the Growth lead forward through the triggers below.

-- ── 1. linkedin_connections ────────────────────────────────────────────────
create table if not exists public.linkedin_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  linkedin_url text not null,
  full_name text,
  headline text,
  position text,
  company text,
  location text,
  connected_on date,
  source text not null default 'linkedin_export' check (source in ('linkedin_export', 'linkedin_search')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, linkedin_url)
);
create index if not exists linkedin_connections_user_idx on public.linkedin_connections (user_id, created_at desc);

alter table public.linkedin_connections enable row level security;
drop policy if exists own_select on public.linkedin_connections;
drop policy if exists own_insert on public.linkedin_connections;
drop policy if exists own_update on public.linkedin_connections;
drop policy if exists own_delete on public.linkedin_connections;
create policy own_select on public.linkedin_connections for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.linkedin_connections for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.linkedin_connections for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.linkedin_connections for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.linkedin_connections to authenticated;

-- ── 2. connection_matches ──────────────────────────────────────────────────
create table if not exists public.connection_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_profile_id uuid not null references public.campaign_profiles(id) on delete cascade,
  connection_id uuid not null references public.linkedin_connections(id) on delete cascade,
  score int not null check (score between 0 and 100),
  reason text,
  criteria text,            -- the description the score was computed against
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (campaign_profile_id, connection_id)
);
create index if not exists connection_matches_campaign_idx on public.connection_matches (campaign_profile_id, score desc);
create index if not exists connection_matches_user_idx on public.connection_matches (user_id);
create index if not exists connection_matches_connection_idx on public.connection_matches (connection_id);

alter table public.connection_matches enable row level security;
drop policy if exists own_select on public.connection_matches;
drop policy if exists own_update on public.connection_matches;
drop policy if exists own_delete on public.connection_matches;
-- Inserts come from the contacts-match edge function (service role).
create policy own_select on public.connection_matches for select to authenticated using (user_id = (select auth.uid()));
create policy own_update on public.connection_matches for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.connection_matches for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.connection_matches to authenticated;
grant update (selected) on public.connection_matches to authenticated;

-- ── 3. network_search_runs: kind 'connections' ─────────────────────────────
alter table public.network_search_runs drop constraint if exists network_search_runs_kind_check;
alter table public.network_search_runs add constraint network_search_runs_kind_check
  check (kind = any (array['people'::text, 'posts'::text, 'connections'::text]));
alter table public.network_search_runs
  add column if not exists campaign_profile_id uuid references public.campaign_profiles(id) on delete cascade;
create index if not exists network_search_runs_campaign_idx on public.network_search_runs (campaign_profile_id) where campaign_profile_id is not null;

-- ── 4. Growth comments go through the approval queue ───────────────────────
alter table public.monitored_posts
  add column if not exists campaign_lead_id uuid references public.campaign_leads(id) on delete cascade;
create index if not exists monitored_posts_campaign_lead_idx on public.monitored_posts (campaign_lead_id) where campaign_lead_id is not null;

-- Approve / skip in the dashboard → move the Growth lead forward.
-- Approved Growth comments go straight to 'queued': the Growth engine (schedule-actions)
-- posts them, not the Network scheduler, so they are never posted twice.
create or replace function public.growth_comment_review_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.campaign_lead_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'approved' then
    update public.campaign_leads
       set comment_text = coalesce(nullif(new.final_comment, ''), new.suggested_comment),
           comment_approved = true,
           comment_approved_at = now(),
           status = 'post_liked',
           next_action_at = now(),
           updated_at = now()
     where id = new.campaign_lead_id
       and user_id = new.user_id
       and status = 'comment_review';
    new.status := 'queued';
  elsif new.status = 'dismissed' then
    update public.campaign_leads
       set status = 'engagement_done',
           next_action_at = now() + interval '7 days',
           last_engagement_at = now(),
           post_url = null,
           post_content = null,
           comment_text = null,
           comment_approved = false,
           updated_at = now()
     where id = new.campaign_lead_id
       and user_id = new.user_id
       and status = 'comment_review';
  end if;
  return new;
end;
$$;

drop trigger if exists monitored_posts_growth_review on public.monitored_posts;
create trigger monitored_posts_growth_review
  before update of status on public.monitored_posts
  for each row execute function public.growth_comment_review_sync();

-- Growth comment posted by the extension → mark it posted in the queue.
create or replace function public.growth_comment_posted_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.comment_posted_at is not null and new.comment_posted_at is distinct from old.comment_posted_at then
    update public.monitored_posts
       set status = 'posted', commented_at = new.comment_posted_at, updated_at = now()
     where campaign_lead_id = new.id
       and user_id = new.user_id
       and status = 'queued';
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_leads_growth_posted on public.campaign_leads;
create trigger campaign_leads_growth_posted
  after update of comment_posted_at on public.campaign_leads
  for each row execute function public.growth_comment_posted_sync();

revoke all on function public.growth_comment_review_sync() from public, anon, authenticated;
revoke all on function public.growth_comment_posted_sync() from public, anon, authenticated;

-- Connections of a user not yet scored for a campaign (used by contacts-match, service role).
create or replace function public.unscored_connections(p_user_id uuid, p_campaign_id uuid, p_limit int default 160)
returns table (id uuid, full_name text, headline text, job_title text, company text)
language sql
stable
set search_path = ''
as $$
  select c.id, c.full_name, c.headline, c."position", c.company
  from public.linkedin_connections c
  where c.user_id = p_user_id
    and not exists (
      select 1 from public.connection_matches m
      where m.campaign_profile_id = p_campaign_id and m.connection_id = c.id
    )
  order by c.created_at
  limit greatest(1, least(p_limit, 500));
$$;
revoke all on function public.unscored_connections(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.unscored_connections(uuid, uuid, int) to service_role;
