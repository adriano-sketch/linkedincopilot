-- Adding an accepted person to the "New connections" list can fail for a passing reason after the
-- acceptance itself was recorded. Nothing looked at that person again: later syncs only examine
-- invitations still open. Now the acceptance leaves a mark, and the mark is cleared only when the
-- addition was done or validly not needed (the setting is off, the person is already in a list).
--
-- The mark is set by the database when the status becomes "accepted", whatever code made the change.
-- It is not set when the user takes someone out of the list, so nobody is put back against their will.
alter table public.network_prospects
  add column if not exists list_add_pending boolean not null default false;
comment on column public.network_prospects.list_add_pending is 'Accepted, and not yet handled by add_accepted_to_list';
create index if not exists network_prospects_list_add_pending
  on public.network_prospects (user_id) where list_add_pending;

create or replace function public.network_prospects_mark_list_add()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.list_add_pending := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_np_mark_list_add on public.network_prospects;
create trigger trg_np_mark_list_add
  before update of status on public.network_prospects
  for each row execute function public.network_prospects_mark_list_add();

create or replace function public.add_accepted_to_list(p_user_id uuid, p_prospect_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  wanted boolean;
  list_id uuid;
  added integer := 0;
begin
  if p_prospect_ids is null or cardinality(p_prospect_ids) = 0 then return 0; end if;
  select e.add_accepted_to_list into wanted from extension_status e where e.user_id = p_user_id;

  if wanted is not false and exists (
    select 1 from network_prospects p
     where p.user_id = p_user_id and p.status = 'accepted' and p.id = any (p_prospect_ids)
       and not exists (select 1 from campaign_leads l where l.user_id = p_user_id and l.linkedin_url = p.linkedin_url)
  ) then
    select c.id into list_id from campaign_profiles c
     where c.user_id = p_user_id and c.auto_source = 'new_connections';
    if list_id is null then
      insert into campaign_profiles (user_id, name, campaign_mode, campaign_objective, dm_tone, is_default, is_template, lead_source, status, auto_source)
      values (p_user_id, 'New connections', 'growth', 'build_relationship', 'professional_warm', false, false, 'manual', 'active', 'new_connections')
      on conflict (user_id, auto_source) where auto_source is not null do nothing
      returning id into list_id;
      if list_id is null then
        select c.id into list_id from campaign_profiles c
         where c.user_id = p_user_id and c.auto_source = 'new_connections';
      end if;
    end if;

    -- Due a year ago: the reading cycle takes people in order of due date, and someone who has just
    -- accepted is the person to look at first, ahead of a long list waiting its turn. Only for this
    -- first look; after it the usual rest periods apply.
    insert into campaign_leads (user_id, campaign_profile_id, linkedin_url, full_name, title, company, location, source, status, next_action_at)
    select p.user_id, list_id, p.linkedin_url,
           coalesce(nullif(btrim(p.full_name), ''), split_part(p.linkedin_url, '/in/', 2)),
           nullif(btrim(p.headline), ''), nullif(btrim(p.current_company), ''), nullif(btrim(p.location), ''),
           'network_invite', 'ready', now() - interval '1 year'
      from network_prospects p
     where p.user_id = p_user_id and p.status = 'accepted' and p.id = any (p_prospect_ids)
    on conflict (user_id, linkedin_url) do nothing;
    get diagnostics added = row_count;
  end if;

  -- Handled: added, already in a list, or not wanted. An error above leaves the mark for the next try.
  update network_prospects p set list_add_pending = false
   where p.user_id = p_user_id and p.id = any (p_prospect_ids) and p.list_add_pending;
  return added;
end;
$$;

-- Everyone of this user still marked. Called on every sync, so a failed addition is tried again.
create or replace function public.add_pending_accepted_to_list(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ids uuid[];
begin
  select array_agg(p.id) into ids from network_prospects p
   where p.user_id = p_user_id and p.status = 'accepted' and p.list_add_pending;
  if ids is null then return 0; end if;
  return public.add_accepted_to_list(p_user_id, ids);
end;
$$;

revoke all on function public.add_accepted_to_list(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.add_accepted_to_list(uuid, uuid[]) to service_role;
revoke all on function public.add_pending_accepted_to_list(uuid) from public, anon, authenticated;
grant execute on function public.add_pending_accepted_to_list(uuid) to service_role;
revoke all on function public.network_prospects_mark_list_add() from public, anon, authenticated;

-- Accepted between the first version of this and now, by code that did not add them: mark and add.
update public.network_prospects p set list_add_pending = true
 where p.status = 'accepted'
   and not exists (select 1 from public.campaign_leads l where l.user_id = p.user_id and l.linkedin_url = p.linkedin_url)
   and p.accepted_at > timestamptz '2026-11-26 15:00:00+00';
select public.add_pending_accepted_to_list(u.user_id)
  from (select distinct user_id from public.network_prospects where list_add_pending) u;
