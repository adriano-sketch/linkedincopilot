-- Revert false-positive "connected" leads back to "connection_sent" (round 2)
-- All 83 check_connection_status actions completed with old buggy extension
UPDATE public.campaign_leads
SET status = 'connection_sent',
    connection_accepted_at = NULL,
    next_action_at = now(),
    updated_at = now()
WHERE status = 'connected'
  AND connection_accepted_at >= '2026-03-10T00:00:00Z';

-- Also clean up old completed check_connection_status actions so they can be re-scheduled
DELETE FROM public.action_queue
WHERE action_type = 'check_connection_status'
  AND status = 'completed'
  AND completed_at >= '2026-03-10T00:00:00Z';