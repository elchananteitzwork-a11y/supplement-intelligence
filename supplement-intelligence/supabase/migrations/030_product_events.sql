-- ── Product Events — V4 Phase 1 gate instrumentation ─────────────────────────
-- docs/RD_V4_PHASE1.md §3 item 2 / §5 Phase-1 validation gates. A minimal,
-- owner-scoped event log strictly limited to the four events the Phase-1
-- gate metrics need to be measurable at all (Pull rate, interrogation rate,
-- return-after-trip): 'verdict_viewed', 'claim_tapped', 'pull_committed',
-- 'returned_after_trip'. No third-party analytics, nothing else logged —
-- per the R&D doc's explicit scope limit.
--
-- Append-only from the client's point of view (insert + select-own only, no
-- update/delete policy) — same read/write posture as watchlist_alerts
-- (migration 023), minus the service-role-only write restriction, since
-- here the authenticated user is the one real, legitimate writer of their
-- own usage events (there is no separate background job producing these
-- rows the way the re-check cron produces watchlist_alerts).

create table public.product_events (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  user_id             uuid not null references auth.users(id) on delete cascade,
  event               text not null check (event in ('verdict_viewed', 'claim_tapped', 'pull_committed', 'returned_after_trip')),

  -- Null-able: 'returned_after_trip' in particular may not always tie back
  -- to one specific analysis at write time.
  analysis_id         uuid references public.analyses(id) on delete cascade
);

alter table public.product_events enable row level security;

create policy "owner insert" on public.product_events for insert with check (auth.uid() = user_id);
create policy "owner select" on public.product_events for select using (auth.uid() = user_id);

create index on public.product_events (user_id, created_at desc);
create index on public.product_events (event, created_at desc);
