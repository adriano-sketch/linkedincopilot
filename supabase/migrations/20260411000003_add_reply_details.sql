-- Reply classification columns for campaign_leads
-- Added to support author-based reply detection + Claude Haiku sentiment
-- classification. Without these columns, every reply collapses into the
-- same "replied" bucket and the funnel can't distinguish a positive
-- meeting request from a "remove me from this list".

ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS reply_text          TEXT,
  ADD COLUMN IF NOT EXISTS reply_sentiment     TEXT,
  ADD COLUMN IF NOT EXISTS reply_intent        TEXT,
  ADD COLUMN IF NOT EXISTS reply_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_detected_at   TIMESTAMPTZ;

-- Sanity constraint — keep the sentiment/intent fields bounded so downstream
-- dashboards don't have to defensively normalize strings.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_leads_reply_sentiment_chk'
  ) THEN
    ALTER TABLE public.campaign_leads
      ADD CONSTRAINT campaign_leads_reply_sentiment_chk
      CHECK (
        reply_sentiment IS NULL OR
        reply_sentiment IN ('positive','neutral','negative','not_interested','auto_reply')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_leads_reply_intent_chk'
  ) THEN
    ALTER TABLE public.campaign_leads
      ADD CONSTRAINT campaign_leads_reply_intent_chk
      CHECK (
        reply_intent IS NULL OR
        reply_intent IN ('meeting','ask_more','reject','out_of_office','other')
      );
  END IF;
END
$do$;

-- Index to make "show me all positive replies this week" queries cheap.
CREATE INDEX IF NOT EXISTS idx_campaign_leads_reply_sentiment
  ON public.campaign_leads (user_id, reply_sentiment, reply_detected_at DESC)
  WHERE reply_sentiment IS NOT NULL;
