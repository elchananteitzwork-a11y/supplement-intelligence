-- ── Divergence Alerts — Roadmap M2.22 ─────────────────────────────────────────
-- docs/MASTER_EXECUTION_PLAN.md §2 step 4 note / §4 row 7. Mechanical sibling
-- of M2.12's Discovery Alerts (migration 026): both are pattern detectors
-- over the same append-only niche_timeseries store (migration 025), just
-- comparing two different (source, metric) trajectories against each other
-- instead of one trajectory against its own baseline. One append-only row
-- per real, detected divergence between two (niche_key, source, metric)
-- series that share a niche_key — e.g. Commerce (Keepa demand) diverging
-- from Evidence (search-intent) for the same niche, or two Discovery-layer
-- sources disagreeing on direction/magnitude.
--
-- Deliberately narrow scope for v1, matching discovery_alerts' own
-- disclosed scope-limiting precedent: only real, detected divergences are
-- written — no status/lifecycle column, no handoff-to-Decision-Engine
-- linkage, no severity classification beyond the raw numbers — none of
-- that has real data to support yet. Category-agnostic by construction:
-- niche_key/source_a/metric_a/source_b/metric_b are free-text, exactly
-- like niche_timeseries and discovery_alerts themselves.
--
-- System-level data, no read path or UI wired to it yet — same posture as
-- niche_timeseries (M2.11) and discovery_alerts (M2.12) at the point they
-- shipped.

create table public.divergence_alerts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  niche_key    text not null,

  -- First of the two diverging (source, metric) series — same field
  -- shape as discovery_alerts' single series, suffixed _a.
  source_a       text not null,
  metric_a       text not null,
  prior_value_a  numeric not null,
  latest_value_a numeric not null,
  change_pct_a   numeric not null,

  -- Second of the two diverging (source, metric) series, suffixed _b.
  source_b       text not null,
  metric_b       text not null,
  prior_value_b  numeric not null,
  latest_value_b numeric not null,
  change_pct_b   numeric not null,

  -- The real divergence magnitude that crossed the disclosed threshold,
  -- i.e. abs(change_pct_a - change_pct_b) at detection time. Stored
  -- explicitly (not recomputed at read time) for the same reason
  -- discovery_alerts.change_pct is stored rather than derived.
  divergence_pct numeric not null,

  -- When the real divergence was detected (usually = created_at, kept
  -- explicit for the same reason niche_timeseries.observed_at and
  -- discovery_alerts.detected_at are explicit).
  detected_at  timestamptz not null,

  unique (niche_key, source_a, metric_a, source_b, metric_b, detected_at)
);

create or replace function public.divergence_alerts_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'divergence_alerts rows are immutable — % is not permitted', tg_op;
end;
$$;

create trigger divergence_alerts_no_update
  before update on public.divergence_alerts
  for each row execute function public.divergence_alerts_block_mutation();

create trigger divergence_alerts_no_delete
  before delete on public.divergence_alerts
  for each row execute function public.divergence_alerts_block_mutation();

alter table public.divergence_alerts enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

create index dva_niche_idx      on public.divergence_alerts (niche_key, detected_at desc);
create index dva_detected_idx   on public.divergence_alerts (detected_at desc);

comment on table public.divergence_alerts is
  'Roadmap M2.22: append-only record of real detected divergence between two (source, metric) trajectories in niche_timeseries data for the same niche. No consumer wired yet — mechanical sibling of discovery_alerts (M2.12/migration 026), same deliberately narrow v1 scope.';
