
ALTER TABLE campaign_profiles
  ADD COLUMN IF NOT EXISTS heyreach_list_id TEXT;
