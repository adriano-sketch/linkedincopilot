-- Comments are posted by the person, never by the extension.
-- LinkedIn (13 Mar 2026) does not allow comments posted by an extension, script or tool without the
-- member clicking "comment". Copilot now only drafts: the person opens the post, pastes, clicks
-- Comment on LinkedIn, then marks the item as posted here.

-- 1. "I posted it": pending -> posted, in one step, by the owner.
create or replace function public.mark_post_comments_posted(p_ids uuid[], p_edits jsonb default '{}'::jsonb)
returns integer
language sql
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
      and mp.user_id = (select auth.uid())
      and mp.status in ('pending', 'approved', 'failed')
    returning 1
  )
  select count(*)::int from upd;
$$;
revoke all on function public.mark_post_comments_posted(uuid[], jsonb) from public, anon;
grant execute on function public.mark_post_comments_posted(uuid[], jsonb) to authenticated;

-- 2. The old approval no longer hands the comment to the extension: it only saves the edited text.
create or replace function public.approve_post_comments(p_ids uuid[], p_edits jsonb default '{}'::jsonb)
returns integer
language sql
set search_path to ''
as $$
  with upd as (
    update public.monitored_posts mp
    set final_comment = coalesce(nullif(p_edits ->> mp.id::text, ''), mp.final_comment, mp.suggested_comment),
        updated_at = now()
    where mp.id = any(p_ids)
      and mp.user_id = (select auth.uid())
      and mp.status = 'pending'
    returning 1
  )
  select count(*)::int from upd;
$$;

-- 3. Growth contact follows the comment: posted by the person -> rest 7 days; skipped -> rest 7 days.
create or replace function public.growth_comment_review_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.campaign_lead_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'posted' and old.status in ('pending', 'approved', 'failed') then
    update public.campaign_leads
       set status = 'engagement_done',
           comment_posted_at = now(),
           last_engagement_at = now(),
           engagement_count = coalesce(engagement_count, 0) + 1,
           next_action_at = now() + interval '7 days',
           post_url = null,
           post_content = null,
           comment_text = null,
           comment_approved = false,
           updated_at = now()
     where id = new.campaign_lead_id
       and user_id = new.user_id
       and status in ('comment_review', 'post_liked');
  elsif new.status = 'dismissed' then
    update public.campaign_leads
       set status = 'engagement_done',
           next_action_at = now() + interval '7 days',
           last_engagement_at = now(),
           post_url = null,
           post_content = null,
           comment_text = null,
           comment_approved = false,
           updated_at = now()
     where id = new.campaign_lead_id
       and user_id = new.user_id
       and status = 'comment_review';
  end if;
  return new;
end;
$$;

-- 4. Safety belt: no post_comment action can enter the extension queue, whatever code asks for it.
create or replace function public.action_queue_no_auto_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action_type = 'post_comment' then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists action_queue_no_auto_comment on public.action_queue;
create trigger action_queue_no_auto_comment
  before insert on public.action_queue
  for each row execute function public.action_queue_no_auto_comment();
