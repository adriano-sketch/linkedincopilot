UPDATE campaign_leads 
SET next_action_at = NOW() + (random() * interval '30 minutes')
WHERE status = 'ready' AND sequence_step = 0 AND next_action_at > NOW();