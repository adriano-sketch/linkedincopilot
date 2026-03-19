
ALTER TABLE public.campaign_profiles
ADD COLUMN stage_connection_approved boolean NOT NULL DEFAULT false,
ADD COLUMN stage_dm_approved boolean NOT NULL DEFAULT false,
ADD COLUMN stage_followup_approved boolean NOT NULL DEFAULT false;

-- For existing active campaigns with auto_approve_dms=true, set all stages as approved
UPDATE public.campaign_profiles
SET stage_connection_approved = true,
    stage_dm_approved = true,
    stage_followup_approved = true
WHERE auto_approve_dms = true;
