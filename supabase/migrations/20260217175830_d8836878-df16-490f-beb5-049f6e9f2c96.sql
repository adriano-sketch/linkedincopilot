
-- Add master_onboarding_completed to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS master_onboarding_completed BOOLEAN DEFAULT FALSE;

-- Create campaign_profiles table
CREATE TABLE IF NOT EXISTS campaign_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  is_template BOOLEAN DEFAULT FALSE,
  
  -- Campaign strategy
  campaign_objective TEXT NOT NULL DEFAULT 'start_conversation',
  value_proposition TEXT,
  proof_points TEXT,
  
  -- Target audience
  icp_description TEXT,
  icp_titles TEXT[],
  pain_points TEXT[],
  
  -- Message style
  dm_tone TEXT NOT NULL DEFAULT 'professional_warm',
  dm_example TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE campaign_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaign profiles" ON campaign_profiles
  FOR ALL USING (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_campaign_profiles_user ON campaign_profiles(user_id);

-- Add campaign_profile_id to linkedin_events
ALTER TABLE linkedin_events ADD COLUMN IF NOT EXISTS campaign_profile_id UUID REFERENCES campaign_profiles(id) ON DELETE SET NULL;

-- Function to ensure only one default campaign per user
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_single_default_campaign
BEFORE INSERT OR UPDATE ON campaign_profiles
FOR EACH ROW EXECUTE FUNCTION ensure_single_default_campaign();

-- Trigger for updated_at
CREATE TRIGGER update_campaign_profiles_updated_at
BEFORE UPDATE ON campaign_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing users: set master_onboarding_completed for users who completed old onboarding
UPDATE profiles SET master_onboarding_completed = TRUE WHERE onboarding_completed = TRUE;

-- Create default campaign from old profile data for existing users who completed onboarding
INSERT INTO campaign_profiles (user_id, name, is_default, campaign_objective, value_proposition, proof_points, icp_description, icp_titles, pain_points, dm_tone, dm_example)
SELECT 
  p.user_id,
  'My Campaign',
  TRUE,
  COALESCE(p.campaign_objective, 
    CASE p.cta_goal 
      WHEN 'Agendar call' THEN 'book_call'
      WHEN 'Fazer pergunta' THEN 'start_conversation'
      WHEN 'Oferecer auditoria' THEN 'offer_audit'
      ELSE 'start_conversation'
    END),
  COALESCE(p.value_proposition, p.offer_focus),
  p.proof_points,
  COALESCE(p.icp_description, p.icp),
  p.icp_titles,
  p.pain_points,
  COALESCE(p.dm_tone,
    CASE p.tone
      WHEN 'Direto' THEN 'direct_bold'
      WHEN 'Amigável' THEN 'professional_warm'
      WHEN 'Formal' THEN 'consultative'
      WHEN 'Casual' THEN 'casual_peer'
      ELSE 'professional_warm'
    END),
  p.dm_example
FROM profiles p
WHERE p.onboarding_completed = TRUE;

-- Assign existing leads to their user's default campaign
UPDATE linkedin_events le
SET campaign_profile_id = cp.id
FROM campaign_profiles cp
WHERE cp.user_id = le.user_id AND cp.is_default = TRUE AND le.campaign_profile_id IS NULL;
