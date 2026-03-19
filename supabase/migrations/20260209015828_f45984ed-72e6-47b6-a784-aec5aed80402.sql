
-- Add DM tracking columns to linkedin_events
ALTER TABLE public.linkedin_events
  ADD COLUMN IF NOT EXISTS dm_status TEXT DEFAULT 'NEEDS_SNAPSHOT',
  ADD COLUMN IF NOT EXISTS dm_sent_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

-- Add check constraint for dm_status values
ALTER TABLE public.linkedin_events
  ADD CONSTRAINT linkedin_events_dm_status_check
  CHECK (dm_status IN ('NEEDS_SNAPSHOT', 'READY_TO_SEND', 'SENT', 'REPLIED', 'NO_REPLY', 'DO_NOT_CONTACT'));

-- Backfill: set dm_status based on existing status column
UPDATE public.linkedin_events SET dm_status = 'READY_TO_SEND' WHERE status = 'READY';
