-- Message campaigns ("outreach") were retired: the product does not send messages after a connection.
-- New campaigns are comment campaigns unless stated otherwise. The check constraint keeps both values
-- so old rows stay valid.
alter table public.campaign_profiles alter column campaign_mode set default 'growth';
