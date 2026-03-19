-- Fix LinkedIn URLs missing protocol
UPDATE campaign_leads 
SET linkedin_url = 'https://www.' || linkedin_url
WHERE linkedin_url NOT LIKE 'http%' 
  AND linkedin_url LIKE 'linkedin.com/%';

-- Also fix action_queue URLs  
UPDATE action_queue
SET linkedin_url = 'https://www.' || linkedin_url
WHERE linkedin_url NOT LIKE 'http%'
  AND linkedin_url LIKE 'linkedin.com/%';