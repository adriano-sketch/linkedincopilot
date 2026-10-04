-- 10_network_module.sql  |  Módulo "Rede": prospecção por ICP + monitoramento de posts com comentários aprovados.
-- Somente adiciona (tabelas, colunas, funções). Não altera nem apaga nada existente.

-- ── 1. ICPs ──────────────────────────────────────────────────────────────
create table if not exists public.icps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,                       -- descrição livre usada pela IA
  titles text[] not null default '{}',    -- cargos-alvo (ex: CEO, Founder, Head of Sales)
  keywords text[] not null default '{}',  -- termos de busca extras
  exclude_keywords text[] not null default '{}',
  locations text[] not null default '{}',
  location_geo_ids text[] not null default '{}', -- IDs geográficos do LinkedIn (opcional)
  industries text[] not null default '{}',
  seniorities text[] not null default '{}',      -- usado só com Sales Navigator
  company_size_min integer,
  company_size_max integer,
  post_topics text[] not null default '{}',      -- assuntos para achar posts (se vazio, usa keywords/titles)
  min_fit_score integer not null default 70 check (min_fit_score between 0 and 100),
  prospecting_enabled boolean not null default true,
  engagement_enabled boolean not null default true,
  is_active boolean not null default true,
  -- estado da busca (paginação) para não repetir páginas
  people_search_page integer not null default 0,
  people_search_exhausted_at timestamptz,
  last_people_search_at timestamptz,
  last_post_search_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_icps_user on public.icps (user_id) where is_active;

-- ── 2. Pessoas encontradas na busca ──────────────────────────────────────
create table if not exists public.network_prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  icp_id uuid references public.icps(id) on delete set null,
  linkedin_url text not null,              -- normalizado: https://www.linkedin.com/in/<slug>
  full_name text,
  headline text,
  location text,
  current_company text,
  degree text,                             -- '2nd', '3rd', ...
  mutual_connections integer,
  fit_score integer check (fit_score is null or fit_score between 0 and 100),
  fit_reason text,
  status text not null default 'discovered' check (status in (
    'discovered',   -- veio da busca, ainda sem nota
    'rejected',     -- IA disse que não tem fit
    'qualified',    -- fit acima do corte, aguardando convite
    'queued',       -- convite na fila da extensão
    'invited',      -- convite enviado
    'accepted',     -- virou conexão
    'withdrawn',    -- convite retirado por estar pendente demais
    'skipped',      -- já conectado/pendente/inválido
    'failed'
  )),
  source text not null default 'linkedin_search' check (source in ('linkedin_search','sales_navigator')),
  search_run_id uuid,
  invited_at timestamptz,
  accepted_at timestamptz,
  withdrawn_at timestamptz,
  last_error text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, linkedin_url)
);
create index if not exists idx_np_user_status on public.network_prospects (user_id, status);
create index if not exists idx_np_user_invited on public.network_prospects (user_id, invited_at desc) where invited_at is not null;
create index if not exists idx_np_user_accepted on public.network_prospects (user_id, accepted_at desc) where accepted_at is not null;
create index if not exists idx_np_icp on public.network_prospects (icp_id);

-- ── 3. Posts monitorados + comentário sugerido ───────────────────────────
create table if not exists public.monitored_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  icp_id uuid references public.icps(id) on delete set null,
  post_urn text not null,                  -- id estável do post no LinkedIn
  post_url text,
  author_name text,
  author_headline text,
  author_profile_url text,
  author_degree text,
  post_text text,
  posted_label text,                       -- texto relativo do LinkedIn, ex: "3h"
  reactions_count integer,
  comments_count integer,
  icp_fit boolean,
  fit_reason text,
  signal_type text check (signal_type is null or signal_type in (
    'business_opportunity','hiring','pain_point','launch','milestone','relationship','ignore')),
  signal_reason text,
  priority integer not null default 50,    -- 0-100, ordena a fila (oportunidade primeiro)
  suggested_comment text,
  final_comment text,                      -- texto editado pelo usuário (se vazio usa o sugerido)
  status text not null default 'new' check (status in (
    'new',        -- capturado, ainda não analisado
    'ignored',    -- fora do ICP ou sem valor
    'pending',    -- aguardando aprovação no dashboard
    'approved',   -- aprovado, aguardando ir para a fila
    'queued',     -- na fila da extensão
    'posted',     -- comentário publicado
    'dismissed',  -- usuário descartou
    'failed'
  )),
  approved_at timestamptz,
  commented_at timestamptz,
  last_error text,
  search_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, post_urn)
);
create index if not exists idx_mp_user_status on public.monitored_posts (user_id, status, priority desc);
create index if not exists idx_mp_icp on public.monitored_posts (icp_id);

-- ── 4. Registro de buscas (controle do limite mensal do LinkedIn) ─────────
create table if not exists public.network_search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  icp_id uuid references public.icps(id) on delete set null,
  kind text not null check (kind in ('people','posts')),
  page integer not null default 1,
  search_url text,
  query jsonb,
  status text not null default 'queued' check (status in ('queued','completed','failed','limit_reached')),
  results_count integer,
  new_count integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_nsr_user_kind_created on public.network_search_runs (user_id, kind, created_at desc);

-- ── 5. Configuração por conta LinkedIn ───────────────────────────────────
alter table public.extension_status
  add column if not exists linkedin_account_tier text default 'free',
  add column if not exists weekly_invite_limit integer default 100,
  add column if not exists daily_comment_limit integer default 20,
  add column if not exists monthly_people_search_budget integer default 250,
  add column if not exists invites_paused_until timestamptz,
  add column if not exists searches_paused_until timestamptz,
  add column if not exists last_connections_sync_at timestamptz;

