-- ── Watchlist + Alerts — Roadmap M2.8 ────────────────────────────────────────
-- V2 Blueprint §13 item 8, §14: "One-click Watch... the user is alerted on
-- stage transitions... and kill-criteria triggers." Per-user data (unlike
-- provider_cache/voc_problem_clusters, which are system-level) — same RLS
-- shape as analysis_outcomes (migration 009): a single "owner all" policy,
-- since the user reads/writes/deletes only their own watches.
--
-- `watchlist` snapshots the originating analysis's real lifecycle stage and
-- kill criteria at watch-time (memo_data->>'lifecycle_classification' etc.
-- already has this — copied here rather than re-read from analyses on every
-- check, so a later edit/deletion of the original analysis can't silently
-- change what a running watch is comparing against).
--
-- `watchlist_alerts` is append-only, written only by the re-check cron job
-- (service role) — never by the client directly, which is why it has no
-- insert policy for regular users (select-only, matching the read-only
-- posture analyses/verdict_ledger's owner already has over service-role-
-- authored rows elsewhere in this schema).

create table public.watchlist (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  user_id             uuid not null references auth.users(id) on delete cascade,
  analysis_id         uuid not null references public.analyses(id) on delete cascade,

  category_name       text not null,
  category_id         text not null,   -- module id (e.g. 'supplements') — required for the re-check's fast-tier fetch to gate correctly, same field SignalContext.categoryId already needs

  active              boolean not null default true,

  -- Real snapshot from the originating analysis, at watch-time — never
  -- re-derived from a later edit to that analysis.
  lifecycle_stage_at_watch text,
  kill_criteria            jsonb not null default '[]'::jsonb,

  -- Updated by the re-check job after every real run.
  last_checked_at          timestamptz,
  last_lifecycle_stage     text,

  unique (user_id, analysis_id)
);

alter table public.watchlist enable row level security;
create policy "owner all" on public.watchlist for all using (auth.uid() = user_id);

create index watchlist_active_idx on public.watchlist (active) where active = true;
create index watchlist_user_idx   on public.watchlist (user_id, created_at desc);

create table public.watchlist_alerts (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  watchlist_id        uuid not null references public.watchlist(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,

  alert_type          text not null check (alert_type in ('stage_transition', 'kill_criteria_triggered')),

  -- Populated for alert_type = 'stage_transition'.
  previous_stage      text,
  new_stage           text,

  -- Populated for alert_type = 'kill_criteria_triggered'.
  kill_criterion_key   text,
  kill_criterion_label text,

  acknowledged        boolean not null default false
);

alter table public.watchlist_alerts enable row level security;
-- Read-only for the owning user; no insert/update/delete policy — only the
-- re-check job (service role, bypasses RLS) ever writes a row here.
create policy "owner select" on public.watchlist_alerts for select using (auth.uid() = user_id);

create index watchlist_alerts_user_idx       on public.watchlist_alerts (user_id, created_at desc);
create index watchlist_alerts_watchlist_idx  on public.watchlist_alerts (watchlist_id, created_at desc);
