-- Why a comment draft was skipped, chosen in one click in the Inbox. Optional: a skip without a reason
-- stays possible. The two reasons about the draft itself ("not_my_voice", "too_generic") are shown to
-- the comment writer as examples of what to avoid (see _shared/comment-quality.ts, loadLearned).
alter table public.monitored_posts
  add column if not exists dismiss_reason text;

alter table public.monitored_posts drop constraint if exists monitored_posts_dismiss_reason_check;
alter table public.monitored_posts add constraint monitored_posts_dismiss_reason_check
  check (dismiss_reason is null or dismiss_reason in ('off_topic', 'not_my_voice', 'too_generic', 'dont_know_person'));

comment on column public.monitored_posts.dismiss_reason is
  'Why the user skipped the draft: off_topic, not_my_voice, too_generic, dont_know_person. Null = no reason given.';

-- The signed-in user updates only a few columns of this table; the reason is one more of them.
grant update (dismiss_reason) on public.monitored_posts to authenticated;
