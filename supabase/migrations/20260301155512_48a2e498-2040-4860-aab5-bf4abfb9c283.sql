-- Enable pg_cron and pg_net for scheduled function calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_action ON campaign_leads(next_action_at) WHERE status NOT IN ('replied', 'no_reply', 'connection_rejected', 'icp_rejected', 'error');
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_profile ON campaign_leads(campaign_profile_id);
CREATE INDEX IF NOT EXISTS idx_action_queue_pending ON action_queue(user_id, scheduled_for) WHERE status = 'pending';