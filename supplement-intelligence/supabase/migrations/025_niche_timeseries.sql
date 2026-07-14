-- ── Niche Time-Series Store — Roadmap M2.11 ──────────────────────────────────
-- docs/MASTER_EXECUTION_PLAN.md §2/§4. One append-only row per real
-- observation: (niche_key, source, metric, value, observed_at). This is the
-- backbone the M2.12 Discovery Intelligence Engine's velocity detector will
-- read from — its cold-start clock (a rolling baseline needs ~3-4 weeks of
-- real history) only starts once this table exists and is being written to,
-- which is why this ships ahead of the Discovery Engine itself, not after.
--
-- No new fetches: every write site (lib/science-engine/pipeline.ts,
-- lib/watchlist/recheck.ts, lib/re-measurement/pipeline.ts) already computes
-- these exact values on its own existing nightly/weekly cadence — this
-- table just records a second copy of a real number already in hand.
--
-- Deliberately NOT yet written to by lib/voc-pipeline/pipeline.ts: that
-- pipeline's very first line calls fetchRedditAccessToken(), which always
-- fails today (Reddit has zero credentials configured anywhere in this
-- codebase) — runVocPipeline returns null before computing anything. Wiring
-- a write there now would be dead code. Deferred to Roadmap M2.13, when VOC
-- re-sourcing (DataForSEO question keywords + YouTube + Amazon Q&A) gives
-- this pipeline something real to write.
--
-- System-level data, not user-facing (same posture as provider_cache,
-- voc_problem_clusters, verdict_ledger_outcomes) — service-role only, no
-- RLS policies. Immutability enforced by a hard trigger (same pattern as
-- verdict_ledger, migration 017), not just RLS-policy absence, since RLS
-- alone doesn't stop service-role from bypassing it.

create table public.niche_timeseries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- Normalized niche/ingredient identifier — reuses the same identifiers
  -- already in use elsewhere (verdict_ledger.normalized_market,
  -- watchlist entry.category_name, science-engine TRACKED_INGREDIENTS
  -- entries), never a newly-invented key space.
  niche_key    text not null,

  -- Provider-level origin, e.g. 'keepa' | 'science' | 'lifecycle' (a
  -- derived/composite metric, not a raw provider read).
  source       text not null,

  -- e.g. 'demand_acceleration_pct', 'young_listing_pct_24m',
  -- 'publication_velocity_pct', 'trial_registrations_count',
  -- 'gap_velocity', 'price_movement_pct'. Deliberately numeric-only —
  -- categorical fields (e.g. search_momentum's Accelerating/Stable/
  -- Decelerating) are not appended here, no invented numeric encoding.
  metric       text not null,

  value        numeric not null,

  -- When the real observation was made — usually equal to created_at, but
  -- kept explicit and separate so a late-processed or backfilled write can
  -- carry its true observation time rather than its insert time.
  observed_at  timestamptz not null,

  -- Idempotency: a double cron-fire or retry for the same real observation
  -- is a no-op, not a duplicate row — same discipline as verdict_ledger's
  -- unique analysis_id and verdict_ledger_outcomes' unique
  -- (verdict_ledger_id, checkpoint_months).
  unique (niche_key, source, metric, observed_at)
);

create or replace function public.niche_timeseries_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'niche_timeseries rows are immutable — % is not permitted', tg_op;
end;
$$;

create trigger niche_timeseries_no_update
  before update on public.niche_timeseries
  for each row execute function public.niche_timeseries_block_mutation();

create trigger niche_timeseries_no_delete
  before delete on public.niche_timeseries
  for each row execute function public.niche_timeseries_block_mutation();

alter table public.niche_timeseries enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

-- (niche_key, metric, observed_at) is the exact access pattern the M2.12
-- velocity detector needs: a time-ordered slice per niche per metric.
create index nts_niche_metric_time_idx on public.niche_timeseries (niche_key, metric, observed_at);
create index nts_source_idx            on public.niche_timeseries (source);

comment on table public.niche_timeseries is
  'Roadmap M2.11: append-only per-niche observation history. Write-only foundation for M2.12''s Discovery Intelligence Engine velocity detector — no read path or UI in this milestone.';
