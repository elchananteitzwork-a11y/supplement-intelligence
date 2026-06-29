-- ─────────────────────────────────────────────────────────────────────────
-- OUTCOME TRACKING
-- Two changes:
--
-- 1. Fix a real, live bug found while building this: analyses.build_decision
--    had a CHECK constraint listing only the 3 original decision values
--    ('BUILD_NOW','VALIDATE_FURTHER','SKIP') — it was never updated when
--    CATEGORY_CREATION_CANDIDATE was added to the application's BuildDecision
--    type. Any analysis that resolves to that 4th value would fail the
--    constraint and fail to save entirely (the existing error path refunds
--    the user's slot, but the analysis itself is lost). Fixed by replacing
--    the constraint with one that matches the current BuildDecision union —
--    found and fixed here because outcome tracking depends on every
--    analysis actually persisting; it can't track an outcome for a row
--    that was never saved.
--
-- 2. New analysis_outcomes table: one row per analysis (analysis_id is the
--    primary key, not a separate id+unique pair — this is a strict 1:1,
--    upserted over time as the user's real-world status changes, not a
--    history log). Captures exactly what's needed to eventually answer
--    "do BUILD_NOW recommendations outperform SKIP recommendations":
--    join analyses.build_decision against analysis_outcomes.outcome_verdict.
--    outcome_verdict has a third value, 'too_early_to_tell', deliberately —
--    forcing a binary success/failure choice before a real outcome is
--    knowable would corrupt the exact dataset this table exists to produce
--    clean data for.
-- ─────────────────────────────────────────────────────────────────────────

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

create table public.analysis_outcomes (
  analysis_id          uuid primary key references public.analyses(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,

  -- Did the user actually build it — independent of whether it launched.
  built_status         text not null default 'not_started'
                        check (built_status in ('not_started','in_progress','built','abandoned')),
  -- Did a built product actually reach the market.
  launch_status        text not null default 'not_launched'
                        check (launch_status in ('not_launched','launched','discontinued')),
  -- Optional, self-reported, real-world revenue signal — never required,
  -- never estimated/backfilled if absent (same no-fabrication rule as the
  -- rest of this codebase: a missing value here means "not reported," not
  -- a guessed number).
  monthly_revenue_usd  numeric(12,2) check (monthly_revenue_usd is null or monthly_revenue_usd >= 0),
  -- The actual label the future BUILD_NOW-vs-SKIP analysis keys off.
  -- 'too_early_to_tell' is a real, distinct value, not a null-substitute —
  -- it means the user told us they don't know yet, which is itself useful
  -- (lets a future query exclude undecided cases rather than silently
  -- treating "no report yet" and "reported as undecided" the same way).
  outcome_verdict      text check (outcome_verdict in ('success','failure','too_early_to_tell')),
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on public.analysis_outcomes (user_id);
-- Supports the future validation query's join+filter pattern: analyses
-- joined to analysis_outcomes, grouped by build_decision x outcome_verdict.
create index on public.analysis_outcomes (outcome_verdict) where outcome_verdict is not null;

alter table public.analysis_outcomes enable row level security;

create policy "owner all" on public.analysis_outcomes for all using (auth.uid() = user_id);
