-- Ghost Profiles Blacklist Table
-- Purpose: avoid wasting ScrapIn credits on known ghost/404 LinkedIn profiles

CREATE TABLE IF NOT EXISTS public.ghost_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  linkedin_url TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT 'ghost',
  signal_count INTEGER DEFAULT 0,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'enrich-leads-batch',
  raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_ghost_profiles_linkedin_url ON public.ghost_profiles (linkedin_url);

COMMENT ON TABLE public.ghost_profiles IS 'Blacklist of ghost/404 LinkedIn profiles to avoid wasting ScrapIn credits';

ALTER TABLE public.ghost_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ghost_profiles'
      AND policyname = 'Service role full access on ghost_profiles'
  ) THEN
    CREATE POLICY "Service role full access on ghost_profiles"
    ON public.ghost_profiles
    FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;
