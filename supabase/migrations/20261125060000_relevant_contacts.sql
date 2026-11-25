-- How much of the person's network matters to their business: contacts loaded, how many of them
-- were compared with a description, and how many fit one (score 60 or more, the picker's default
-- line). A contact that fits two lists counts once.
create or replace function public.relevant_contacts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'contacts', (select count(*) from linkedin_connections c where c.user_id = auth.uid()),
    'analyzed', (select count(distinct m.connection_id) from connection_matches m where m.user_id = auth.uid()),
    'relevant', (select count(distinct m.connection_id) from connection_matches m where m.user_id = auth.uid() and m.score >= 60)
  );
$$;

revoke all on function public.relevant_contacts() from public, anon;
grant execute on function public.relevant_contacts() to authenticated;
