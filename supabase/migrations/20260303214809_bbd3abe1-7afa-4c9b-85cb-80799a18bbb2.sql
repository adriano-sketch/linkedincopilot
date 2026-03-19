
ALTER TABLE public.activity_log 
  DROP CONSTRAINT activity_log_campaign_lead_id_fkey,
  ADD CONSTRAINT activity_log_campaign_lead_id_fkey 
    FOREIGN KEY (campaign_lead_id) REFERENCES public.campaign_leads(id) ON DELETE CASCADE;
