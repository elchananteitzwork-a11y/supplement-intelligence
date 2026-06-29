-- ─────────────────────────────────────────────────────────────────────────
-- SCORING VERSION
-- Additive, nullable columns — no backfill, no behavior change for existing
-- rows. Lets opportunity_score/build_decision be traced to the exact
-- lib/scoring.ts formula that produced them (SCORING_ENGINE_VERSION), so a
-- score computed under a retired formula is never silently ranked or
-- compared against one computed under the current formula as if the two
-- numbers meant the same thing. Existing rows stay NULL (pre-versioning,
-- i.e. "unknown/legacy formula") — never backfilled with a guess.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.analyses   add column if not exists scoring_version text;
alter table public.leaderboard add column if not exists scoring_version text;
