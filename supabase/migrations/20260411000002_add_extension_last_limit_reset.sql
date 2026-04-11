-- Restore the `last_limit_reset_at` column on extension_status that the
-- watchdog's daily-counter-reset section depends on. This column went
-- missing from the schema at some point, which silently broke the entire
-- section 0 of watchdog — the initial fetch errored out, allExt became
-- undefined, and every subsequent watchdog section that iterated over
-- `allExt` received zero rows. Counters weren't being reset daily.

ALTER TABLE public.extension_status
  ADD COLUMN IF NOT EXISTS last_limit_reset_at TIMESTAMPTZ;

COMMENT ON COLUMN public.extension_status.last_limit_reset_at IS
  'Last time watchdog reset the *_today counters. Set to now() whenever the date component changes between runs.';
