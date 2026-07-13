-- ── Verdict Ledger Outcomes — Roadmap M2.9 ───────────────────────────────────
-- V2 Blueprint §11/§12: quarterly re-measurement per ledgered niche,
-- "measurable entirely from Keepa (listedSince + review accrual of
-- newcomers)." One row per (verdict_ledger row, checkpoint) — 3/6/12
-- months since that row's own created_at, never a global calendar cadence.
--
-- Immutably linked to its originating verdict row via verdict_ledger_id
-- (on delete cascade — an outcome row never outlives the verdict it
-- measures against). System-level calibration data, not user-facing yet
-- (Roadmap M3.1 "Calibration reporting" is its future consumer) — same
-- "service-role only, no policies" posture as provider_cache and
-- voc_problem_clusters, not per-user RLS.

create table public.verdict_ledger_outcomes (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  verdict_ledger_id   uuid not null references public.verdict_ledger(id) on delete cascade,

  checkpoint_months   integer not null check (checkpoint_months in (3, 6, 12)),
  days_since_verdict  integer not null,

  -- Real fast-tier re-pull results (lib/watchlist/recheck.ts's
  -- fetchFastTierSignals, reused verbatim — Keepa + Google Trends + Science).
  entry_velocity              text check (entry_velocity in ('Accelerating', 'Stable', 'Decelerating') or entry_velocity is null),
  young_listing_pct_24m       numeric,
  avg_review_count_at_measurement numeric,
  avg_review_count_at_verdict     numeric,
  avg_price_at_measurement        numeric,
  avg_price_at_verdict            numeric,
  price_movement_pct              numeric,

  outcome_label       text not null check (outcome_label in ('meaningful_traction', 'no_meaningful_traction', 'too_early_to_tell')),

  keepa_tokens_used_estimate integer not null,

  unique (verdict_ledger_id, checkpoint_months)
);

alter table public.verdict_ledger_outcomes enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

create index vlo_ledger_idx     on public.verdict_ledger_outcomes (verdict_ledger_id, checkpoint_months);
create index vlo_outcome_idx    on public.verdict_ledger_outcomes (outcome_label);

comment on table public.verdict_ledger_outcomes is
  'Roadmap M2.9 quarterly re-measurement output: real, Keepa-derived outcome labels ("did a new entrant achieve meaningful traction") per ledgered verdict per 3/6/12-month checkpoint. avg_*_at_verdict is read from analyses.memo_data at write time, never duplicated eagerly onto verdict_ledger itself (same immutable-reference principle migration 017 already establishes).';
