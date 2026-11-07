-- When the search-relevant fields of an ICP change, restart its people search from page 1.
-- Without this, the scheduler continues from the page it reached with the OLD filters and the
-- first pages of the new result set are never read (seen on 2026-11-07: adding the Florida
-- region filter made the scheduler ask for page 2 of a 2-page result set).
create or replace function public.icp_reset_people_search_on_change()
returns trigger
language plpgsql
as $$
begin
  if new.titles is distinct from old.titles
     or new.keywords is distinct from old.keywords
     or new.exclude_keywords is distinct from old.exclude_keywords
     or new.locations is distinct from old.locations
     or new.location_geo_ids is distinct from old.location_geo_ids
     or new.industries is distinct from old.industries
     or new.seniorities is distinct from old.seniorities
     or new.company_size_min is distinct from old.company_size_min
     or new.company_size_max is distinct from old.company_size_max
     or new.recently_posted is distinct from old.recently_posted
     or new.changed_jobs is distinct from old.changed_jobs
  then
    new.people_search_page := 0;
    new.people_search_exhausted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists icp_reset_people_search_on_change on public.icps;
create trigger icp_reset_people_search_on_change
  before update on public.icps
  for each row
  execute function public.icp_reset_people_search_on_change();
