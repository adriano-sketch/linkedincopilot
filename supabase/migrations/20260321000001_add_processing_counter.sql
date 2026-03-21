-- Credit Model v2: add processing counter to user_settings

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS leads_processed_this_cycle INTEGER DEFAULT 0;

COMMENT ON COLUMN public.user_settings.leads_used_this_cycle IS 'Outreach credits: only counted when full cycle completes (enrich + ICP + messages generated)';
COMMENT ON COLUMN public.user_settings.leads_processed_this_cycle IS 'Processing count: incremented every time ScrapIn API is called (includes ghosts and ICP rejects)';
