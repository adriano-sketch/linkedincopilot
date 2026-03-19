-- Reset ALL false-positive "connected" leads back to connection_sent
-- The extension was using a broad fallback selector that matched wrong buttons
UPDATE campaign_leads 
SET status = 'connection_sent',
    connection_accepted_at = NULL,
    connected_at = NULL,
    updated_at = now()
WHERE status = 'connected';

-- Reset completed check_connection_status actions to re-run with fixed logic
UPDATE action_queue 
SET status = 'pending', 
    picked_up_at = NULL, 
    completed_at = NULL, 
    result = NULL, 
    error_message = NULL,
    scheduled_for = now()
WHERE action_type = 'check_connection_status' 
  AND status = 'completed';