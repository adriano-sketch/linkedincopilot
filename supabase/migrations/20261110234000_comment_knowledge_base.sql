-- Comment knowledge base: what the AI must know before it drafts a comment in the user's name.
-- generate-comment (Growth) sorts every post against it: a post on one of the subjects gets a
-- comment, a milestone of the author gets a short congratulation, anything else gets no comment.
-- Without comment_topics no Growth comment is drafted. network-process passes it to the writer and
-- the reviewer.
alter table public.profiles
  add column if not exists comment_topics text,
  add column if not exists comment_avoid text,
  add column if not exists comment_examples text;

comment on column public.profiles.comment_topics is 'Comment knowledge base: subjects the user has something to say about. Posts outside them get no comment.';
comment on column public.profiles.comment_avoid is 'Comment knowledge base: subjects the user stays out of.';
comment on column public.profiles.comment_examples is 'Comment knowledge base: comments the user wrote, as a voice reference.';
