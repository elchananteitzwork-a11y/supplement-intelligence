-- ── Verdict Ledger — two-axis decision model columns ────────────────────────
-- V2 Blueprint §7/§8 / Roadmap M2.4. Purely additive: new nullable columns on
-- the existing verdict_ledger table (migration 017). No existing column,
-- constraint, trigger, or policy is touched.
--
-- migration 017 already created `pillar_scores` (jsonb) and
-- `pillar_confidence` (jsonb) as forward-compatible nullable placeholders,
-- explicitly reserved "until Roadmap M2.4 ships." This migration is that
-- shipment: `pillar_scores` now receives the real PillarScore[] array from
-- lib/verdict-matrix.ts (Demand Reality / Supply Response / Entry Economics /
-- Differentiation Opening). `pillar_confidence` stays unused deliberately —
-- each entry in pillar_scores already carries its own optional `confidence`
-- field, so a second parallel jsonb blob for the same numbers would be
-- redundant schema, not a real gap.
--
-- New columns record Axis 1 (Opportunity Quality) and the two-axis matrix
-- decision (Axis 1 x Axis 2, where Axis 2 is the lifecycle_stage/gap_velocity
-- already recorded by migration 020). market_verdict is a NEW, separate
-- 7-value vocabulary from build_decision (BUILD_NOW/VALIDATE_FURTHER/SKIP/
-- CATEGORY_CREATION_CANDIDATE) — additive and parallel, not a replacement;
-- build_decision's own column, CHECK constraint, and every existing consumer
-- (leaderboard, pattern memory, UI) are untouched.

alter table public.verdict_ledger
  add column if not exists opportunity_quality numeric,
  add column if not exists quality_tier text
    check (quality_tier in ('High','Mid','Low') or quality_tier is null),
  add column if not exists market_verdict text
    check (market_verdict in (
      'BUILD_NOW','BUILD_IF_DIFFERENTIATED','WATCH_CLOSELY',
      'WATCH','INVESTIGATE','AVOID','PASS'
    ) or market_verdict is null),
  add column if not exists build_now_gate jsonb,
  add column if not exists verdict_matrix_version text;

comment on column public.verdict_ledger.opportunity_quality is
  'Axis 1 (Blueprint §7), 0-100: weighted blend of the four scoring pillars in lib/verdict-matrix.ts computeOpportunityQuality — an evolution of the existing opportunity_score/build_decision blend, regrouped into four pillars, not a replacement of that column.';
comment on column public.verdict_ledger.quality_tier is
  'High/Mid/Low bucketing of opportunity_quality, reusing the same >=70/>=45 thresholds already calibrated for build_decision (lib/scoring.ts scoreFromCandidates) — see lib/verdict-matrix.ts.';
comment on column public.verdict_ledger.market_verdict is
  'Axis 1 (quality_tier) x Axis 2 (lifecycle_stage) matrix decision, Blueprint §8''s seven-value vocabulary. Additive and parallel to build_decision — a distinct, separately-versioned verdict, not a migration of that column.';
comment on column public.verdict_ledger.build_now_gate is
  'lib/verdict-matrix.ts BuildNowGate: channel count, Entry Economics verification, and safety-gate-clear checks applied only when the matrix cell resolved to BUILD_NOW pre-gate. Null for every other market_verdict.';
comment on column public.verdict_ledger.verdict_matrix_version is
  'lib/verdict-matrix.ts VERDICT_MATRIX_VERSION at write time (e.g. "heuristic-v1") — guards against comparing verdicts computed under different matrix versions as if equivalent, same convention as scoring_version/lifecycle_model_version.';
