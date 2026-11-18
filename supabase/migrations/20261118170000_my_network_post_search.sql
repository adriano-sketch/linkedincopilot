-- Subjects to look for in posts of the user's own 1st-degree connections (one search term each).
-- network-scheduler runs a few of these searches a day; the posts found go through the same
-- knowledge-base triage as the Growth flow and reach the Inbox as drafts.
alter table public.profiles add column if not exists comment_search_terms text[];
comment on column public.profiles.comment_search_terms is
  'Search terms for posts of 1st-degree connections (one per search). Null or empty: feature off.';
