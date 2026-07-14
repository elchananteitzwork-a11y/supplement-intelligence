// ── VOC problem-cluster pipeline — Roadmap M2.7, re-sourced Roadmap M2.13 ────
//
// V2 Blueprint §6 (repoint). Weekly batch: fetches real posts, clusters
// them by real keyword match against a disclosed problem-topic taxonomy
// (lib/voc-pipeline/topics.ts), ranks the resulting clusters by real post
// volume, computes a real week-over-week trend against this pipeline's own
// prior run, and writes one row per topic into `voc_problem_clusters`
// (migration 022, append-only). Triggered by Vercel Cron
// (app/api/cron/voc-pipeline), never called from the request path.
//
// Roadmap M2.13 (2026-07-14): re-sourced from Reddit (deferred — zero
// credentials configured anywhere, this pipeline's own fetchRedditAccessToken
// check returned null on every real run since it shipped, see M2.7's and
// M2.11's own completion notes) onto YouTube comments + DataForSEO
// problem-aware keywords, both real production data sources. Both new
// fetches degrade non-fatally to [] on any failure — an improvement over
// the old design's single all-or-nothing gate (missing Reddit token meant
// the ENTIRE pipeline aborted before fetching anything); now the pipeline
// always completes with whatever real data each source produced. Both
// sources feed the SAME unmodified clusterPosts/rankClusters call — one
// combined weekly run, not two separate ones, since voc_problem_clusters'
// (run_week, topic_key) unique constraint has no source column.
//
// Amazon Q&A (also named in the original scope) is deliberately NOT built
// here — no existing scraper/actor/pattern to reuse, unlike the two
// sources above; it needs its own vetting pass first (same discipline as
// the Kalodata/FastMoss bake-off, Roadmap M3.5), proposed as a follow-up.

import { clusterPosts, rankClusters } from './clustering'
import type { VocPost } from './clustering'
import { PROBLEM_TOPICS, DATAFORSEO_SEED_PHRASES } from './topics'
import { fetchYoutubePosts } from './youtube-listing'
import { fetchDataForSeoQuestionPosts } from './dataforseo-question-posts'
import { getPreviousTopicPostCount, writeClusterRun } from './store'
import type { VocClusterRow } from './store'

export const VOC_PIPELINE_VERSION = 'heuristic-v2-youtube-dataforseo'

// The 8 existing problem-topic labels are the real, bounded query seed set
// for YouTube search — confirmed via a real live run (2026-07-14) to
// return real, usable video/comment data as-is. Each fetched post still
// independently re-verifies against the full topic keyword regex set via
// the unchanged clusterPosts() below, so an imperfect search match never
// gets a free pass into a topic it doesn't actually belong to.
const YOUTUBE_QUERIES = PROBLEM_TOPICS.map(t => t.label)

// DataForSEO needs a DIFFERENT seed set — real search-style phrases, not
// topic labels (see DATAFORSEO_SEED_PHRASES's own comment in topics.ts for
// the live-call evidence that labels return zero usable keywords).
const DATAFORSEO_SEEDS = PROBLEM_TOPICS.map(t => DATAFORSEO_SEED_PHRASES[t.key])

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
  youtubePostsFetched:    number
  dataforseoPostsFetched: number
}

// No longer returns null on a missing credential — unlike Reddit's single
// all-or-nothing token gate, each new source degrades independently and
// non-fatally (see youtube-listing.ts / dataforseo-question-posts.ts), so
// this always completes with whatever real data was actually available.
export async function runVocPipeline(now = new Date()): Promise<VocPipelineResult> {
  const runWeek = isoWeekString(now)

  const [youtubePosts, dataforseoPosts] = await Promise.all([
    fetchYoutubePosts(YOUTUBE_QUERIES),
    fetchDataForSeoQuestionPosts(DATAFORSEO_SEEDS, now),
  ])
  const allPosts: VocPost[] = [...youtubePosts, ...dataforseoPosts]

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
    youtubePostsFetched:    youtubePosts.length,
    dataforseoPostsFetched: dataforseoPosts.length,
  }
}
