-- ─────────────────────────────────────────────
-- DISCOVERY CACHE
-- Keyed by (normalized_query, cache_week) — ISO week string e.g. "2026-W25".
-- The same search returns a fresh AI generation once per week.
-- Authenticated users can read and write (non-sensitive shared data).
-- ─────────────────────────────────────────────

create table public.discovery_cache (
  id               uuid        primary key default gen_random_uuid(),
  normalized_query text        not null,
  cache_week       text        not null,
  opportunities    jsonb       not null,
  generated_at     timestamptz not null default now(),

  constraint discovery_cache_unique unique (normalized_query, cache_week)
);

create index on public.discovery_cache (normalized_query, cache_week);

alter table public.discovery_cache enable row level security;

create policy "authenticated read"   on public.discovery_cache
  for select using (auth.role() = 'authenticated');

create policy "authenticated insert" on public.discovery_cache
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated update" on public.discovery_cache
  for update using (auth.role() = 'authenticated');
