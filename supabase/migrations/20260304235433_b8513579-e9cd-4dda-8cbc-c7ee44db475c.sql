-- Delete duplicate campaign_leads, keeping only the first (oldest) per linkedin_url per campaign
DELETE FROM campaign_leads
WHERE id NOT IN (
  SELECT DISTINCT ON (linkedin_url, campaign_profile_id) id
  FROM campaign_leads
  ORDER BY linkedin_url, campaign_profile_id, created_at ASC
)