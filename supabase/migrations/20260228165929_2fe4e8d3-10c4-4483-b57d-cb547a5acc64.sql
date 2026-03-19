
ALTER TABLE public.generated_messages ADD COLUMN IF NOT EXISTS connection_note text;
ALTER TABLE public.campaign_leads ADD COLUMN IF NOT EXISTS connection_note text;
