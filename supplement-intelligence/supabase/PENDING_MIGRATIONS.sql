-- ═══════════════════════════════════════════════════════════════════════════
-- PENDING MIGRATIONS — paste this entire file into the Supabase SQL Editor
-- and click "Run". Safe to run multiple times (DROP/CREATE are idempotent
-- where possible; the build_decision constraint uses dynamic lookup to avoid
-- errors if the constraint was already dropped).
--
-- Includes: 006_theses · 009_outcome_tracking · 010_provider_cache
--           · 016_build_now_patterns · 017_verdict_ledger
--           · 018_verdict_ledger_confidence · 019_billing
--           · 020_verdict_ledger_lifecycle · 021_verdict_ledger_quality_matrix
--           · 022_voc_problem_clusters · 023_watchlist
--           · 024_verdict_ledger_outcomes · 025_niche_timeseries
--           · 026_discovery_alerts · 027_divergence_alerts
--           · 013_lock_down_rpc_grants (re-appended, idempotent)
--           · 028_lock_down_leaderboard_rls · 004_refund_slot
--           · 011_remove_seed_data · 014_lock_discovery_cache_writes
--
-- 2026-07-14: appended 020-026 after live production validation of M2.13
-- discovered voc_problem_clusters (022) had never actually been applied to
-- production, despite being recorded "Completed" in the roadmap — this file
-- had not been kept in sync with supabase/migrations/ past 019. 020-026 are
-- appended now as a batch so the same gap doesn't silently recur for the
-- other unapplied migrations (020, 021, 023, 024 predate this session;
-- 025-026 are this session's own new tables).
--
-- 2026-07-14 (same day): a full-platform audit found 006_theses had ALSO
-- never been applied — a real, pre-existing gap predating even this file's
-- original 009-019 coverage, confirmed via a direct real PostgREST schema
-- check against production plus corroborating real log evidence. Appended
-- at the end (order doesn't matter here — 006 has no dependency on 009+).
--
-- 2026-07-18: appended 027 (M2.22 Divergence Alerts) as its own new table,
-- created alongside supabase/migrations/027_divergence_alerts.sql in the
-- same commit — not yet applied to production. Per this file's own
-- documented history above, "recorded in the roadmap" is never treated as
-- equivalent to "actually pasted and run" — the project owner must run this
-- file's full contents before divergence_alerts exists live.
--
-- 2026-07-21: pre-beta production-readiness audit found the leaderboard's
-- migration 002 RLS policies still let ANY authenticated user INSERT/UPDATE
-- the shared public.leaderboard table directly via PostgREST — migration
-- 013's grant lockdown only touched the upsert_leaderboard_entry() FUNCTION,
-- never the table's own RLS policies, so the underlying hole was never
-- actually closed. Appended 013 here too (idempotent revoke/grant — safe to
-- re-run even if already applied) alongside the new 028 policy fix, since
-- this file's own status for 013 was never confirmed and running both
-- together guarantees the correct end state either way. Same audit also
-- found the application code itself was still calling
-- consume_analysis_slot/refund_analysis_slot/upsert_leaderboard_entry
-- through the authenticated cookie client rather than service_role — fixed
-- directly in app/api/generate/route.ts and app/api/thesis/route.ts (no DB
-- change needed for that half of the fix).
--
-- 2026-07-21 (same day, after the owner ran the block above): the run
-- failed on "function public.refund_analysis_slot(uuid) does not exist".
-- Investigated via direct live PostgREST evidence (not guesswork):
--   - GET {url}/rest/v1/ as service_role lists only two RPCs in production
--     today: consume_analysis_slot and upsert_leaderboard_entry.
--     refund_analysis_slot is not present under any signature.
--   - POST {url}/rest/v1/rpc/refund_analysis_slot as anon → PGRST202 "no
--     matches found in the schema cache" (a missing-function error, not a
--     permission error).
-- Root cause: supabase/migrations/004_refund_slot.sql — which creates this
-- exact function — was simply never included in any prior version of this
-- pending-paste file, and so was never run against production, even though
-- 003 (before it) and 005+ (after it) all were. Not a rename, not a broken
-- chain — one file that was silently skipped. Fixed by appending 004's
-- create-function statement below, positioned BEFORE the 013 section (013
-- revokes/grants on this function, so it must exist first).
--
-- This also let us confirm something else directly: POST
-- {url}/rest/v1/rpc/consume_analysis_slot as anon (unauthenticated, no
-- user session at all) returned HTTP 200 — meaning migration 013 has ALSO
-- never actually been applied to production, despite being re-appended to
-- this file above. The grant lockdown in the 013 section below is
-- therefore not redundant — it is the fix for a currently-live,
-- currently-exploitable hole (any anonymous caller can call
-- consume_analysis_slot(any_uuid) right now). Re-run this entire file.
--
-- 2026-07-21 (same investigation, continued): given two migrations from the
-- same original batch (004, 013) turned out to have silently never run, we
-- systematically re-verified EVERY migration 001-028 against live
-- production via direct PostgREST evidence (schema introspection, and for
-- RLS-only changes, real disposable-test-account calls — created and
-- deleted via the Admin API, no residue left). Two more real gaps found:
--
--   - 011_remove_seed_data was NEVER applied: a live SELECT confirms 28 of
--     300 leaderboard rows today are still the hand-authored fake seed data
--     from 002_seed_leaderboard.sql (fabricated scores/competitors, no real
--     analysis behind them — e.g. "Bloating + Fatigue", "Joint Pain"),
--     indistinguishable in the UI from the 272 real ones. This is currently
--     visible to every user on the live Track Record / Leaderboard page —
--     a real, currently-shipping violation of this product's core
--     never-fabricate principle. Appended below.
--
--   - 014_lock_discovery_cache_writes was ALSO never applied: verified with
--     a real disposable authenticated session — a plain POST to
--     {url}/rest/v1/discovery_cache succeeded (201), proving any logged-in
--     user can insert/update arbitrary rows in the shared Discover results
--     cache directly via PostgREST right now, poisoning what every other
--     user sees for that query/week. Same vulnerability class as the
--     leaderboard (028) and the RPC grants (013). Appended below.
--
-- Every other migration (001-003, 005-010, 012, 015-027 except the already-
-- documented 027) was independently confirmed live via direct schema/data
-- checks — tables, columns, and functions all present and matching. This
-- file, as it stands now, is believed to bring production to a fully
-- migrated, fully secured state. Re-run the entire file once more.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 009: OUTCOME TRACKING ─────────────────────────────────────────────────

-- Fix analyses.build_decision CHECK constraint: add CATEGORY_CREATION_CANDIDATE
-- (the 4th verdict value added to the app but never added to the DB constraint).
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where rel.relname = 'analyses' and con.contype = 'c' and att.attname = 'build_decision';

  if cname is not null then
    execute format('alter table public.analyses drop constraint %I', cname);
  end if;
end $$;

alter table public.analyses add constraint analyses_build_decision_check
  check (build_decision in ('BUILD_NOW','VALIDATE_FURTHER','SKIP','CATEGORY_CREATION_CANDIDATE'));

create table if not exists public.analysis_outcomes (
  analysis_id          uuid primary key references public.analyses(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,

  built_status         text not null default 'not_started'
                        check (built_status in ('not_started','in_progress','built','abandoned')),
  launch_status        text not null default 'not_launched'
                        check (launch_status in ('not_launched','launched','discontinued')),
  monthly_revenue_usd  numeric(12,2) check (monthly_revenue_usd is null or monthly_revenue_usd >= 0),
  outcome_verdict      text check (outcome_verdict in ('success','failure','too_early_to_tell')),
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists analysis_outcomes_user_id_idx
  on public.analysis_outcomes (user_id);
create index if not exists analysis_outcomes_verdict_idx
  on public.analysis_outcomes (outcome_verdict) where outcome_verdict is not null;

alter table public.analysis_outcomes enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'analysis_outcomes' and policyname = 'owner all'
  ) then
    create policy "owner all" on public.analysis_outcomes for all using (auth.uid() = user_id);
  end if;
end $$;


-- ── 010: PROVIDER CACHE ───────────────────────────────────────────────────

create table if not exists public.provider_cache (
  cache_key   text        primary key,
  provider    text        not null,
  payload     jsonb       not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table public.provider_cache enable row level security;
-- No policies → service role bypasses; all other roles denied.

create index if not exists provider_cache_expires_at_idx
  on public.provider_cache (expires_at);


-- ── 016: BUILD_NOW PATTERN MEMORY ─────────────────────────────────────────

create table if not exists public.build_now_patterns (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),

  memo_id  uuid not null references public.analyses(id) on delete cascade,
  user_id  uuid not null references auth.users(id)      on delete cascade,

  product_name            text    not null,
  product_query           text,
  category                text    not null,
  scoring_engine_version  text    not null,

  opportunity_score       integer not null check (opportunity_score >= 65),
  verdict                 text    not null default 'ENTRY_SUPPORTED'
                                  check (verdict = 'ENTRY_SUPPORTED'),
  verdict_confidence      text    not null check (verdict_confidence in ('HIGH','MODERATE','LOW')),

  monthly_search_volume   integer,
  top_keyword             text,
  search_growth_pct       numeric,
  google_trends_direction text    check (google_trends_direction in ('Rising','Stable','Declining')),

  tiktok_view_count       bigint,
  tiktok_signal           text    check (tiktok_signal in ('High','Medium','Low')),

  review_concentration    numeric check (review_concentration >= 0 and review_concentration <= 1),
  competitor_count        integer,
  avg_competitor_reviews  numeric,
  price_range_low         numeric,
  price_range_high        numeric,

  gross_margin_pct        numeric,
  cac_pressure_score      numeric,
  fee_burden_score        numeric,

  consumer_pain_score       numeric,
  consumer_review_count     integer,
  consumer_negative_pct     numeric,
  consumer_theme_count      integer,
  repurchase_language_rate  numeric,

  manufacturing_feasibility_score  numeric,
  unit_cost_low                    numeric,
  unit_cost_high                   numeric,

  safety_gate_clean        boolean not null,
  fda_recall_count         integer not null default 0,
  fda_adverse_event_count  integer not null default 0,

  score_demand               numeric,
  score_market_accessibility numeric,
  score_profitability        numeric,
  score_consumer_pain        numeric,
  score_virality             numeric,
  score_subscription         numeric,
  score_manufacturing        numeric,

  evidence_breadth_pct    integer not null check (evidence_breadth_pct >= 0 and evidence_breadth_pct <= 100),
  contributing_providers  text[]  not null default '{}',

  opportunity_pattern     jsonb   not null
);

alter table public.build_now_patterns enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'build_now_patterns' and policyname = 'bnp_owner_select'
  ) then
    create policy "bnp_owner_select" on public.build_now_patterns
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'build_now_patterns' and policyname = 'bnp_owner_insert'
  ) then
    create policy "bnp_owner_insert" on public.build_now_patterns
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists bnp_user_score_idx
  on public.build_now_patterns (user_id, opportunity_score desc);
