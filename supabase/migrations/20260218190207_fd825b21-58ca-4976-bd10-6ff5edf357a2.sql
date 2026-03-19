
-- Create user_settings table for plan and lead limits
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  max_leads_per_cycle INTEGER NOT NULL DEFAULT 50,
  leads_used_this_cycle INTEGER NOT NULL DEFAULT 0,
  linkedin_accounts_limit INTEGER NOT NULL DEFAULT 1,
  max_campaigns INTEGER NOT NULL DEFAULT 1,
  cycle_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cycle_reset_date DATE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role needs full access for webhooks
CREATE POLICY "Service role full access"
  ON public.user_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Wait, that's too permissive. Let me use restrictive user policies only.
-- The edge functions use service role key which bypasses RLS.
-- Remove the overly permissive policy
DROP POLICY IF EXISTS "Service role full access" ON public.user_settings;

-- Auto-create user_settings when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, cycle_reset_date)
  VALUES (NEW.id, (CURRENT_DATE + INTERVAL '1 month')::date);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- Updated_at trigger
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
