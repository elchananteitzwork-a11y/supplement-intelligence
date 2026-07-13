-- ── VOC Problem Clusters — Roadmap M2.7 ─────────────────────────────────────
-- V2 Blueprint §6 (repoint): "Repurpose Reddit toward problem-cluster
-- discovery (scheduled pipeline; productizes what VOC research proved
-- manually)." One row per problem-topic per weekly pipeline run
-- (lib/voc-pipeline/pipeline.ts, triggered by app/api/cron/voc-pipeline) —
-- append-only across runs so "volume trends" (this milestone's own
-- acceptance criterion) has real history to compare against, not a single
-- overwritten latest-value row the way lib/provider-cache's table works.
--
-- Same "service-role only, no RLS policies" posture as provider_cache
-- (migration 010) — this is system-level pipeline output, not per-user
-- data; there is no owning user_id to check a policy against.

create table public.voc_problem_clusters (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),

  run_week              text    not null,   -- ISO week, e.g. '2026-W28'
  topic_key             text    not null,   -- lib/voc-pipeline/topics.ts taxonomy key
  topic_label           text    not null,

  post_count            integer not null check (post_count >= 0),
  avg_engagement_score  numeric not null,
  -- % change vs. this topic's most recent prior run's post_count. Null when
  -- there is no real prior observation yet (first time this topic matched).
  trend_pct             numeric,
  rank                  integer not null check (rank >= 1),   -- 1 = highest post_count this run

  sample_quotes         jsonb   not null default '[]'::jsonb,  -- real verbatim post titles/snippets, capped at 5
  subreddits_seen       text[]  not null default '{}',

  pipeline_version      text    not null
);

alter table public.voc_problem_clusters enable row level security;
-- No RLS policies -> service role bypasses RLS; all other roles denied.

create unique index voc_clusters_run_topic_uniq on public.voc_problem_clusters (run_week, topic_key);
create index voc_clusters_run_week_idx         on public.voc_problem_clusters (run_week, rank);
create index voc_clusters_topic_history_idx    on public.voc_problem_clusters (topic_key, run_week desc);

comment on table public.voc_problem_clusters is
  'Weekly-batch output of lib/voc-pipeline: real Reddit "top of week" posts across a seed subreddit list, clustered by real keyword match against a disclosed problem-topic taxonomy. Append-only across weekly runs (unique on run_week+topic_key for idempotent retries) so week-over-week trend_pct has real history to read, not a single overwritten value.';
