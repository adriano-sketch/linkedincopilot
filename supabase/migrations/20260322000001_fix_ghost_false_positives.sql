-- Fix false-positive ghost profiles caused by wrong ScrapIn field paths

-- Remove ghost blacklist entries created by the bug
DELETE FROM public.ghost_profiles
WHERE reason = 'ghost_minimal_data';

-- Reset incorrectly skipped leads so they can be re-processed
UPDATE public.campaign_leads
SET
  status = 'new',
  profile_enriched_at = NULL,
  profile_quality_status = NULL,
  error_message = NULL,
  updated_at = NOW()
WHERE
  status = 'skipped'
  AND profile_quality_status = 'ghost'
  AND error_message LIKE 'Ghost profile%';
