-- Applied to production on 2026-10-03 (via MCP).
alter table public.extension_status add column if not exists timezone text default 'America/New_York';
