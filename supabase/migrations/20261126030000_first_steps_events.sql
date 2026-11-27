-- First steps funnel: the first time each person reaches each stage of the setup.
-- One row per person and stage. Written only through mark_first_step(); nobody reads it from the app.

create table if not exists public.first_steps_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in (
    'setup_opened',
    'about_saved',
    'audience_saved',
    'extension_step_opened',
    'store_link_clicked',
    'extension_detect_started',
    'extension_connected',
    'setup_finished',
    'setup_finished_without_extension'
  )),
  first_at timestamptz not null default now(),
  primary key (user_id, event)
);

alter table public.first_steps_events enable row level security;
-- No policies: the app cannot read or write the table directly.
revoke all on public.first_steps_events from anon, authenticated;

create or replace function public.mark_first_step(p_event text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.first_steps_events (user_id, event)
  values (auth.uid(), p_event)
  on conflict do nothing;
exception
  -- An unknown stage name must never break the screen that reported it.
  when check_violation then
    return;
end;
$$;

revoke all on function public.mark_first_step(text) from public, anon;
grant execute on function public.mark_first_step(text) to authenticated;
