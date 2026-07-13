// ── VOC problem-cluster pipeline — Roadmap M2.7 ──────────────────────────────
//
// V2 Blueprint §6 (repoint). Weekly batch: fetches real "top of week" posts
// from a seed list of real subreddits (lib/voc-pipeline/subreddits.ts),
// clusters them by real keyword match against a disclosed problem-topic
// taxonomy (lib/voc-pipeline/topics.ts), ranks the resulting clusters by
// real post volume, computes a real week-over-week trend against this
// pipeline's own prior run, and writes one row per topic into
// `voc_problem_clusters` (migration 022, append-only). Triggered by Vercel
// Cron (app/api/cron/voc-pipeline), never called from the request path.

import { fetchRedditAccessToken } from '@/lib/reddit-client/token'
import { fetchWeeklyTopPosts } from './reddit-listing'
import type { VocRedditPost } from './reddit-listing'
import { clusterPosts, rankClusters } from './clustering'
import { PROBLEM_TOPICS } from './topics'
import { VOC_SEED_SUBREDDITS } from './subreddits'
import { getPreviousTopicPostCount, writeClusterRun } from './store'
import type { VocClusterRow } from './store'

export const VOC_PIPELINE_VERSION = 'heuristic-v1'

const SUBREDDIT_REQUEST_DELAY_MS = 250   // stays well under Reddit's 60 req/min OAuth limit

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ISO week identifier, e.g. "2026-W28" — same real week for every call
// within a single run (computed once, passed through), so a run that
// crosses midnight UTC mid-execution can't split across two week labels.
export function isoWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export interface VocPipelineResult {
  runWeek:       string
  topicsRanked:  number
  postsFetched:  number
  subredditsOk:  number
  subredditsFailed: number
}

export async function runVocPipeline(now = new Date()): Promise<VocPipelineResult | null> {
  const token = await fetchRedditAccessToken()
  if (!token) {
    console.error('VOC pipeline: failed to obtain Reddit access token — pipeline did not run')
    return null
  }

  const runWeek = isoWeekString(now)
  const allPosts: VocRedditPost[] = []
  let subredditsOk = 0
  let subredditsFailed = 0

  // Sequential, not parallel — respects Reddit's shared per-token rate
  // limit, same principle as lib/science-engine/pubmed.ts's sequential
  // per-year calls.
  for (const subreddit of VOC_SEED_SUBREDDITS) {
    const posts = await fetchWeeklyTopPosts(subreddit, token.value)
    if (posts.length) {
      allPosts.push(...posts)
      subredditsOk++
    } else {
      subredditsFailed++
    }
    await sleep(SUBREDDIT_REQUEST_DELAY_MS)
  }

  const clustered = clusterPosts(allPosts, PROBLEM_TOPICS)
  const ranked = rankClusters(clustered)

  const rows: VocClusterRow[] = []
  for (let i = 0; i < ranked.length; i++) {
    const cluster = ranked[i]
    const previousCount = await getPreviousTopicPostCount(cluster.topic_key, runWeek)
    const trend_pct = previousCount !== null && previousCount > 0
      ? Math.round(((cluster.post_count - previousCount) / previousCount) * 1000) / 10
      : null

    rows.push({
      run_week:             runWeek,
      topic_key:            cluster.topic_key,
      topic_label:          cluster.topic_label,
      post_count:           cluster.post_count,
      avg_engagement_score: cluster.avg_engagement_score,
      trend_pct,
      rank:                 i + 1,
      sample_quotes:        cluster.sample_quotes,
      subreddits_seen:      cluster.subreddits_seen,
      pipeline_version:     VOC_PIPELINE_VERSION,
    })
  }

  await writeClusterRun(rows)

  return {
    runWeek,
    topicsRanked: ranked.length,
    postsFetched: allPosts.length,
    subredditsOk,
    subredditsFailed,
  }
}
