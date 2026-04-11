-- Add per-user account health columns so the watchdog can track, display,
-- and auto-pause unhealthy pipelines. Score is 0..100, where:
--   90..100 = healthy
--   60..89  = warning (funnel underperforming but still running)
--   30..59  = degraded (intervention recommended)
--   0..29   = critical (auto-pause triggers)

ALTER TABLE public.extension_status
  ADD COLUMN IF NOT EXISTS health_score INT,
  ADD COLUMN IF NOT EXISTS health_status TEXT,
  ADD COLUMN IF NOT EXISTS health_issues JSONB,
  ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_paused_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_extension_status_health
  ON public.extension_status (health_score)
  WHERE health_score IS NOT NULL;

COMMENT ON COLUMN public.extension_status.health_score IS
  '0..100 rollup score computed by watchdog. Drives auto-pause + user alerts.';
COMMENT ON COLUMN public.extension_status.auto_paused_at IS
  'Set by watchdog when pipeline is auto-paused due to critical failure signals. is_paused should also be true.';
