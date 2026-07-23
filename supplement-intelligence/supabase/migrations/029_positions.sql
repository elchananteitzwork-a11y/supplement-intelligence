-- ── Positions — V4 Phase 1 (Pull) ────────────────────────────────────────────
-- docs/RD_V4_PHASE1.md §3 item 1 / V4_PRODUCT_ARCHITECTURE.md §5 S-Pull.
-- Owner-scoped position state for an analysis: the real record of the one
-- committed action (Validate/Watch/Kill) a user takes on a Brief, plus the
-- pre-agreed success metrics snapshotted at commit time (the anti-sunk-cost
-- device the Pull spec requires — "I'll hold you to these numbers"). Strict
-- 1:1 with analyses per user (unique(user_id, analysis_id)), upserted over
-- time as the state changes — same shape/rationale as analysis_outcomes
-- (migration 009): one evolving row, not a history log.
--
-- 'watching' does not duplicate the existing watchlist mechanism — the
-- watchlist table (migration 023) remains the single source of truth for
-- re-check/alert plumbing; this table only records that the user's chosen
-- Pull action was "Watch," for the Stream/position-strip to read back.
--
-- RLS: same "owner all" single-policy shape as analysis_outcomes (009) and
-- watchlist (023) — the user reads/writes only their own positions.

create table public.positions (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  user_id             uuid not null references auth.users(id) on delete cascade,
  analysis_id         uuid not null references public.analyses(id) on delete cascade,

  state               text not null check (state in ('validating', 'watching', 'killed')),

  -- Snapshot of the pre-agreed success metrics at commit time (Validate
  -- flow) — never re-derived later, same "snapshot at decision-time, not
  -- re-read from a later-edited source" discipline as watchlist's
  -- lifecycle_stage_at_watch/kill_criteria columns.
  success_metrics     jsonb,

  -- Optional, present only when state = 'killed'.
  kill_reason         text,

  unique (user_id, analysis_id)
);

alter table public.positions enable row level security;
create policy "owner all" on public.positions for all using (auth.uid() = user_id);

create index on public.positions (user_id, created_at desc);
create index on public.positions (analysis_id);
