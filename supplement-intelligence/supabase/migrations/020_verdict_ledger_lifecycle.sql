-- ── Verdict Ledger — lifecycle classifier + gap velocity auxiliary columns ──
-- V2 Blueprint §3 / Roadmap M2.2. Purely additive: new nullable columns on
-- the existing verdict_ledger table (migration 017). No existing column,
-- constraint, trigger, or policy is touched.
--
-- migration 017 already created `lifecycle_stage` (text, CHECK-constrained
-- to the six real stage names) and `gap_velocity` (numeric) as forward-
-- compatible nullable placeholders — those two columns are populated by
-- this milestone's code (lib/lifecycle.ts), not newly created here. What
-- this migration adds is the auditable detail behind those two headline
-- values: the exact real inputs the classifier read (lifecycle_inputs),
-- which heuristic version produced them (lifecycle_model_version, so a
-- future v2 classifier's rows are never silently compared against v1's),
-- and the two real numbers gap_velocity was subtracted from
-- (gap_velocity_demand_acceleration_pct / gap_velocity_supply_acceleration_pct).

alter table public.verdict_ledger
  add column if not exists lifecycle_inputs        jsonb,
  add column if not exists lifecycle_model_version  text,
  add column if not exists gap_velocity_demand_acceleration_pct numeric,
  add column if not exists gap_velocity_supply_acceleration_pct numeric;

comment on column public.verdict_ledger.lifecycle_inputs is
  'LifecycleClassification[''inputs''] from lib/lifecycle.ts: the exact real search/amazon-demand/social/supply-velocity reads the stage was classified from — auditable against the actual evidence, per Roadmap M2.2''s acceptance criterion.';
comment on column public.verdict_ledger.lifecycle_model_version is
  'lib/lifecycle.ts LIFECYCLE_MODEL_VERSION at write time (e.g. "heuristic-v1") — guards against comparing stages classified under different classifier versions as if equivalent, same convention as scoring_version/confidence_model_version.';
comment on column public.verdict_ledger.gap_velocity_demand_acceleration_pct is
  'Real Keepa 90-day % change in monthlySold (GrowthSignal.momentum_90d_pct) — the minuend of gap_velocity = demand_acceleration - supply_acceleration.';
comment on column public.verdict_ledger.gap_velocity_supply_acceleration_pct is
  'Derived from Roadmap M2.3''s entry_velocity_ratio, normalized onto a comparable percentage scale ((ratio - 0.5) * 200) — the subtrahend of gap_velocity. Not the same physical unit as the demand-side figure; see lib/lifecycle.ts GapVelocity type for the disclosed normalization.';
