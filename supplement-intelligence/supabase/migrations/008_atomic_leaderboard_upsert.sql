-- ─────────────────────────────────────────────────────────────────────────
-- ATOMIC LEADERBOARD UPSERT
-- Fixes a read-then-update race in app/api/generate/route.ts: two
-- concurrent analyses of the same category_name could both read the same
-- existing row, then write back based on stale data, losing one update or
-- under-counting analysis_count. A single INSERT ... ON CONFLICT DO UPDATE
-- statement is atomic at the row level in Postgres — every concurrent
-- caller sees a consistent, serialized view, eliminating the race.
--
-- "Better" (replace the displayed score/decision/etc.) is true when either:
--   - the existing row's scoring_version differs from (or is null/missing
--     vs.) the new one — an old-formula score is not comparable to a new-
--     formula score, so it's always superseded (see lib/scoring.ts
--     SCORING_ENGINE_VERSION; same rule app/api/generate/route.ts already
--     applies in the old read-then-update code, now made atomic)
--   - or the new score is genuinely higher under the SAME formula version
-- analysis_count and last_analyzed always advance regardless of "better".
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.upsert_leaderboard_entry(
  p_category_name      text,
  p_opportunity_score  numeric,
  p_build_decision     text,
  p_scoring_version    text,
  p_biggest_competitor text,
  p_market_size        text,
  p_best_analysis_id   uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leaderboard (
    category_name, opportunity_score, build_decision, scoring_version,
    biggest_competitor, market_size, best_analysis_id, analysis_count, last_analyzed
  )
  values (
    p_category_name, p_opportunity_score, p_build_decision, p_scoring_version,
    p_biggest_competitor, p_market_size, p_best_analysis_id, 1, now()
  )
  on conflict (category_name) do update set
    analysis_count    = leaderboard.analysis_count + 1,
    last_analyzed     = now(),
    opportunity_score = case when leaderboard.scoring_version is distinct from p_scoring_version
                              or p_opportunity_score > leaderboard.opportunity_score
                         then p_opportunity_score else leaderboard.opportunity_score end,
    build_decision    = case when leaderboard.scoring_version is distinct from p_scoring_version
                              or p_opportunity_score > leaderboard.opportunity_score
                         then p_build_decision else leaderboard.build_decision end,
    scoring_version   = case when leaderboard.scoring_version is distinct from p_scoring_version
                              or p_opportunity_score > leaderboard.opportunity_score
                         then p_scoring_version else leaderboard.scoring_version end,
    biggest_competitor = case when leaderboard.scoring_version is distinct from p_scoring_version
                               or p_opportunity_score > leaderboard.opportunity_score
                          then p_biggest_competitor else leaderboard.biggest_competitor end,
    market_size        = case when leaderboard.scoring_version is distinct from p_scoring_version
                               or p_opportunity_score > leaderboard.opportunity_score
                          then p_market_size else leaderboard.market_size end,
    best_analysis_id   = case when leaderboard.scoring_version is distinct from p_scoring_version
                               or p_opportunity_score > leaderboard.opportunity_score
                          then p_best_analysis_id else leaderboard.best_analysis_id end;
end;
$$;

grant execute on function public.upsert_leaderboard_entry(text, numeric, text, text, text, text, uuid) to authenticated, service_role;
