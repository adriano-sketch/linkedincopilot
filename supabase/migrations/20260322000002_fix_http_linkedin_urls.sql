-- Normalize http LinkedIn URLs to https and retry 404s

WITH updated AS (
  UPDATE public.campaign_leads
  SET linkedin_url = regexp_replace(linkedin_url, '^http://', 'https://', 1, 1, 'i'),
      updated_at = NOW()
  WHERE linkedin_url ILIKE 'http://%linkedin.com/%'
  RETURNING id
)
UPDATE public.campaign_leads
SET
  status = 'new',
  profile_enriched_at = NULL,
  error_message = NULL,
  updated_at = NOW()
WHERE id IN (SELECT id FROM updated)
  AND error_message = 'Profile not found on LinkedIn (404)';
