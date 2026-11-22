-- Second version of the single-claim guard (review of PR #41).
--  * A claim is any statement that writes status = 'in_progress'. It is accepted only from 'pending'.
--    The trigger fires on statements that set the status column, so it no longer depends on the
--    pick-up time differing, and ordinary updates of an in-progress row never reach it.
--  * An action held with a claim id can only be finished, failed or put back by the copy that holds
--    it: that copy proves it by writing released_claim_id = its claim id. A copy whose claim was
--    refused (older versions then write 'failed' by id) is refused again here.
--  * Exception: any copy may put a stuck action back to pending once it has been held for 4 minutes.
--  * Edge functions and SQL run without the 'authenticated' role and are not restricted.
alter table public.action_queue add column if not exists released_claim_id text;
comment on column public.action_queue.released_claim_id is
  'Written by the extension copy that holds the action when it changes the status: must equal claim_id.';

create or replace function public.action_queue_guard_claim()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  is_client boolean := coalesce(auth.role(), '') = 'authenticated';
begin
  if new.status = 'in_progress' then
    if old.status = 'pending' then
      return new;
    end if;
    raise exception 'action % is already % and cannot be taken again', old.id, old.status
      using errcode = 'P0001';
  end if;

  if old.status = 'in_progress' and old.claim_id is not null and is_client then
    if new.released_claim_id is distinct from old.claim_id
       and not (new.status = 'pending' and old.picked_up_at < now() - interval '4 minutes') then
      raise exception 'action % is held by another copy of the extension', old.id
        using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'pending' then
    new.claim_id := null;
    new.released_claim_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists action_queue_guard_claim on public.action_queue;
create trigger action_queue_guard_claim
  before update of status on public.action_queue
  for each row
  execute function public.action_queue_guard_claim();
