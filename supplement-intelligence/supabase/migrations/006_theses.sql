-- ─────────────────────────────────────────────────────────────────────────
-- MARKET THESES
-- Persists generated MarketThesis objects for caching and portfolio tracking.
-- Keyed by (query_normalized, depth, analysis_version) for cache hits.
-- Service-role writes (server-side only). Authenticated users can read their
-- own saved theses; anonymous reads are allowed for shared thesis links.
-- ─────────────────────────────────────────────────────────────────────────

create table public.theses (
  id                text        primary key,   -- thesis engine assigns stable IDs
  query             text        not null,
  query_normalized  text        not null,
  depth             text        not null check (depth in ('preliminary','standard','deep')),
  analysis_version  text        not null,

  thesis            jsonb       not null,       -- full MarketThesis object

  -- Optional: link to the user who triggered the analysis
  user_id           uuid        references auth.users(id) on delete set null,

  created_at        timestamptz not null default now(),
  refresh_after     timestamptz not null        -- computed from THESIS_CACHE_TTL
);

-- Fast cache lookup
create index idx_theses_cache_key
  on public.theses (query_normalized, depth, analysis_version);

-- TTL sweep / revalidation jobs
create index idx_theses_refresh
  on public.theses (refresh_after);

-- User portfolio queries
create index idx_theses_user
  on public.theses (user_id, created_at desc)
  where user_id is not null;

alter table public.theses enable row level security;

-- Service role bypasses RLS (used by the cache layer)
-- Authenticated users can read any thesis (shared links, portfolio)
create policy "authenticated read"
  on public.theses for select
  using (auth.role() = 'authenticated');

-- Any authenticated user can save a thesis (their analysis)
create policy "authenticated insert"
  on public.theses for insert
  with check (auth.role() = 'authenticated');
