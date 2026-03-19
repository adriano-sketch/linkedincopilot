ALTER TABLE public.extension_status 
ADD COLUMN IF NOT EXISTS visits_today integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_limit_visits integer DEFAULT 80;