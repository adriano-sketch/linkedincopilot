-- Inbox: replies stay in the Inbox until the user marks them as handled.
alter table public.campaign_leads add column if not exists reply_handled_at timestamptz;
create index if not exists campaign_leads_replies_open_idx
  on public.campaign_leads (user_id, replied_at desc)
  where status = 'replied' and reply_handled_at is null;
