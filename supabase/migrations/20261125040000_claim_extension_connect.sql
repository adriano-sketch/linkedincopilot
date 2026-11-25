-- The check ("was a session asked for less than N seconds ago?") and the mark ("one is being asked
-- for now") in a single statement, so two requests arriving together cannot both pass.
-- Returns true when this call took the turn, false when it is too soon.
create or replace function public.claim_extension_connect(p_user uuid, p_wait_seconds integer)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  claimed uuid;
begin
  insert into public.extension_connects as c (user_id, last_at)
  values (p_user, now())
  on conflict (user_id) do update
    set last_at = now()
    where c.last_at < now() - make_interval(secs => greatest(p_wait_seconds, 0))
  returning c.user_id into claimed;
  return claimed is not null;
end;
$$;

revoke all on function public.claim_extension_connect(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_extension_connect(uuid, integer) to service_role;
