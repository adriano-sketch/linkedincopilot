-- Applied to production on 2026-10-03 (via MCP). Columns that edge functions already wrote/read.
alter table public.extension_status
  add column if not exists last_action_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists browser_fingerprint text,
  add column if not exists linkedin_profile_url text,
  add column if not exists daily_limit_connection_requests integer,
  add column if not exists daily_limit_messages integer;
