UPDATE action_queue 
SET status = 'pending', completed_at = NULL, result = NULL, picked_up_at = NULL, retry_count = 0
WHERE action_type = 'check_connection_status' 
AND status = 'completed' 
AND result::text LIKE '%no_top_card_found%'