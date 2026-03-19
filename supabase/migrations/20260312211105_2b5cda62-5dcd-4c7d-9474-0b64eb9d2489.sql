
UPDATE campaign_leads 
SET status = 'new', 
    icp_match = NULL, 
    icp_checked_at = NULL, 
    icp_match_reason = NULL, 
    updated_at = now()
WHERE campaign_profile_id = '67c1e4ec-8a1e-415d-b19a-e589a749c043' 
  AND status = 'icp_rejected';
