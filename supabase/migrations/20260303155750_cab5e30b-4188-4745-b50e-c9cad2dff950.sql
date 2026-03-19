ALTER TABLE public.extension_status 
  ADD COLUMN IF NOT EXISTS active_days text[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  ADD COLUMN IF NOT EXISTS active_hours_start text DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS active_hours_end text DEFAULT '18:00';