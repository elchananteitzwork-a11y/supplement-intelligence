-- ═══════════════════════════════════════════════════════════════════════════
-- PENDING MIGRATIONS — paste this entire file into the Supabase SQL Editor
-- and click "Run". Safe to run multiple times (DROP/CREATE are idempotent
-- where possible; the build_decision constraint uses dynamic lookup to avoid
-- errors if the constraint was already dropped).
--
-- Includes: 009_outcome_tracking · 010_provider_cache · 016_build_now_patterns
--           · 017_verdict_ledger · 018_verdict_ledger_confidence · 019_billing
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
