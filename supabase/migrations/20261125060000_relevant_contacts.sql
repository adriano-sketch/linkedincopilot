-- How much of the person's network matters to their business: contacts loaded, how many of them
-- were compared with a description, and how many fit one (score 60 or more, the picker's default
-- line, FIT_SCORE in src/hooks/useContacts.tsx). A contact that fits two lists counts once.
-- Runs as the caller: row security on both tables already limits it to their own rows.
create or replace function public.relevant_contacts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'contacts', (select count(*) from public.linkedin_connections c where c.user_id = auth.uid()),
    'analyzed', count(distinct m.connection_id),
    'relevant', count(distinct m.connection_id) filter (where m.score >= 60)
  )
  from public.connection_matches m
  where m.user_id = auth.uid();
$$;

revoke all on function public.relevant_contacts() from public, anon;
grant execute on function public.relevant_contacts() to authenticated;
