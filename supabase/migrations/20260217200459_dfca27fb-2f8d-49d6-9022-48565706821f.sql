
-- Add missing columns to profiles for HeyReach and Apollo integration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS heyreach_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS apollo_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS heyreach_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS apollo_connected BOOLEAN DEFAULT FALSE;

-- Add missing columns to campaign_profiles
ALTER TABLE campaign_profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE campaign_profiles ADD COLUMN IF NOT EXISTS icp_locations TEXT[];
ALTER TABLE campaign_profiles ADD COLUMN IF NOT EXISTS icp_industries TEXT[];
ALTER TABLE campaign_profiles ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT 'csv';
ALTER TABLE campaign_profiles ADD COLUMN IF NOT EXISTS apollo_search_config JSONB;
ALTER TABLE campaign_profiles ADD COLUMN IF NOT EXISTS heyreach_campaign_id TEXT;
ALTER TABLE campaign_profiles ADD COLUMN IF NOT EXISTS heyreach_campaign_status TEXT;

-- Create campaign_leads table
CREATE TABLE IF NOT EXISTS campaign_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_profile_id UUID REFERENCES campaign_profiles(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  title TEXT,
  company TEXT,
  linkedin_url TEXT NOT NULL,
  location TEXT,
  industry TEXT,
  source TEXT DEFAULT 'csv',
  apollo_person_id TEXT,
  status TEXT DEFAULT 'new',
  heyreach_lead_id TEXT,
  connection_sent_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  dm_generated_at TIMESTAMPTZ,
  dm_sent_at TIMESTAMPTZ,
  followup_due_at TIMESTAMPTZ,
  followup_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  snapshot_id UUID,
  linkedin_event_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on campaign_leads
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_leads
CREATE POLICY "Users manage own campaign leads" ON campaign_leads
  FOR ALL USING (auth.uid() = user_id);

-- Indexes for campaign_leads
CREATE INDEX IF NOT EXISTS idx_campaign_leads_user ON campaign_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON campaign_leads(campaign_profile_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_linkedin ON campaign_leads(linkedin_url);

-- Trigger for single default campaign per user
CREATE OR REPLACE FUNCTION ensure_single_default_campaign()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE campaign_profiles
    SET is_default = FALSE
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_single_default_campaign ON campaign_profiles;
CREATE TRIGGER trg_single_default_campaign
BEFORE INSERT OR UPDATE ON campaign_profiles
FOR EACH ROW EXECUTE FUNCTION ensure_single_default_campaign();

-- updated_at trigger for campaign_leads
CREATE OR REPLACE FUNCTION update_campaign_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_campaign_leads_updated_at
BEFORE UPDATE ON campaign_leads
FOR EACH ROW EXECUTE FUNCTION update_campaign_leads_updated_at();