create index if not exists bnp_created_idx
  on public.build_now_patterns (created_at desc);
create index if not exists bnp_memo_id_idx
  on public.build_now_patterns (memo_id);
create index if not exists bnp_market_stage_idx
  on public.build_now_patterns ((opportunity_pattern->>'market_stage'));
create index if not exists bnp_entry_type_idx
  on public.build_now_patterns ((opportunity_pattern->>'entry_type'));
create index if not exists bnp_pattern_tags_gin
  on public.build_now_patterns using gin ((opportunity_pattern->'pattern_tags'));


-- ── 017: VERDICT LEDGER V1 ────────────────────────────────────────────────
-- One immutable snapshot per successful completed analysis (every decision,
-- not just BUILD_NOW). See supabase/migrations/017_verdict_ledger.sql for
-- full column-by-column rationale.

create table if not exists public.verdict_ledger (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  analysis_id  uuid not null unique references public.analyses(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,

  user_query        text not null,
  normalized_market text not null,
  category          text not null,
  category_id       text,

  engine_version   text not null,
  scoring_version  text,

  contributing_providers        text[]  not null default '{}',
  total_score_eligible_providers int    not null,
  evidence_breadth_pct           int    not null check (evidence_breadth_pct >= 0 and evidence_breadth_pct <= 100),
  provider_channel_breakdown     jsonb  not null default '[]',
  distinct_channel_types         int    not null,
  cross_channel_corroborated     boolean not null,

  dimension_scores  jsonb not null,

  pillar_scores      jsonb,
  pillar_confidence  jsonb,
  lifecycle_stage    text check (lifecycle_stage in
                        ('Latent','Emerging','Window Open','Contested','Saturated','Declining')),
  gap_velocity       numeric,

  safety_gate_tier   text check (safety_gate_tier in ('BUILD_NOW','VALIDATE_FURTHER','SKIP','CATEGORY_CREATION_CANDIDATE')),
  safety_gate_clean  boolean not null,

  opportunity_score         numeric(5,1) not null,
  verdict                   text not null check (verdict in ('BUILD_NOW','VALIDATE_FURTHER','SKIP','CATEGORY_CREATION_CANDIDATE')),
  verdict_confidence        text check (verdict_confidence in ('HIGH','MODERATE','LOW')),
  verdict_override_reasons  text[] not null default '{}',
  grounded_pct              int not null check (grounded_pct in (0, 100)),
  insufficient_evidence     boolean not null,

  report_status  text not null check (report_status in ('passed', 'content_skip'))
);

create or replace function public.verdict_ledger_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'verdict_ledger rows are immutable — % is not permitted', tg_op;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'verdict_ledger_no_update'
  ) then
    create trigger verdict_ledger_no_update
      before update on public.verdict_ledger
      for each row execute function public.verdict_ledger_block_mutation();
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'verdict_ledger_no_delete'
  ) then
    create trigger verdict_ledger_no_delete
      before delete on public.verdict_ledger
      for each row execute function public.verdict_ledger_block_mutation();
  end if;
