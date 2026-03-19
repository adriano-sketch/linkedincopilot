alter table public.campaign_leads
  add column if not exists profile_quality_status text,
  add column if not exists profile_quality_checked_at timestamptz,
  add column if not exists profile_quality_note text;

create index if not exists idx_campaign_leads_profile_quality_status
  on public.campaign_leads (profile_quality_status);
