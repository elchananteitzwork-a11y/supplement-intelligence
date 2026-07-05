-- ── BUILD_NOW Pattern Memory ──────────────────────────────────────────────────
-- Persistent record of every ENTRY_SUPPORTED / BUILD_NOW analysis decision.
-- Written once per qualifying memo; never modified after insert.
-- Read-only for analytics — never read by the scoring engine.
--
-- Scope: per-user with RLS (same as analyses table). Cross-user aggregate
-- analytics require service-role access, which bypasses RLS.

create table public.build_now_patterns (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),

  -- Links to the originating analysis row
  memo_id  uuid not null references public.analyses(id) on delete cascade,
  user_id  uuid not null references auth.users(id)      on delete cascade,

  -- Identity
  product_name            text    not null,
  product_query           text,
  category                text    not null,
  scoring_engine_version  text    not null,

  -- Decision
  opportunity_score       integer not null check (opportunity_score >= 65),
  verdict                 text    not null default 'ENTRY_SUPPORTED'
                                  check (verdict = 'ENTRY_SUPPORTED'),
  verdict_confidence      text    not null check (verdict_confidence in ('HIGH','MODERATE','LOW')),

  -- Demand
  monthly_search_volume   integer,
  top_keyword             text,
  search_growth_pct       numeric,
  google_trends_direction text    check (google_trends_direction in ('Rising','Stable','Declining')),

  -- Social
  tiktok_view_count       bigint,
  tiktok_signal           text    check (tiktok_signal in ('High','Medium','Low')),

  -- Market structure
  review_concentration    numeric check (review_concentration >= 0 and review_concentration <= 1),
  competitor_count        integer,
  avg_competitor_reviews  numeric,
  price_range_low         numeric,
  price_range_high        numeric,

  -- Profitability
  gross_margin_pct        numeric,
  cac_pressure_score      numeric,
  fee_burden_score        numeric,

  -- Consumer signals
  consumer_pain_score       numeric,
  consumer_review_count     integer,
  consumer_negative_pct     numeric,
  consumer_theme_count      integer,
  repurchase_language_rate  numeric,

  -- Manufacturing
  manufacturing_feasibility_score  numeric,
  unit_cost_low                    numeric,
  unit_cost_high                   numeric,

  -- Regulatory
  safety_gate_clean        boolean not null,
  fda_recall_count         integer not null default 0,
  fda_adverse_event_count  integer not null default 0,

  -- All 7 scoring dimension raw scores (0–10, null when dimension was excluded)
  score_demand               numeric,
  score_market_accessibility numeric,
  score_profitability        numeric,
  score_consumer_pain        numeric,
  score_virality             numeric,
  score_subscription         numeric,
  score_manufacturing        numeric,

  -- Evidence quality
  evidence_breadth_pct    integer not null check (evidence_breadth_pct >= 0 and evidence_breadth_pct <= 100),
  contributing_providers  text[]  not null default '{}',

  -- Normalised opportunity pattern (JSONB — queryable via ->/->> operators)
  -- Shape: { market_stage, entry_type, top_contributors[], evidence_gaps[],
  --          why_approved[], pattern_tags[] }
  opportunity_pattern     jsonb   not null
);

-- Row-level security: each user sees only their own records.
-- Service role bypasses RLS for cross-user aggregate analytics.
alter table public.build_now_patterns enable row level security;

create policy "bnp_owner_select" on public.build_now_patterns
  for select using (auth.uid() = user_id);

create policy "bnp_owner_insert" on public.build_now_patterns
  for insert with check (auth.uid() = user_id);

-- No UPDATE or DELETE policies — records are append-only by design.

-- Indexes for the expected query patterns
create index bnp_user_score_idx      on public.build_now_patterns (user_id, opportunity_score desc);
create index bnp_created_idx         on public.build_now_patterns (created_at desc);
create index bnp_memo_id_idx         on public.build_now_patterns (memo_id);
create index bnp_market_stage_idx    on public.build_now_patterns ((opportunity_pattern->>'market_stage'));
create index bnp_entry_type_idx      on public.build_now_patterns ((opportunity_pattern->>'entry_type'));
-- GIN index for tag-based filtering: WHERE opportunity_pattern->'pattern_tags' @> '["viral_tiktok"]'
create index bnp_pattern_tags_gin    on public.build_now_patterns using gin ((opportunity_pattern->'pattern_tags'));
