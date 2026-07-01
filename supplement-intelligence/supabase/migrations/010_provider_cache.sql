-- ── Provider result cache ─────────────────────────────────────────────────
-- Persists expensive external API results (Amazon review pages, SERP scrapes,
-- DataForSEO keyword lookups) across invocations. Accessed only via the
-- SUPABASE_SERVICE_ROLE_KEY — RLS enabled with no policies denies all
-- non-service-role access.
--
-- Populated by lib/provider-cache/index.ts. TTLs by provider:
--   reviews:v1:{asin}    14 days  — Amazon reviews change slowly
--   serp:v1:{query}      48 hours — SERP rankings shift faster
--   keywords:v1:{query}  7 days   — DataForSEO keyword data stable week-to-week

create table public.provider_cache (
  cache_key   text        primary key,
  provider    text        not null,
  payload     jsonb       not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table public.provider_cache enable row level security;
-- No RLS policies → service role bypasses RLS; all other roles are denied.

create index provider_cache_expires_at_idx on public.provider_cache (expires_at);

-- Auto-cleanup: delete rows older than their TTL during a periodic vacuum or
-- via pg_cron if available. Manual cleanup: DELETE FROM provider_cache WHERE expires_at < now();
