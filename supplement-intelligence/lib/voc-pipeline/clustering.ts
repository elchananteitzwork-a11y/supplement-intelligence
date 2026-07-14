// ── Deterministic problem-language clustering — Roadmap M2.7 ────────────────
//
// Pure function: real fetched posts in, real per-topic cluster stats out.
// No AI, no invented numbers — every post's topic membership is a real
// regex match against its own real title/body (lib/voc-pipeline/topics.ts);
// every count, engagement score, and quote comes directly from the posts
// actually fetched this run. A post can belong to more than one topic when
// its language genuinely spans clusters (e.g. a gut+skin post) — never
// forced into exactly one bucket.
//
// Roadmap M2.13 (2026-07-14): this file's input type was `VocRedditPost`
// with a `selftext` field — both literally Reddit's own API vocabulary,
// which became misleading once this pipeline started sourcing real posts
// from YouTube comments and DataForSEO question-keywords too (Roadmap M2.7's
// Reddit fetch is deferred, not deleted — lib/voc-pipeline/reddit-listing.ts
// still produces this same shape, kept dormant). Renamed to `VocPost`/
// `body` here, the same generalization-of-a-misleading-name discipline
// already applied once before in this codebase (M1.3's channel-taxonomy
// renames, e.g. amazon_marketplace→amazon_market). `subreddit`/
// `subreddits_seen` are deliberately KEPT AS-IS below — they already mean
// "which source-group did this come from" generically, and renaming them
// too would be unjustified extra churn for a concept that's still accurate
// even under its Reddit-derived name: a YouTube video ID or the fixed
// literal 'dataforseo-question-keywords' fits the same slot correctly.
// Zero clustering/ranking LOGIC changed by this rename — same regex
// matching, same engagement formula, same ranking, over the same shape of
// data under new, honest names.

import type { ProblemTopic } from './topics'

export interface VocPost {
  title:        string
  body?:        string
  score:        number
  num_comments: number
  created_utc:  number
  subreddit:    string
}

export interface TopicClusterStats {
  topic_key:      string
  topic_label:    string
  post_count:     number
  // Real blended engagement (score + 2x comments, log-dampened) — same
  // "reward depth of discussion, not just upvotes" philosophy as reddit.ts's
  // existing rvScore, recomputed here rather than imported since this
  // operates over a differently-shaped post list (no upvote_ratio here —
  // weekly "top" listings don't need a separate sentiment read the way a
  // per-query search does).
  avg_engagement_score: number
  sample_quotes:  string[]
  subreddits_seen: string[]
}

const MAX_SAMPLE_QUOTES  = 5
const SNIPPET_MAX_CHARS  = 180

function postMatchesTopic(post: VocPost, topic: ProblemTopic): boolean {
  const haystack = `${post.title} ${post.body ?? ''}`
  return topic.keywords.some(rx => rx.test(haystack))
}

function engagementOf(post: VocPost): number {
  return post.score + post.num_comments * 2
}

function quoteFor(post: VocPost): string {
  if (post.body && post.body.trim().length > 0) {
    const snippet = post.body.trim().slice(0, SNIPPET_MAX_CHARS)
    return `${post.title.trim()} — "${snippet}${post.body.length > SNIPPET_MAX_CHARS ? '…' : ''}"`
  }
  return post.title.trim()
}

// Real posts -> real per-topic stats, one entry per topic that matched at
// least one post this run (a topic with zero real matches is simply absent
// from the result — never a fabricated zero-row).
export function clusterPosts(posts: VocPost[], topics: ProblemTopic[]): TopicClusterStats[] {
  const results: TopicClusterStats[] = []

  for (const topic of topics) {
    const matched = posts.filter(p => postMatchesTopic(p, topic))
    if (!matched.length) continue

    const totalEngagement = matched.reduce((s, p) => s + engagementOf(p), 0)
    const avgEngagement = Math.round((totalEngagement / matched.length) * 10) / 10

    const bySubreddit = new Set<string>()
    matched.forEach(p => bySubreddit.add(p.subreddit))

    const sampleQuotes = [...matched]
      .sort((a, b) => engagementOf(b) - engagementOf(a))
      .slice(0, MAX_SAMPLE_QUOTES)
      .map(quoteFor)

    results.push({
      topic_key:      topic.key,
      topic_label:    topic.label,
      post_count:     matched.length,
      avg_engagement_score: avgEngagement,
      sample_quotes:  sampleQuotes,
      subreddits_seen: Array.from(bySubreddit).sort(),
    })
  }

  return results
}

// Deterministic ranking: highest real post_count first; ties broken
// alphabetically by topic_key so the order is always reproducible from the
// same input, never dependent on array/object iteration order.
export function rankClusters(stats: TopicClusterStats[]): TopicClusterStats[] {
  return [...stats].sort((a, b) => b.post_count - a.post_count || a.topic_key.localeCompare(b.topic_key))
}
