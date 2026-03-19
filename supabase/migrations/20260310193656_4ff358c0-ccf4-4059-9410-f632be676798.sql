-- Revert false-positive "connected" leads back to "connection_sent"
-- These were all marked connected today by the buggy check_connection_status
UPDATE public.campaign_leads
SET status = 'connection_sent',
    connection_accepted_at = NULL,
    next_action_at = now(),
    updated_at = now()
WHERE status = 'connected'
  AND connection_accepted_at >= '2026-03-10T18:00:00Z';