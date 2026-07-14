// ── DataForSEO question-keyword VOC posts — Roadmap M2.13 ────────────────────
//
// Reuses the already-contracted, already-integrated DataForSEO
// related_keywords/live call (lib/keyword-engine/dataforseo.ts's
// fetchRelatedKeywords, extracted from DataForSeoKeywordProvider's own
// private fetchOnce — same real endpoint, zero new provider) and the exact
// same problem-language regex already used for per-product "Problem-aware
// Keywords" (lib/keyword-engine/cluster.ts's PROBLEM_AWARE_RE) — not a new
// pattern. No dedicated "question-detection" DataForSEO endpoint is called
// here; this is a disclosed, narrower proxy (keywords matching problem-
// language tokens), not true grammatical question detection.
//
// Deliberate, disclosed non-decision: a keyword's real search_volume has no
// honest analog to comment engagement (score/num_comments) — mapping it in
// would be an invented conversion, which this pipeline's own clustering.ts
// explicitly disclaims ("no invented numbers"). So every DataForSEO-sourced
// post gets score: 0, num_comments: 0 — it still counts toward real topic
// detection and post_count, it just never crowds out a real human quote in
// sample_quotes ranking (which sorts by engagement, always higher for any
// real comment/post).

import { fetchRelatedKeywords } from '@/lib/keyword-engine/dataforseo'
import { PROBLEM_AWARE_RE } from '@/lib/keyword-engine/cluster'
import type { VocPost } from './clustering'

const SOURCE_LABEL = 'dataforseo-question-keywords'

// Real posts for one topic-language seed keyword — [] (never fabricated)
// when DataForSEO credentials are unset or the real call fails, matching
// every other non-fatal collector in this codebase.
export async function fetchDataForSeoQuestionPostsForSeed(seed: string, now: Date): Promise<VocPost[]> {
  // Same enabled-check DataForSeoKeywordProvider.fetch() does before ever
  // reaching fetchRelatedKeywords — avoids one wasted real HTTP call when
  // credentials are unset, rather than relying on the API's own 401.
  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) return []

  const metrics = await fetchRelatedKeywords(seed)
  if (!metrics) return []

  const createdUtc = Math.floor(now.getTime() / 1000)

  return metrics
    .filter(m => PROBLEM_AWARE_RE.test(m.keyword))
    .map(m => ({
      title:        m.keyword,
      score:        0,
      num_comments: 0,
      created_utc:  createdUtc,
      subreddit:    SOURCE_LABEL,
    } satisfies VocPost))
}

// Category-agnostic entry point (Roadmap M2.12 precedent): takes seed
// phrases as a parameter, no fixed topic list imported here.
export async function fetchDataForSeoQuestionPosts(seeds: string[], now = new Date()): Promise<VocPost[]> {
  const perSeed = await Promise.all(seeds.map(seed => fetchDataForSeoQuestionPostsForSeed(seed, now)))
  return perSeed.flat()
}
