
-- ============================================================
-- PROMPT 1: DATABASE FOUNDATION — LinkedIn Copilot v4
-- ============================================================

-- ── 1. REMOVE HeyReach columns from profiles ──
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS heyreach_api_key,
  DROP COLUMN IF EXISTS heyreach_connected,
  DROP COLUMN IF EXISTS heyreach_webhook_registered;

-- ── 2. REMOVE HeyReach columns from campaign_profiles ──
ALTER TABLE public.campaign_profiles
  DROP COLUMN IF EXISTS heyreach_campaign_id,
  DROP COLUMN IF EXISTS heyreach_campaign_status,
  DROP COLUMN IF EXISTS heyreach_list_id;

-- ── 3. ADD new ICP columns to campaign_profiles ──
ALTER TABLE public.campaign_profiles
  ADD COLUMN IF NOT EXISTS icp_job_titles TEXT[],
  ADD COLUMN IF NOT EXISTS icp_company_size_min INT,
  ADD COLUMN IF NOT EXISTS icp_company_size_max INT,
  ADD COLUMN IF NOT EXISTS icp_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS icp_exclude_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS campaign_angle TEXT;

-- ── 4. REMOVE HeyReach columns from campaign_leads ──
ALTER TABLE public.campaign_leads
  DROP COLUMN IF EXISTS heyreach_lead_id,
  DROP COLUMN IF EXISTS dm_pushed_at;

-- ── 5. ADD new columns to campaign_leads ──
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS icp_match BOOLEAN,
  ADD COLUMN IF NOT EXISTS icp_match_reason TEXT,
  ADD COLUMN IF NOT EXISTS icp_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS profile_headline TEXT,
  ADD COLUMN IF NOT EXISTS profile_about TEXT,
  ADD COLUMN IF NOT EXISTS profile_current_title TEXT,
  ADD COLUMN IF NOT EXISTS profile_current_company TEXT,
  ADD COLUMN IF NOT EXISTS profile_previous_title TEXT,
  ADD COLUMN IF NOT EXISTS profile_previous_company TEXT,
  ADD COLUMN IF NOT EXISTS profile_education TEXT,
  ADD COLUMN IF NOT EXISTS profile_skills TEXT[],
  ADD COLUMN IF NOT EXISTS profile_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS custom_dm TEXT,
  ADD COLUMN IF NOT EXISTS custom_followup TEXT,
  ADD COLUMN IF NOT EXISTS messages_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dm_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dm_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dm_edited_by_user BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sequence_step INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_visited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connection_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS post_liked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

-- ── 6. ADD indexes on campaign_leads ──
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON public.campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_action ON public.campaign_leads(next_action_at) WHERE status NOT IN ('replied', 'no_reply', 'connection_rejected', 'icp_rejected', 'error');
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON public.campaign_leads(campaign_profile_id);

-- ── 7. CREATE extension_status table ──
CREATE TABLE IF NOT EXISTS public.extension_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  is_connected BOOLEAN DEFAULT false,
  last_heartbeat_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ,
  browser_fingerprint TEXT,
  linkedin_logged_in BOOLEAN DEFAULT false,
  linkedin_profile_url TEXT,
  actions_today INT DEFAULT 0,
  connection_requests_today INT DEFAULT 0,
  messages_today INT DEFAULT 0,
  daily_limit_connection_requests INT DEFAULT 40,
  daily_limit_messages INT DEFAULT 100,
  timezone TEXT DEFAULT 'America/New_York',
  last_limit_reset_at TIMESTAMPTZ DEFAULT NOW(),
  is_paused BOOLEAN DEFAULT false,
  is_rate_limited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.extension_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own extension status"
  ON public.extension_status FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 8. CREATE action_queue table ──
CREATE TABLE IF NOT EXISTS public.action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_lead_id UUID NOT NULL REFERENCES public.campaign_leads(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  message_text TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  priority INT DEFAULT 5,
  status TEXT DEFAULT 'pending',
  picked_up_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.action_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own action queue"
  ON public.action_queue FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_action_queue_pending ON public.action_queue(user_id, scheduled_for) WHERE status = 'pending';

-- ── 9. CREATE activity_log table ──
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_lead_id UUID REFERENCES public.campaign_leads(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own activity log"
  ON public.activity_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 10. Enable Realtime on key tables ──
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.extension_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