end $$;

alter table public.verdict_ledger enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'verdict_ledger' and policyname = 'vl_owner_select'
  ) then
    create policy "vl_owner_select" on public.verdict_ledger
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'verdict_ledger' and policyname = 'vl_owner_insert'
  ) then
    create policy "vl_owner_insert" on public.verdict_ledger
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists vl_user_created_idx
  on public.verdict_ledger (user_id, created_at desc);
create index if not exists vl_analysis_id_idx
  on public.verdict_ledger (analysis_id);
create index if not exists vl_normalized_market_idx
  on public.verdict_ledger (normalized_market, created_at desc);
create index if not exists vl_verdict_idx
  on public.verdict_ledger (verdict);
create index if not exists vl_engine_version_idx
  on public.verdict_ledger (engine_version);
create index if not exists vl_lifecycle_stage_idx
  on public.verdict_ledger (lifecycle_stage) where lifecycle_stage is not null;


-- ── 018: VERDICT LEDGER — INDEPENDENCE-AWARE CONFIDENCE COLUMNS ────────────
-- Purely additive. See supabase/migrations/018_verdict_ledger_confidence.sql
-- for full rationale (incl. why this does NOT reuse pillar_confidence).

alter table public.verdict_ledger
  add column if not exists dimension_confidence  jsonb,
  add column if not exists overall_confidence     numeric,
  add column if not exists weakest_dimension      text,
  add column if not exists confirming_channel_count int,
  add column if not exists confidence_model_version text;


