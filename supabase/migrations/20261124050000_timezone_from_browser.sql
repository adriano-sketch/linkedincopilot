-- A new account worked in New York time until the person found the setting, wherever they were.
-- The app now sets the zone from the browser the first time it sees the account's extension row.
-- This flag says whether that (or a choice in Settings) has happened, so it happens once and never
-- overrides what the person chose.
--
-- Accounts that already exist keep the zone they have: the column is added as true for them, and
-- only then does the default become false for rows created from now on. Written this way so that
-- running the file again changes nothing (a second run must not confirm newer accounts).
alter table public.extension_status
  add column if not exists timezone_confirmed boolean not null default true;
alter table public.extension_status
  alter column timezone_confirmed set default false;
