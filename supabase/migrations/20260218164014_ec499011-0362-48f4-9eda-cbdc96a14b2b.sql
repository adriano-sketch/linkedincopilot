
-- Add new columns to campaign_leads for DM approval flow
ALTER TABLE campaign_leads 
  ADD COLUMN IF NOT EXISTS dm_text TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_text TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dm_pushed_at TIMESTAMPTZ;

-- Add auto_approve_dms to campaign_profiles
ALTER TABLE campaign_profiles 
  ADD COLUMN IF NOT EXISTS auto_approve_dms BOOLEAN DEFAULT false;
