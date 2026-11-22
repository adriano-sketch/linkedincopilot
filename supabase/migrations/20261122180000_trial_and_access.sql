-- 14-day free trial, no card. After it ends without a paid plan, Copilot stops looking for posts,
-- writing drafts and sending invitations; what is already in the Inbox stays visible.
alter table public.user_settings
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '14 days');

comment on column public.user_settings.trial_ends_at is
  'End of the free trial. Paid plans ignore it. Users cannot write this table (select only).';

-- Accounts that existed before the trial was introduced: the 14 days count from this migration.
-- (The owner account is extended by hand, outside this file.)

-- One place that answers "may Copilot work for this user right now?".
create or replace function public.has_product_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select us.plan in ('pro', 'agency') or us.trial_ends_at > now()
    from public.user_settings us
    where us.user_id = p_user_id
  ), false);
$$;
revoke all on function public.has_product_access(uuid) from public, anon, authenticated;
grant execute on function public.has_product_access(uuid) to service_role;
