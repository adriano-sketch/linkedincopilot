-- "I posted it" failed with "permission denied for table monitored_posts": the signed-in user may only
-- update four columns and may not set status 'posted'. The function already restricts rows to
-- auth.uid(), so it runs with the owner's rights instead of widening what the user can write directly.
create or replace function public.mark_post_comments_posted(p_ids uuid[], p_edits jsonb default '{}'::jsonb)
returns integer
language sql
security definer
set search_path to ''
as $$
  with upd as (
    update public.monitored_posts mp
    set status = 'posted',
        final_comment = coalesce(nullif(p_edits ->> mp.id::text, ''), mp.final_comment, mp.suggested_comment),
        approved_at = coalesce(mp.approved_at, now()),
        commented_at = now(),
        last_error = null,
        updated_at = now()
    where mp.id = any(p_ids)
      and (select auth.uid()) is not null
      and mp.user_id = (select auth.uid())
      and mp.status in ('pending', 'approved', 'failed')
    returning 1
  )
  select count(*)::int from upd;
$$;
revoke all on function public.mark_post_comments_posted(uuid[], jsonb) from public, anon;
grant execute on function public.mark_post_comments_posted(uuid[], jsonb) to authenticated;
