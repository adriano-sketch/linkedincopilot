-- A fresh draft can replace one that is already waiting (generate-comment writes status 'pending' on a
-- row that is already 'pending'). The status does not change there, so the trigger also watches
-- suggested_comment. Only the drafting functions write that column; the person's edits go to
-- final_comment and do not move the moment of the decision.
create or replace function public.monitored_posts_set_decided_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'new' then new.decided_at := now(); end if;
  elsif new.status is distinct from old.status and (old.status = 'new' or new.status = 'pending') then
    -- first decision, or a fresh draft written on a row that had been decided before
    new.decided_at := now();
  elsif new.status = 'pending' and new.suggested_comment is distinct from old.suggested_comment then
    -- a fresh draft replacing the one that was already waiting
    new.decided_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mp_decided_at on public.monitored_posts;
create trigger trg_mp_decided_at
  before insert or update of status, suggested_comment on public.monitored_posts
  for each row execute function public.monitored_posts_set_decided_at();
