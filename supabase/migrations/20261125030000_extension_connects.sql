-- When the site last asked for a session for the extension, per account. The function that hands
-- out those sessions refuses a second request within a short time, so that one account cannot
-- create sessions in a loop. Read and written only by that function (service role): row level
-- security is on and there is no policy for anyone else.
create table if not exists public.extension_connects (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_at timestamptz not null default now()
);
alter table public.extension_connects enable row level security;
revoke all on public.extension_connects from anon, authenticated;