-- ── 019: BILLING (STRIPE) ───────────────────────────────────────────────
-- See supabase/migrations/019_billing.sql for full rationale.

alter table public.profiles
  add column if not exists stripe_customer_id     text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists subscription_status    text
    check (subscription_status in ('none','trialing','active','past_due','canceled','unpaid') or subscription_status is null),
  add column if not exists subscription_price_id  text,
  add column if not exists current_period_end     timestamptz;

create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

create table if not exists public.billing_events (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  stripe_event_id  text not null unique,
  event_type       text not null,
  user_id          uuid references auth.users(id) on delete set null,
  payload          jsonb not null
);

alter table public.billing_events enable row level security;

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, created_at desc) where user_id is not null;


-- ── 020: VERDICT LEDGER — LIFECYCLE AUXILIARY COLUMNS ───────────────────────
-- Purely additive. See supabase/migrations/020_verdict_ledger_lifecycle.sql.

alter table public.verdict_ledger
  add column if not exists lifecycle_inputs        jsonb,
  add column if not exists lifecycle_model_version  text,
  add column if not exists gap_velocity_demand_acceleration_pct numeric,
  add column if not exists gap_velocity_supply_acceleration_pct numeric;


-- ── 021: VERDICT LEDGER — TWO-AXIS DECISION MODEL COLUMNS ───────────────────
-- Purely additive. See supabase/migrations/021_verdict_ledger_quality_matrix.sql.

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


