-- Review of PR #41, last comment: the 15-minute window must not apply to actions still in progress.
-- A claimed action that is in progress is protected for as long as it is in progress (any copy may
-- still put a stuck one back to pending after 4 minutes). The 15-minute window only limits how long
-- a finished action stays protected.
create or replace function public.action_queue_guard_claim()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  is_client boolean := coalesce(auth.role(), '') = 'authenticated';
  guarded boolean := old.status = 'in_progress'
                     or (old.picked_up_at is not null and old.picked_up_at > now() - interval '15 minutes');
  aged_reset boolean := old.status = 'in_progress' and new.status = 'pending'
                        and old.picked_up_at < now() - interval '4 minutes';
begin
  if new.status = 'in_progress' then
    if old.status is distinct from 'pending' then
      raise exception 'action % is already % and cannot be taken again', old.id, old.status
        using errcode = 'P0001';
    end if;
    new.released_claim_id := null;
    return new;
  end if;

  if is_client and old.claim_id is not null and old.status is distinct from 'pending' and guarded
     and new.released_claim_id is distinct from old.claim_id and not aged_reset then
    raise exception 'action % is held by another copy of the extension', old.id
      using errcode = 'P0001';
  end if;

  -- The proof is used once.
  new.released_claim_id := null;
  if new.status = 'pending' then
    new.claim_id := null;
  end if;
  return new;
end;
$$;