alter table public.extension_status add constraint extension_status_network_limits check (
      (linkedin_account_tier is null or linkedin_account_tier in ('free','premium','sales_navigator'))
  and (weekly_invite_limit is null or weekly_invite_limit between 0 and 200)
  and (daily_comment_limit is null or daily_comment_limit between 0 and 40)
  and (monthly_people_search_budget is null or monthly_people_search_budget between 0 and 3000)
);

-- ── 6. Segurança (RLS) ───────────────────────────────────────────────────
alter table public.icps enable row level security;
alter table public.network_prospects enable row level security;
alter table public.monitored_posts enable row level security;
alter table public.network_search_runs enable row level security;

-- ICPs: o usuário gerencia os próprios
create policy own_all on public.icps for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Prospects e buscas: o usuário só lê (quem escreve é o servidor)
create policy own_select on public.network_prospects for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_select on public.network_search_runs for select to authenticated
  using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.network_prospects from anon, authenticated;
revoke insert, update, delete, truncate on public.network_search_runs from anon, authenticated;

-- Posts: o usuário lê e só pode mexer no texto final e no status (aprovar/descartar)
create policy own_select on public.monitored_posts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_update on public.monitored_posts for update to authenticated
  using ((select auth.uid()) = user_id and status in ('pending','approved','dismissed'))
  with check ((select auth.uid()) = user_id and status in ('pending','approved','dismissed'));
revoke insert, update, delete, truncate on public.monitored_posts from anon, authenticated;
grant update (final_comment, status, approved_at, updated_at) on public.monitored_posts to authenticated;

-- ── 7. Aprovação em massa (dashboard) ────────────────────────────────────
-- Aprova uma lista de posts do próprio usuário. edits = {"<post_id>": "texto editado", ...} (opcional)
create or replace function public.approve_post_comments(p_ids uuid[], p_edits jsonb default '{}'::jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with upd as (
    update public.monitored_posts mp
    set status = 'approved',
        final_comment = coalesce(nullif(p_edits ->> mp.id::text, ''), mp.final_comment, mp.suggested_comment),
        approved_at = now(),
        updated_at = now()
    where mp.id = any(p_ids)
      and mp.user_id = (select auth.uid())
      and mp.status = 'pending'
    returning 1
  )
  select count(*)::int from upd;
$$;
revoke execute on function public.approve_post_comments(uuid[], jsonb) from public, anon;
grant execute on function public.approve_post_comments(uuid[], jsonb) to authenticated;

-- ── 8. Números do dashboard "Novos contatos" ─────────────────────────────
create or replace function public.network_stats(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  p as (select np.* from public.network_prospects np, me where np.user_id = me.uid),
  per_icp as (
    select i.id, i.name,
      count(p.id) filter (where p.invited_at >= now() - make_interval(days => p_days)) as invited,
      count(p.id) filter (where p.accepted_at >= now() - make_interval(days => p_days)) as accepted,
      count(p.id) filter (where p.status = 'invited') as pending,
      count(p.id) filter (where p.status = 'qualified') as ready_to_invite
    from public.icps i left join p on p.icp_id = i.id
    where i.user_id = (select uid from me)
    group by i.id, i.name
  )
  select jsonb_build_object(
    'period_days', p_days,
    'invited', (select count(*) from p where invited_at >= now() - make_interval(days => p_days)),
    'accepted', (select count(*) from p where accepted_at >= now() - make_interval(days => p_days)),
    'pending_invites', (select count(*) from p where status = 'invited'),
    'qualified_waiting', (select count(*) from p where status = 'qualified'),
    'invited_last_7d', (select count(*) from p where invited_at >= now() - interval '7 days'),
    'people_searches_this_month', (select count(*) from public.network_search_runs r, me
        where r.user_id = me.uid and r.kind = 'people' and r.status <> 'queued'
          and r.created_at >= date_trunc('month', now())),
    'comments_pending_approval', (select count(*) from public.monitored_posts m, me where m.user_id = me.uid and m.status = 'pending'),
    'comments_posted', (select count(*) from public.monitored_posts m, me where m.user_id = me.uid and m.status = 'posted'
        and m.commented_at >= now() - make_interval(days => p_days)),
    'opportunities_open', (select count(*) from public.monitored_posts m, me where m.user_id = me.uid
        and m.status in ('pending','approved','queued') and m.signal_type in ('business_opportunity','hiring','pain_point')),
    'by_icp', coalesce((select jsonb_agg(jsonb_build_object('icp_id', id, 'name', name, 'invited', invited, 'accepted', accepted,
        'acceptance_rate', case when invited > 0 then round(accepted::numeric / invited * 100, 1) end,
        'pending', pending, 'ready_to_invite', ready_to_invite)) from per_icp), '[]'::jsonb)
  );
$$;
revoke execute on function public.network_stats(integer) from public, anon;
grant execute on function public.network_stats(integer) to authenticated;

-- updated_at automático
create trigger trg_icps_updated before update on public.icps
  for each row execute function public.update_updated_at_column();
create trigger trg_np_updated before update on public.network_prospects
  for each row execute function public.update_updated_at_column();
create trigger trg_mp_updated before update on public.monitored_posts
  for each row execute function public.update_updated_at_column();
