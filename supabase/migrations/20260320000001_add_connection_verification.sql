ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS connection_verified boolean,
  ADD COLUMN IF NOT EXISTS connection_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS connection_verification_note text;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_connection_verified
  ON public.campaign_leads (campaign_profile_id, connection_verified);
