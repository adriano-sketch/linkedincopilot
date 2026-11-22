-- Third pass on the claim guard (second review of PR #41).
--  * Ownership is checked on every status write of an action that carries a claim id, not only while
--    it is in progress: a copy that lost the claim could otherwise write 'failed' over an action the
--    holder had already completed.
--  * The proof (released_claim_id) is consumed by each accepted write, so a later write cannot
--    inherit it from the row.
--  * The protection covers the 15 minutes after the pick-up, which is when a losing copy writes.
--    Older rows can be changed as before (retries and clean-up of long-finished actions).
--  * Unchanged: a claim is accepted only from 'pending'; a stuck action may be put back to pending by
--    any copy after 4 minutes; edge functions and SQL are not restricted.
create or replace function public.action_queue_guard_claim()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  is_client boolean := coalesce(auth.role(), '') = 'authenticated';
  fresh boolean := old.picked_up_at is not null and old.picked_up_at > now() - interval '15 minutes';
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

  if is_client and old.claim_id is not null and old.status is distinct from 'pending' and fresh
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
