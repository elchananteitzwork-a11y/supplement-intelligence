-- Remove the 28 hand-authored seed rows from the leaderboard.
-- These were inserted in 001_schema.sql and 002_seed_leaderboard.sql with
-- manually curated scores and no real signal data behind them.
--
-- Identifying predicate: seed rows have no best_analysis_id (the analyses
-- table didn't exist when they were inserted) AND no scoring_version (the
-- column was added later in 007_scoring_version.sql and only stamped by
-- real engine runs). Every row produced by a real user analysis has both.
-- Note: the leaderboard table has no user_id column — do not filter on it.
DELETE FROM public.leaderboard
WHERE best_analysis_id IS NULL
  AND scoring_version IS NULL;
