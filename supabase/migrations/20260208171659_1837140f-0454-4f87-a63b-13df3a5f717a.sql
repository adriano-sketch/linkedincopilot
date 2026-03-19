
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  company_type TEXT,
  offer_focus TEXT,
  icp TEXT,
  tone TEXT DEFAULT 'Friendly',
  cta_goal TEXT DEFAULT 'Book a call',
  onboarding_completed BOOLEAN DEFAULT false,
  extension_token TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Google connections
CREATE TABLE public.google_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  google_refresh_token TEXT,
  gmail_watch_enabled BOOLEAN DEFAULT false,
  sheet_id TEXT,
  sheet_tab_name TEXT DEFAULT 'Connections',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own google_connections" ON public.google_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own google_connections" ON public.google_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own google_connections" ON public.google_connections FOR UPDATE USING (auth.uid() = user_id);

-- LinkedIn events
CREATE TABLE public.linkedin_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT DEFAULT 'gmail',
  email_message_id TEXT,
  name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  linkedin_url TEXT,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'NEEDS_SNAPSHOT' CHECK (status IN ('NEEDS_SNAPSHOT','SNAPSHOT_RECEIVED','GENERATING','READY')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.linkedin_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own events" ON public.linkedin_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own events" ON public.linkedin_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own events" ON public.linkedin_events FOR UPDATE USING (auth.uid() = user_id);

-- Profile snapshots
CREATE TABLE public.profile_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.linkedin_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  linkedin_url TEXT,
  raw_text TEXT,
  headline TEXT,
  about TEXT,
  experience JSONB,
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own snapshots" ON public.profile_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own snapshots" ON public.profile_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Generated messages
CREATE TABLE public.generated_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.linkedin_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dm1 TEXT,
  followup1 TEXT,
  reasoning_short TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.generated_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own messages" ON public.generated_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own messages" ON public.generated_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Jobs
CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID REFERENCES public.linkedin_events(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'generate_dm',
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','success','fail')),
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own jobs" ON public.jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON public.jobs FOR UPDATE USING (auth.uid() = user_id);

-- Trigger for profile auto-creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
