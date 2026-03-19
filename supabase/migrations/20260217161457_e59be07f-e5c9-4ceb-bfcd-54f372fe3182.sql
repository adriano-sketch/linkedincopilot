
-- New onboarding fields for profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_description TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS campaign_objective TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS value_proposition TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pain_points TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS proof_points TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS icp_description TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS icp_titles TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dm_tone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dm_example TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sender_title TEXT;

-- Migrate existing data for users who already completed onboarding
UPDATE profiles SET 
  value_proposition = offer_focus,
  icp_description = icp,
  dm_tone = CASE 
    WHEN tone = 'Direct' THEN 'direct_bold'
    WHEN tone = 'Friendly' THEN 'casual_peer'
    WHEN tone = 'Formal' THEN 'consultative'
    WHEN tone = 'Casual' THEN 'casual_peer'
    ELSE 'professional_warm'
  END,
  campaign_objective = CASE 
    WHEN cta_goal = 'Book a call' THEN 'book_call'
    WHEN cta_goal = 'Ask a question' THEN 'start_conversation'
    WHEN cta_goal = 'Offer a quick audit' THEN 'offer_audit'
    ELSE 'start_conversation'
  END
WHERE onboarding_completed = true 
  AND value_proposition IS NULL;
