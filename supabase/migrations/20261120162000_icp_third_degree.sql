-- People search of an audience can include 3rd-degree people (no connection in common).
alter table public.icps add column if not exists include_third_degree boolean not null default false;
