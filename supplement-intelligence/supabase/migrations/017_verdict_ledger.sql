-- ── Verdict Ledger v1 ──────────────────────────────────────────────────────
-- V2 Blueprint §11 / Roadmap M1.1. One immutable snapshot per successful
-- completed analysis (every decision — BUILD_NOW, VALIDATE_FURTHER, SKIP,
-- CATEGORY_CREATION_CANDIDATE — not just BUILD_NOW like build_now_patterns).
--
-- Distinct from build_now_patterns (migration 016): that table remains
-- untouched, scoped to opportunity_score >= 65 analytics. This table has no
-- score floor and is the universal calibration record the V2 engine's
-- learning loop depends on. Written once per analysis, never modified.
--
-- Reuses rather than duplicates: raw signal evidence is NOT copied here —
-- analysis_id is a foreign key into analyses(id), whose memo_data jsonb
-- already stores signal_evidence permanently. "Immutable reference" per the
-- blueprint is satisfied by that foreign key, not by data duplication.
--
-- Forward-compatible, not retroactively complete: pillar_scores,
-- pillar_confidence, lifecycle_stage, and gap_velocity are nullable and
-- populated null until Roadmap M2.2–M2.4 (lifecycle classifier, four-pillar
-- reorganization) ship. dimension_scores captures today's real 7-dimension
-- GroundedScore breakdown so the ledger is useful immediately and pillar
-- data can later be computed retroactively from what's stored now.

create table public.verdict_ledger (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- One ledger row per analysis, ever. This is the idempotency/dedup key:
  -- retrying the write for the same analysis is a no-op (ON CONFLICT DO
  -- NOTHING at the call site); a fresh /api/generate call always produces a
  -- new analyses.id and therefore a new ledger row, which is correct — a
  -- re-run is a new timestamped snapshot, not an update to the old one.
  analysis_id  uuid not null unique references public.analyses(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- ── Identity ──────────────────────────────────────────────────
  user_query        text not null,
  normalized_market text not null,
  category          text not null,
  category_id       text,

  -- ── Engine version ───────────────────────────────────────────
  -- engine_version: SCORING_ENGINE_VERSION constant at write time (the
  -- formula version). scoring_version: memo.scoring_version, stamped
  -- per-memo — kept separately in case the two ever diverge (e.g. a memo
  -- persisted under an older code path).
  engine_version   text not null,
  scoring_version  text,

  -- ── Provider availability (today's evidence-breadth model — see
  -- lib/scoring.ts EvidenceBreadth. "Provider channel tags" uses the
  -- existing 5-channel taxonomy (amazon_marketplace / search_seo /
  -- social_community / manufacturing_supply / regulatory_safety), NOT yet
  -- the V2 blueprint's 7-channel independence model — that lands with
  -- Roadmap M1.3 (channel tags) / M1.4 (independence-aware confidence). ──
  contributing_providers        text[]  not null default '{}',
  total_score_eligible_providers int    not null,
  evidence_breadth_pct           int    not null check (evidence_breadth_pct >= 0 and evidence_breadth_pct <= 100),
  provider_channel_breakdown     jsonb  not null default '[]',
  distinct_channel_types         int    not null,
  cross_channel_corroborated     boolean not null,

  -- ── Scores (today's real 7-dimension model) ─────────────────────
  -- Array of { key, label, weight, rawScore, qualitativeLevel, source,
  -- sourceLabel } — the exact GroundedScore.dimensions this verdict was
  -- computed from.
  dimension_scores  jsonb not null,

  -- ── Pillars / lifecycle (future — nullable until M2.2–M2.4 ship) ──
  pillar_scores      jsonb,
  pillar_confidence  jsonb,
  lifecycle_stage    text check (lifecycle_stage in
                        ('Latent','Emerging','Window Open','Contested','Saturated','Declining')),
  gap_velocity       numeric,

  -- ── Safety gate ───────────────────────────────────────────────
  safety_gate_tier   text check (safety_gate_tier in ('BUILD_NOW','VALIDATE_FURTHER','SKIP','CATEGORY_CREATION_CANDIDATE')),
  safety_gate_clean  boolean not null,

  -- ── Verdict ───────────────────────────────────────────────────
  opportunity_score         numeric(5,1) not null,
  verdict                   text not null check (verdict in ('BUILD_NOW','VALIDATE_FURTHER','SKIP','CATEGORY_CREATION_CANDIDATE')),
  verdict_confidence        text check (verdict_confidence in ('HIGH','MODERATE','LOW')),
  verdict_override_reasons  text[] not null default '{}',
  grounded_pct              int not null check (grounded_pct in (0, 100)),
  insufficient_evidence     boolean not null,

  -- ── Report status ─────────────────────────────────────────────
  -- Mirrors the classification already computed in app/api/generate/route.ts
  -- ("Analysis decision" log line): 'passed' (normal memo), 'content_skip'
  -- (Decision Engine itself returned SKIP), or — this row is never written
  -- for 'technical_skip' (model/JSON failure), since no valid memo exists.
  report_status  text not null check (report_status in ('passed', 'content_skip'))
);

-- Immutability enforced at the database level, not just by RLS-policy
-- absence — RLS blocks regular users but not service-role, which bypasses
-- RLS. A trigger blocks UPDATE/DELETE even for service-role, matching the
-- blueprint's "snapshots must never be modified" as a hard guarantee.
create or replace function public.verdict_ledger_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'verdict_ledger rows are immutable — % is not permitted', tg_op;
end;
$$;

create trigger verdict_ledger_no_update
  before update on public.verdict_ledger
  for each row execute function public.verdict_ledger_block_mutation();

create trigger verdict_ledger_no_delete
  before delete on public.verdict_ledger
  for each row execute function public.verdict_ledger_block_mutation();

alter table public.verdict_ledger enable row level security;

create policy "vl_owner_select" on public.verdict_ledger
  for select using (auth.uid() = user_id);

create policy "vl_owner_insert" on public.verdict_ledger
  for insert with check (auth.uid() = user_id);

-- No UPDATE or DELETE policies — belt-and-suspenders with the trigger above.

create index vl_user_created_idx     on public.verdict_ledger (user_id, created_at desc);
create index vl_analysis_id_idx      on public.verdict_ledger (analysis_id);
create index vl_normalized_market_idx on public.verdict_ledger (normalized_market, created_at desc);
create index vl_verdict_idx          on public.verdict_ledger (verdict);
create index vl_engine_version_idx   on public.verdict_ledger (engine_version);
create index vl_lifecycle_stage_idx  on public.verdict_ledger (lifecycle_stage) where lifecycle_stage is not null;