-- ── 022: VOC PROBLEM CLUSTERS ────────────────────────────────────────────────
-- See supabase/migrations/022_voc_problem_clusters.sql.

create table if not exists public.voc_problem_clusters (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),

  run_week              text    not null,
  topic_key             text    not null,
  topic_label           text    not null,

  post_count            integer not null check (post_count >= 0),
  avg_engagement_score  numeric not null,
  trend_pct             numeric,
  rank                  integer not null check (rank >= 1),

  sample_quotes         jsonb   not null default '[]'::jsonb,
  subreddits_seen       text[]  not null default '{}',

  pipeline_version      text    not null
);

alter table public.voc_problem_clusters enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

create unique index if not exists voc_clusters_run_topic_uniq on public.voc_problem_clusters (run_week, topic_key);
create index if not exists voc_clusters_run_week_idx         on public.voc_problem_clusters (run_week, rank);
create index if not exists voc_clusters_topic_history_idx    on public.voc_problem_clusters (topic_key, run_week desc);


-- ── 023: WATCHLIST + ALERTS ──────────────────────────────────────────────────
-- See supabase/migrations/023_watchlist.sql.

create table if not exists public.watchlist (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  user_id             uuid not null references auth.users(id) on delete cascade,
  analysis_id         uuid not null references public.analyses(id) on delete cascade,

  category_name       text not null,
  category_id         text not null,

  active              boolean not null default true,

  lifecycle_stage_at_watch text,
  kill_criteria            jsonb not null default '[]'::jsonb,

  last_checked_at          timestamptz,
  last_lifecycle_stage     text,

  unique (user_id, analysis_id)
);

alter table public.watchlist enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'watchlist' and policyname = 'owner all'
  ) then
    create policy "owner all" on public.watchlist for all using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists watchlist_active_idx on public.watchlist (active) where active = true;
create index if not exists watchlist_user_idx   on public.watchlist (user_id, created_at desc);

create table if not exists public.watchlist_alerts (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  watchlist_id        uuid not null references public.watchlist(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,

  alert_type          text not null check (alert_type in ('stage_transition', 'kill_criteria_triggered')),

  previous_stage      text,
  new_stage           text,

  kill_criterion_key   text,
  kill_criterion_label text,

  acknowledged        boolean not null default false
);

alter table public.watchlist_alerts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'watchlist_alerts' and policyname = 'owner select'
  ) then
    create policy "owner select" on public.watchlist_alerts for select using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists watchlist_alerts_user_idx       on public.watchlist_alerts (user_id, created_at desc);
create index if not exists watchlist_alerts_watchlist_idx  on public.watchlist_alerts (watchlist_id, created_at desc);


-- ── 024: VERDICT LEDGER OUTCOMES ─────────────────────────────────────────────
-- See supabase/migrations/024_verdict_ledger_outcomes.sql.

