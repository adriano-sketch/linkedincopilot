-- Comment drafts: what a draft was built from, and why an edited draft was changed.
--
-- draft_notes : what the post was read as (subject, detail, plans) and which of the person's notes were
--               used or left out. For diagnosis; the Inbox shows it only when asked to.
-- edit_kind   : why the person changed the draft before publishing it. Worked out once, by a model.
-- edit_note   : for a change of subject only, one line saying what was dropped on what kind of post.
--               It informs drafts on similar posts; it is never a standing rule.

alter table public.monitored_posts
  add column if not exists draft_notes jsonb,
  add column if not exists edit_kind text,
  add column if not exists edit_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'monitored_posts_edit_kind_check') then
    alter table public.monitored_posts
      add constraint monitored_posts_edit_kind_check
      check (edit_kind is null or edit_kind in ('subject', 'fact', 'tone', 'style', 'unclear'));
  end if;
end $$;
