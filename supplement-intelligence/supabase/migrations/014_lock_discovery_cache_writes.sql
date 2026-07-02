-- ── Lock discovery_cache to server-side writes only ──────────────────────
--
-- PROBLEM: The INSERT and UPDATE policies on discovery_cache allowed any
-- authenticated user to write arbitrary opportunity data directly via
-- Supabase's REST API. Since discovery_cache is shared across all users
-- for the same week/query, a single write from any user becomes the
-- canonical response for everyone — making it trivially poisonable.
--
-- FIX: Remove the authenticated insert/update policies. Cache writes now
-- go through server-side code using the SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS entirely. The SELECT policy is preserved so authenticated
-- users can still read cached opportunities through the app's normal flow.
--
-- Application-side change: app/api/discover/route.ts was updated to use
-- adminClient() (service role) for the cache upsert, so normal discovery
-- generation continues to populate the cache correctly.

drop policy if exists "authenticated insert" on public.discovery_cache;
drop policy if exists "authenticated update" on public.discovery_cache;