create table if not exists public.verdict_ledger_outcomes (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  verdict_ledger_id   uuid not null references public.verdict_ledger(id) on delete cascade,

  checkpoint_months   integer not null check (checkpoint_months in (3, 6, 12)),
  days_since_verdict  integer not null,

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

create index if not exists vlo_ledger_idx     on public.verdict_ledger_outcomes (verdict_ledger_id, checkpoint_months);
create index if not exists vlo_outcome_idx    on public.verdict_ledger_outcomes (outcome_label);


-- ── 025: NICHE TIME-SERIES STORE — Roadmap M2.11 ────────────────────────────
-- See supabase/migrations/025_niche_timeseries.sql.

create table if not exists public.niche_timeseries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  niche_key    text not null,
  source       text not null,
  metric       text not null,
  value        numeric not null,
  observed_at  timestamptz not null,

  unique (niche_key, source, metric, observed_at)
);

create or replace function public.niche_timeseries_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'niche_timeseries rows are immutable — % is not permitted', tg_op;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'niche_timeseries_no_update') then
    create trigger niche_timeseries_no_update
      before update on public.niche_timeseries
      for each row execute function public.niche_timeseries_block_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'niche_timeseries_no_delete') then
    create trigger niche_timeseries_no_delete
      before delete on public.niche_timeseries
      for each row execute function public.niche_timeseries_block_mutation();
  end if;
end $$;

alter table public.niche_timeseries enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

create index if not exists nts_niche_metric_time_idx on public.niche_timeseries (niche_key, metric, observed_at);
create index if not exists nts_source_idx            on public.niche_timeseries (source);


-- ── 026: DISCOVERY ALERTS — Roadmap M2.12 ───────────────────────────────────
-- See supabase/migrations/026_discovery_alerts.sql.

create table if not exists public.discovery_alerts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  niche_key    text not null,
  source       text not null,
  metric       text not null,

  prior_value  numeric not null,
  latest_value numeric not null,
  change_pct   numeric not null,

  detected_at  timestamptz not null,

  unique (niche_key, source, metric, detected_at)
);

create or replace function public.discovery_alerts_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'discovery_alerts rows are immutable — % is not permitted', tg_op;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'discovery_alerts_no_update') then
    create trigger discovery_alerts_no_update
      before update on public.discovery_alerts
      for each row execute function public.discovery_alerts_block_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'discovery_alerts_no_delete') then
    create trigger discovery_alerts_no_delete
      before delete on public.discovery_alerts
      for each row execute function public.discovery_alerts_block_mutation();
  end if;
end $$;

alter table public.discovery_alerts enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

create index if not exists da_niche_idx      on public.discovery_alerts (niche_key, detected_at desc);
create index if not exists da_detected_idx   on public.discovery_alerts (detected_at desc);


-- ── 027: DIVERGENCE ALERTS — Roadmap M2.22 ──────────────────────────────────
-- See supabase/migrations/027_divergence_alerts.sql. Mechanical sibling of
-- 026_discovery_alerts, mirrored field-for-field, with a second
-- (source, metric) trajectory added for the two sides being compared.

create table if not exists public.divergence_alerts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  niche_key    text not null,

  source_a       text not null,
  metric_a       text not null,
  prior_value_a  numeric not null,
  latest_value_a numeric not null,
  change_pct_a   numeric not null,

  source_b       text not null,
  metric_b       text not null,
  prior_value_b  numeric not null,
  latest_value_b numeric not null,
  change_pct_b   numeric not null,

  divergence_pct numeric not null,

  detected_at  timestamptz not null,

  unique (niche_key, source_a, metric_a, source_b, metric_b, detected_at)
);

create or replace function public.divergence_alerts_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'divergence_alerts rows are immutable — % is not permitted', tg_op;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'divergence_alerts_no_update') then
    create trigger divergence_alerts_no_update
      before update on public.divergence_alerts
      for each row execute function public.divergence_alerts_block_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'divergence_alerts_no_delete') then
    create trigger divergence_alerts_no_delete
      before delete on public.divergence_alerts
      for each row execute function public.divergence_alerts_block_mutation();
  end if;
end $$;

alter table public.divergence_alerts enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

create index if not exists dva_niche_idx      on public.divergence_alerts (niche_key, detected_at desc);
create index if not exists dva_detected_idx   on public.divergence_alerts (detected_at desc);


