-- ── Discovery Alerts — Roadmap M2.12 ──────────────────────────────────────────
-- docs/MASTER_EXECUTION_PLAN.md §2/§4. One append-only row per real,
-- detected acceleration in a niche_timeseries (migration 025) series — the
-- Discovery Intelligence Engine's output. A row here means "this
-- (niche_key, source, metric) crossed a disclosed acceleration threshold
-- between its two most recent real observations," nothing more.
--
-- Deliberately narrow scope for v1 (see lib/discovery-engine/ for the full
-- reasoning): only real, accelerating crossings are written — a
-- decelerating or flat reading produces no row. No cross-source
-- confirmation column, no status/lifecycle column, no handoff-to-
-- Decision-Engine linkage — none of that has real data to support yet.
-- Category-agnostic by construction: niche_key/source/metric are free-text,
-- exactly like niche_timeseries itself — nothing here assumes supplements.
--
-- System-level data, no read path or UI wired to it yet — same posture as
-- niche_timeseries at the point it shipped (M2.11).

create table public.discovery_alerts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  niche_key    text not null,
  source       text not null,
  metric       text not null,

  prior_value  numeric not null,
  latest_value numeric not null,
  change_pct   numeric not null,

  -- When the real crossing was detected (usually = created_at, kept
  -- explicit for the same reason niche_timeseries.observed_at is explicit).
  detected_at  timestamptz not null,

  unique (niche_key, source, metric, detected_at)
);

create or replace function public.discovery_alerts_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'discovery_alerts rows are immutable — % is not permitted', tg_op;
end;
$$;

create trigger discovery_alerts_no_update
  before update on public.discovery_alerts
  for each row execute function public.discovery_alerts_block_mutation();

create trigger discovery_alerts_no_delete
  before delete on public.discovery_alerts
  for each row execute function public.discovery_alerts_block_mutation();

alter table public.discovery_alerts enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

create index da_niche_idx      on public.discovery_alerts (niche_key, detected_at desc);
create index da_detected_idx   on public.discovery_alerts (detected_at desc);

comment on table public.discovery_alerts is
  'Roadmap M2.12: append-only record of real detected acceleration in niche_timeseries data. No consumer wired yet — future Decision Engine handoff and calibration worker are deliberately deferred until real alerts accumulate.';
