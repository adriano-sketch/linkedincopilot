-- Sales Navigator mode.
--  * The extension detects the LinkedIn plan (free / premium / sales_navigator) and stores it in
--    extension_status.linkedin_account_tier with linkedin_tier_detected_at.
--  * When Sales Navigator is active, people searches (ICP prospecting and "my contacts" for Growth)
--    use Sales Navigator lead search with real filters instead of the regular LinkedIn search.
--  * If a Sales Navigator page cannot be read, sales_nav_failed_at is stamped and the regular search
--    is used for the next 24 hours, so nothing stops.

alter table public.extension_status
  add column if not exists linkedin_tier_detected_at timestamptz,
  add column if not exists sales_nav_failed_at timestamptz;

alter table public.icps
  add column if not exists recently_posted boolean not null default false,
  add column if not exists changed_jobs boolean not null default false;

-- Seniority values understood by the Sales Navigator URL builder.
alter table public.icps drop constraint if exists icps_seniorities_check;
alter table public.icps add constraint icps_seniorities_check check (
  seniorities <@ array['entry','senior','manager','director','vp','cxo','owner']::text[]
);

-- When the plan changes, move the monthly search budget to the new plan's default, unless the user
-- had set a custom value (anything other than the old plan's default).
create or replace function public.extension_tier_budget()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_default int;
  new_default int;
begin
  if new.linkedin_account_tier is not distinct from old.linkedin_account_tier then
    return new;
  end if;
  old_default := case coalesce(old.linkedin_account_tier, 'free')
    when 'sales_navigator' then 600 when 'premium' then 300 else 250 end;
  new_default := case coalesce(new.linkedin_account_tier, 'free')
    when 'sales_navigator' then 600 when 'premium' then 300 else 250 end;
  if new.monthly_people_search_budget is not distinct from old.monthly_people_search_budget
     and coalesce(old.monthly_people_search_budget, old_default) in (old_default, 2000) then
    new.monthly_people_search_budget := new_default;
  end if;
  -- A new plan gets a fresh chance at Sales Navigator search.
  new.sales_nav_failed_at := null;
  return new;
end;
$$;

drop trigger if exists extension_tier_budget on public.extension_status;
create trigger extension_tier_budget
  before update of linkedin_account_tier on public.extension_status
  for each row execute function public.extension_tier_budget();
