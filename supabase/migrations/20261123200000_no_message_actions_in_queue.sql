-- Message actions are retired. No copy of the extension, old or new, may run one.
--
-- The extension filter added in 0.6.7 only protects 0.6.7. An installed 0.6.6 would still claim a
-- pending send_dm row. So the rule lives here: these action types cannot enter the queue, cannot be
-- claimed, and any that are still waiting are closed.

-- 1. Close what is waiting (none in production on 23/11/2026; kept so the migration is complete anywhere).
update public.action_queue
   set status = 'cancelled', error_message = 'Retired action type: messages are no longer sent'
 where action_type in ('send_dm', 'send_followup', 'check_reply_status')
   and status in ('pending', 'in_progress');

-- 2. They cannot be inserted (same safety belt that already keeps post_comment out).
create or replace function public.action_queue_no_auto_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action_type in ('post_comment', 'send_dm', 'send_followup', 'check_reply_status') then
    return null;
  end if;
  return new;
end;
$$;

-- 3. They cannot be moved back to a runnable status either.
create or replace function public.action_queue_no_retired_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action_type in ('send_dm', 'send_followup', 'check_reply_status')
     and new.status in ('pending', 'in_progress') then
    new.status := 'cancelled';
    new.error_message := 'Retired action type: messages are no longer sent';
  end if;
  return new;
end;
$$;
drop trigger if exists action_queue_no_retired_claim on public.action_queue;
create trigger action_queue_no_retired_claim
  before update on public.action_queue
  for each row execute function public.action_queue_no_retired_claim();
