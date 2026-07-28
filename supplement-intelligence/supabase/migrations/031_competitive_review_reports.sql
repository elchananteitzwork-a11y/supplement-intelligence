-- ── Competitive review reports — item ג (docs/RD_V4_COMPETITIVE_REVIEWS.md) ──
-- Stores the CompetitiveReviewEngine's MarketReport for one analysis, so a
-- real-money interrogation (~$1.5-2.5 in Apify + Anthropic spend per run) is
-- paid for exactly once: unique(analysis_id) is the pay-once guarantee the
-- route relies on — a second POST finds this row and returns it with zero
-- new spend, and a double-POST race collapses onto the constraint instead
-- of double-billing.
--
-- unique(analysis_id) (not (user_id, analysis_id)): an analysis has exactly
-- one owner (analyses.user_id), so one report per analysis is the correct
-- global invariant, and it's the stronger race guard.
--
-- RLS: same "owner all" single-policy shape as positions (029) /
-- analysis_outcomes (009) — the user reads/writes only their own reports.

create table public.competitive_review_reports (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  user_id             uuid not null references auth.users(id) on delete cascade,
  analysis_id         uuid not null references public.analyses(id) on delete cascade,

  -- The full MarketReport JSON, stored verbatim (single source of truth for
  -- the Record's competitive-reviews section; never recomputed on read).
  report              jsonb not null,
  engine_version      text not null,
  asins_analyzed      text[] not null,

  unique (analysis_id)
);

alter table public.competitive_review_reports enable row level security;

-- Stricter than 029's plain "owner all": because unique(analysis_id) is
-- GLOBAL (not per-user), a write policy that only checks user_id would let
-- any authenticated user squat another user's analysis slot via direct
-- PostgREST insert (their own user_id + someone else's analysis_id),
-- permanently blocking the real owner's report. The with-check therefore
-- also requires the referenced analysis to belong to the caller.
create policy "owner all" on public.competitive_review_reports
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.analyses a
      where a.id = analysis_id and a.user_id = auth.uid()
    )
  );

create index on public.competitive_review_reports (user_id, created_at desc);
