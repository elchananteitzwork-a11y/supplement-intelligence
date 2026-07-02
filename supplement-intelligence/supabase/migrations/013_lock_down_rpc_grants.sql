-- ── Lock down dangerous SECURITY DEFINER function grants ──────────────────
--
-- PROBLEM 1: upsert_leaderboard_entry was granted to `authenticated`, meaning
-- any logged-in user could POST directly to Supabase's /rpc/ endpoint with
-- arbitrary category_name, opportunity_score=99, build_decision='BUILD_NOW'
-- and corrupt the shared leaderboard. This function must only be callable
-- from server-side code (service_role).
--
-- PROBLEM 2: consume_analysis_slot and refund_analysis_slot were created with
-- no explicit GRANT/REVOKE. In Postgres the default is EXECUTE to PUBLIC,
-- meaning the `anon` role (unauthenticated browser) could call
-- refund_analysis_slot(any_uuid) in a loop to give any user unlimited
-- analyses, or call consume_analysis_slot(victim_uuid) to drain another
-- user's quota. Both must be restricted to service_role only.

-- ── upsert_leaderboard_entry ──────────────────────────────────────────────
revoke execute on function public.upsert_leaderboard_entry(text, numeric, text, text, text, text, uuid)
  from authenticated;
-- service_role keeps its grant from migration 008; no change needed there.

-- ── consume_analysis_slot ─────────────────────────────────────────────────
revoke execute on function public.consume_analysis_slot(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_analysis_slot(uuid)
  to service_role;

-- ── refund_analysis_slot ──────────────────────────────────────────────────
revoke execute on function public.refund_analysis_slot(uuid)
  from public, anon, authenticated;
grant execute on function public.refund_analysis_slot(uuid)
  to service_role;
