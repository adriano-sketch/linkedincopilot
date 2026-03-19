
-- Add heyreach_webhook_registered column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS heyreach_webhook_registered BOOLEAN DEFAULT FALSE;