-- ── 006: MARKET THESES (found missing during the 2026-07-14 full-platform audit) ──
-- See supabase/migrations/006_theses.sql. Predates this file's original
-- 009-019 coverage — never included in any prior pasted run, confirmed via
-- a direct real PostgREST check against production (PGRST205 "Could not
-- find the table 'public.theses' in the schema cache") and corroborated by
-- real production logs: "[ThesisCache] write error (non-fatal): Could not
-- find the table 'public.theses' in the schema cache". The write path is
-- already non-fatal (thesis generation still completes, just without
-- caching), so this is a real but non-critical gap — thesis caching has
-- silently never worked in production.

create table if not exists public.theses (
  id                text        primary key,
  query             text        not null,
  query_normalized  text        not null,
  depth             text        not null check (depth in ('preliminary','standard','deep')),
  analysis_version  text        not null,

  thesis            jsonb       not null,

  user_id           uuid        references auth.users(id) on delete set null,

  created_at        timestamptz not null default now(),
  refresh_after     timestamptz not null
);

create index if not exists idx_theses_cache_key
  on public.theses (query_normalized, depth, analysis_version);
create index if not exists idx_theses_refresh
  on public.theses (refresh_after);
create index if not exists idx_theses_user
  on public.theses (user_id, created_at desc)
  where user_id is not null;

alter table public.theses enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'theses' and policyname = 'authenticated read'
  ) then
    create policy "authenticated read" on public.theses for select using (auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'theses' and policyname = 'authenticated insert'
  ) then
    create policy "authenticated insert" on public.theses for insert with check (auth.role() = 'authenticated');
  end if;
end $$;


-- ── 004: REFUND ANALYSIS SLOT ────────────────────────────────────────────────
-- See supabase/migrations/004_refund_slot.sql. Confirmed missing from
-- production 2026-07-21 (see history note above) — must run before 013,
-- which revokes/grants execute on this exact function.

create or replace function public.refund_analysis_slot(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set    analyses_used = greatest(0, analyses_used - 1)
  where  id = p_user_id;
end;
$$;


-- ── 013: LOCK DOWN DANGEROUS SECURITY DEFINER FUNCTION GRANTS ──────────────
-- (idempotent — safe to re-run even if already applied)

revoke execute on function public.upsert_leaderboard_entry(text, numeric, text, text, text, text, uuid)
  from authenticated;

revoke execute on function public.consume_analysis_slot(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_analysis_slot(uuid)
  to service_role;

revoke execute on function public.refund_analysis_slot(uuid)
  from public, anon, authenticated;
grant execute on function public.refund_analysis_slot(uuid)
  to service_role;


-- ── 028: LOCK DOWN LEADERBOARD TABLE RLS ────────────────────────────────────

drop policy if exists "authenticated insert leaderboard" on public.leaderboard;
drop policy if exists "authenticated update leaderboard" on public.leaderboard;

create policy "service role insert leaderboard" on public.leaderboard
  for insert with check (auth.role() = 'service_role');

create policy "service role update leaderboard" on public.leaderboard
  for update using (auth.role() = 'service_role');


-- ── 011: REMOVE FAKE SEED DATA FROM LEADERBOARD ─────────────────────────────
-- See supabase/migrations/011_remove_seed_data.sql. Confirmed still live in
-- production 2026-07-21 (28 of 300 rows) — see history note above.

delete from public.leaderboard
where best_analysis_id is null
  and scoring_version is null;


-- ── 014: LOCK DOWN DISCOVERY_CACHE WRITES ───────────────────────────────────
-- See supabase/migrations/014_lock_discovery_cache_writes.sql. Confirmed
-- still exploitable in production 2026-07-21 via a real disposable
-- authenticated session — see history note above. app/api/discover/route.ts
-- already uses a service-role client for its own cache writes (verify
-- unaffected), so removing these policies does not break normal Discover
-- generation.

drop policy if exists "authenticated insert" on public.discovery_cache;
drop policy if exists "authenticated update" on public.discovery_cache;
