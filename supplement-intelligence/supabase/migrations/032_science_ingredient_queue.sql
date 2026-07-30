-- ── Science Ingredient Queue — Roadmap "Dynamic Science Coverage" ──────────
-- docs/RD_DYNAMIC_SCIENCE_COVERAGE.md §3 step 3 (owner-approved 2026-07-28).
-- A demand-tracking queue, not user data: when a user's query names a
-- vocabulary-matched ingredient that isn't one of the 3 benchmark "tracked"
-- ingredients with live nightly PubMed/ClinicalTrials.gov data
-- (lib/science-engine/tracked-ingredients.ts), the app records that someone
-- asked about it. The science cron's queue-drain phase later spends a
-- bounded nightly budget (QUEUE_BUDGET_PER_NIGHT) fetching real science data
-- for the most-demanded unfetched rows, and re-refreshing previously-fetched
-- rows whose provider_cache entry is nearing its 30h TTL expiry, weighted by
-- demand. Global signal, no user_id by design — not tied to any account.
--
-- Writes only ever happen from server-side code using the service-role key:
-- the enqueue call in app/api/generate/route.ts (vocabulary match + science
-- cache miss) and the nightly cron's drain phase
-- (app/api/cron/science-pipeline/route.ts). No anon or authenticated client
-- ever writes or reads this table directly. Deliberately no immutability
-- triggers (unlike divergence_alerts/027): rows are intentionally mutated in
-- place (request_count increments, last_requested_at bumps, fetched_at gets
-- set once fetched).

create table public.science_ingredient_queue (
  ingredient          text primary key,

  first_requested_at  timestamptz not null default now(),
  last_requested_at   timestamptz not null default now(),
  request_count       int not null default 1,

  -- Null until the queue-drain phase fetches real science data for this
  -- ingredient and populates provider_cache; set (and later re-set on
  -- demand-weighted TTL re-refresh) by the cron's drain phase only.
  fetched_at          timestamptz null
);

alter table public.science_ingredient_queue enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles (anon,
-- authenticated) are denied all access — same lockdown pattern as
-- divergence_alerts (027), applied here to a mutable rather than
-- append-only table.

-- Drain pattern 1: unfetched rows, oldest first_requested_at first
-- (`where fetched_at is null order by first_requested_at asc limit N`).
create index sciq_unfetched_oldest_idx
  on public.science_ingredient_queue (first_requested_at asc)
  where fetched_at is null;

-- Drain pattern 2: previously-fetched rows nearing TTL expiry, most-demanded
-- first (`where fetched_at is not null order by request_count desc limit
-- N`); exact expiry-window filtering happens in application code against
-- provider_cache, this index just keeps the demand ordering fast.
create index sciq_fetched_by_demand_idx
  on public.science_ingredient_queue (request_count desc)
  where fetched_at is not null;

comment on table public.science_ingredient_queue is
  'Roadmap "Dynamic Science Coverage": global demand-tracking queue of vocabulary-matched ingredients requested but not yet covered by the 3 benchmark tracked ingredients. Service-role-only (no anon/authenticated RLS policies); no user_id by design (not user data). Fed by app/api/generate/route.ts on vocabulary-match + science-cache-miss; drained by the science cron''s queue-drain phase (app/api/cron/science-pipeline/route.ts) within a bounded nightly budget, oldest-unfetched first then demand-weighted TTL re-refresh.';

-- ── Atomic enqueue RPC ───────────────────────────────────────────────────
-- SECURITY REVIEW NOTE (added after the table above was first drafted —
-- flag for re-review): this function was added in the same migration file,
-- same convention as upsert_leaderboard_entry (migration 008) plus its own
-- immediate grant lockdown (migration 013 fixed that as a *separate*,
-- later migration for upsert_leaderboard_entry/consume_analysis_slot/
-- refund_analysis_slot — done correctly from the start here instead, in one
-- migration, rather than repeating that two-step gap).
--
-- Plain client-side `.upsert()` can't atomically express "increment an
-- existing row's counter, else insert at 1" — this does it in one atomic
-- `insert ... on conflict do update` statement, called via `.rpc()` from
-- app/api/generate/route.ts's own supabaseServiceRole() client (service role
-- already bypasses RLS; `security definer` here is defense in depth, not the
-- only thing standing between this function and anon/authenticated access —
-- the explicit revoke/grant below is).
create or replace function public.increment_science_queue_demand(p_ingredient text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.science_ingredient_queue (ingredient, request_count, first_requested_at, last_requested_at, fetched_at)
  values (p_ingredient, 1, now(), now(), null)
  on conflict (ingredient) do update set
    request_count     = science_ingredient_queue.request_count + 1,
    last_requested_at = now();
    -- first_requested_at and fetched_at are deliberately never touched here.
end;
$$;

revoke all on function public.increment_science_queue_demand(text) from public, anon, authenticated;
grant execute on function public.increment_science_queue_demand(text) to service_role;
