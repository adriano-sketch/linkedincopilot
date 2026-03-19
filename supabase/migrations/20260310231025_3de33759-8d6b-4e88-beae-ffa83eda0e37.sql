-- Round 3: Revert ALL false-positive connected leads back to connection_sent
-- Root cause: check_connection_status never navigated to the lead's profile
UPDATE public.campaign_leads
SET status = 'connection_sent',
    connection_accepted_at = NULL,
    next_action_at = now(),
    updated_at = now()
WHERE status = 'connected'
  AND connection_accepted_at >= '2026-03-10T00:00:00Z';

-- Clean up ALL completed check_connection_status actions from today so they get re-scheduled
DELETE FROM public.action_queue
WHERE action_type = 'check_connection_status'
  AND status = 'completed'
  AND completed_at >= '2026-03-10T00:00:00Z';