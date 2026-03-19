-- Reset all false-negative check_connection_status actions to re-run with fixed detection
UPDATE action_queue 
SET status = 'pending', 
    picked_up_at = NULL, 
    completed_at = NULL, 
    result = NULL, 
    error_message = NULL,
    scheduled_for = now()
WHERE action_type = 'check_connection_status' 
  AND status = 'completed' 
  AND coalesce((result->>'is_connected')::boolean, false) = false;