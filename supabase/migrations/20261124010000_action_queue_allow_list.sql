-- The queue runs only the actions Olanovo does today. Everything else is refused.
--
-- 20261123200000 refused three message types by name. That left every other old type runnable
-- if a row for it ever appeared: follow_profile and like_post (still handled by the extension),
-- and the message helpers that extensions up to 0.6.6 would execute for any action_type handed
-- to them. Nothing queues those today, but that rested on one constant and one filter in the
-- scheduler. The rule now lives here, as a list of what is allowed.
--
-- Allowed:
--   visit_profile, find_latest_post           read a profile / its latest post
--   send_connection_request                   invitation with the note the person wrote
--   check_connection_status                   read whether an invitation was accepted
--   network_search_people, network_search_posts, network_sync_connections   read searches / connections
--   network_withdraw_invites                  withdraw old unanswered invitations
-- The "like in the same visit" option of find_latest_post is removed from the row as well.

create or replace function public.action_queue_type_allowed(p_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in (
    'visit_profile', 'find_latest_post',
    'send_connection_request', 'check_connection_status',
    'network_search_people', 'network_search_posts',
    'network_sync_connections', 'network_withdraw_invites'
  );
$$;

-- 1. Close anything else that is waiting (none in production on 23/11/2026).
update public.action_queue
   set status = 'cancelled', error_message = 'Action type is not allowed'
 where status in ('pending', 'in_progress')
   and not coalesce(public.action_queue_type_allowed(action_type), false);

update public.action_queue
   set action_data = action_data - 'like'
 where status in ('pending', 'in_progress')
   and action_data ? 'like';

-- 2. Insert: a type that is not allowed never enters the queue (the row is dropped, as
--    post_comment already was).
create or replace function public.action_queue_no_auto_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce(public.action_queue_type_allowed(new.action_type), false) then
    return null;
  end if;
  if new.action_data is not null and new.action_data ? 'like' then
    new.action_data := new.action_data - 'like';
  end if;
  return new;
end;
$$;

-- 3. Update: a row of a type that is not allowed cannot be made runnable, and the like option
--    cannot be put back.
create or replace function public.action_queue_no_retired_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('pending', 'in_progress') then
    if not coalesce(public.action_queue_type_allowed(new.action_type), false) then
      new.status := 'cancelled';
      new.error_message := 'Action type is not allowed';
    elsif new.action_data is not null and new.action_data ? 'like' then
      new.action_data := new.action_data - 'like';
    end if;
  end if;
  return new;
end;
$$;
