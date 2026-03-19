
-- Reset all 25 false-positive "connected" leads back to connection_sent
-- These were detected with buggy broad selectors (60 buttons found)
UPDATE campaign_leads 
SET status = 'connection_sent',
    connection_accepted_at = NULL,
    connected_at = NULL,
    updated_at = now()
WHERE status = 'connected' 
  AND connection_accepted_at >= '2026-03-11 17:40:00';

-- Reset the corresponding check_connection_status actions to re-run
UPDATE action_queue 
SET status = 'pending', 
    picked_up_at = NULL, 
    completed_at = NULL, 
    result = NULL, 
    error_message = NULL,
    scheduled_for = now()
WHERE action_type = 'check_connection_status' 
  AND status = 'completed'
  AND completed_at >= '2026-03-11 17:40:00';
