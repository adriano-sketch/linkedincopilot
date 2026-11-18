-- What the user thinks and has seen on their subjects, in their own words. The comment writer
-- builds on it, so drafts state a point of view instead of asking questions.
alter table public.profiles add column if not exists comment_views text;
