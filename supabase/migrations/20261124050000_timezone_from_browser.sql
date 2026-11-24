-- A new account worked in New York time until the person found the setting, wherever they were.
-- The app now sets the zone from the browser the first time it sees the account's extension row.
-- This flag says whether that (or a choice in Settings) has happened, so it happens once and never
-- overrides what the person chose.
alter table public.extension_status
  add column if not exists timezone_confirmed boolean not null default false;

-- Accounts that already exist keep the zone they have.
update public.extension_status set timezone_confirmed = true where timezone_confirmed = false;
