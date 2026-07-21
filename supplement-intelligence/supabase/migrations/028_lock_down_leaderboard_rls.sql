-- ── Lock down direct leaderboard writes (pre-beta production audit) ────────
--
-- migration 013_lock_down_rpc_grants.sql revoked `authenticated`'s EXECUTE
-- grant on upsert_leaderboard_entry() — any authenticated user could call
-- that RPC directly and forge/corrupt the shared leaderboard (fake
-- category_name, opportunity_score=99, build_decision='BUILD_NOW'). That
-- fix only touched the FUNCTION grant. The underlying TABLE still carries
-- its original migration 002 RLS policies:
--
--   create policy "authenticated insert leaderboard" on public.leaderboard
--     for insert with check (auth.role() = 'authenticated');
--   create policy "authenticated update leaderboard" on public.leaderboard
--     for update using (auth.role() = 'authenticated');
--
-- Those still let any authenticated user POST/PATCH the row directly via
-- PostgREST (/rest/v1/leaderboard), completely bypassing the function and
-- its now-locked-down grant — the real vulnerability was never actually
-- closed. Writes must only ever happen through the SECURITY DEFINER
-- upsert_leaderboard_entry() function, called with the service_role key
-- from server-side code (see app/api/generate/route.ts's
-- supabaseServiceRole()) — never directly by an authenticated browser
-- session. The "authenticated read" SELECT policy from migration 001 is
-- untouched; the public leaderboard page still needs to read these rows.

drop policy if exists "authenticated insert leaderboard" on public.leaderboard;
drop policy if exists "authenticated update leaderboard" on public.leaderboard;

create policy "service role insert leaderboard" on public.leaderboard
  for insert with check (auth.role() = 'service_role');

create policy "service role update leaderboard" on public.leaderboard
  for update using (auth.role() = 'service_role');
