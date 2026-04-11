-- Add variant tagging columns so generate-dm can record which prompt strategy
-- was used for each generated message. This enables A/B learning: we can later
-- join on reply_rate and learn which variants land.

ALTER TABLE public.generated_messages
  ADD COLUMN IF NOT EXISTS dm_variant TEXT,
  ADD COLUMN IF NOT EXISTS variant_meta JSONB;

ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS dm_variant TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_messages_variant
  ON public.generated_messages (dm_variant);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_variant
  ON public.campaign_leads (dm_variant)
  WHERE dm_variant IS NOT NULL;

COMMENT ON COLUMN public.generated_messages.dm_variant IS
  'Strategy variant key used during generation (e.g. curiosity_question_v1). Enables A/B learning over time.';
COMMENT ON COLUMN public.generated_messages.variant_meta IS
  'Additional variant metadata (hook_type, structure, length_bucket, tone).';
COMMENT ON COLUMN public.campaign_leads.dm_variant IS
  'Denormalized variant key so reply-rate joins are fast without touching generated_messages.';
