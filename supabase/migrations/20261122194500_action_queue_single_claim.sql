-- One action, one run. An action may only be taken (status -> in_progress) while it is pending.
-- Enforced here and not only in the extension, because an older copy of the extension claims by id
-- alone and does not look at the result: with two copies on one account, both could run the same
-- invitation or message. The refusal is an error, so a copy that does not check simply stops.
alter table public.action_queue add column if not exists claim_id text;
comment on column public.action_queue.claim_id is
  'Random id written by the extension copy that took the action, so a retried request can tell its own claim from another copy''s.';

create or replace function public.action_queue_guard_claim()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.status = 'pending' then
    return new;
  end if;
  -- Already in progress: other fields may change, but taking it again (a new pick-up time) may not.
  if old.status = 'in_progress' and new.picked_up_at is not distinct from old.picked_up_at then
    return new;
  end if;
  raise exception 'action % is already % and cannot be taken again', old.id, old.status
    using errcode = 'P0001';
end;
$$;

drop trigger if exists action_queue_guard_claim on public.action_queue;
create trigger action_queue_guard_claim
  before update on public.action_queue
  for each row
  when (new.status = 'in_progress')
  execute function public.action_queue_guard_claim();
