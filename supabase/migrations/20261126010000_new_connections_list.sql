-- People who accept an invitation join a list, so their posts are read like those of any contact.
--
-- Until now an accepted invitation was only marked "accepted": the person was in no list, and the
-- reading of posts goes through lists. The two halves of the product (meet new people, keep up with
-- the ones you know) did not connect.
--
--   * extension_status.add_accepted_to_list: the user's choice, on by default.
--   * campaign_profiles.auto_source: marks the one list per user that the product keeps for this
--     ('new_connections'). It is an ordinary list: it can be renamed, paused or deleted (a deleted one
--     is made again on the next acceptance, unless the choice above is off).
--   * add_accepted_to_list(user, prospects): called by the server when it notices acceptances.
alter table public.extension_status
  add column if not exists add_accepted_to_list boolean not null default true;
comment on column public.extension_status.add_accepted_to_list is 'People who accept an invitation are added to the "New connections" list';

alter table public.campaign_profiles
  add column if not exists auto_source text;
alter table public.campaign_profiles
  drop constraint if exists campaign_profiles_auto_source_known;
alter table public.campaign_profiles
  add constraint campaign_profiles_auto_source_known check (auto_source is null or auto_source in ('new_connections'));
create unique index if not exists campaign_profiles_one_auto_list
  on public.campaign_profiles (user_id, auto_source) where auto_source is not null;
comment on column public.campaign_profiles.auto_source is 'Set on the list the product fills by itself: new_connections = people who accepted an invitation';

create or replace function public.add_accepted_to_list(p_user_id uuid, p_prospect_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted boolean;
  list_id uuid;
  added integer := 0;
begin
  if p_prospect_ids is null or cardinality(p_prospect_ids) = 0 then return 0; end if;
  select e.add_accepted_to_list into wanted from extension_status e where e.user_id = p_user_id;
  if wanted is false then return 0; end if;

  -- Nobody new to add (each person is in one list at most): do not make an empty list.
  if not exists (
    select 1 from network_prospects p
     where p.user_id = p_user_id and p.status = 'accepted' and p.id = any (p_prospect_ids)
       and not exists (select 1 from campaign_leads l where l.user_id = p_user_id and l.linkedin_url = p.linkedin_url)
  ) then
    return 0;
  end if;

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
  return added;
end;
$$;

revoke all on function public.add_accepted_to_list(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.add_accepted_to_list(uuid, uuid[]) to service_role;

-- People who accepted before this existed.
select public.add_accepted_to_list(u.user_id, u.ids)
  from (select user_id, array_agg(id) ids from public.network_prospects where status = 'accepted' group by user_id) u;
