import { ReviewCollector }    from '../review-collector/collector'
import { ApifyReviewProvider } from '../review-collector/providers/apify'
import type { CollectedReview } from '../review-collector/types'
import { cleanReviewText, splitSentences } from './clean-text'
import { clusterPhrases } from './cluster'
import type { SentenceRef } from './cluster'
import type {
  ConsumerIntelligenceReport, ThemeInsight, SentimentBreakdown, SourceProduct,
} from './types'

// ── Consumer Intelligence orchestrator ──────────────────────────────────────
//
// Rules this exists to satisfy (user-specified, 2026-06-24):
//   - every insight grounded in real review text, traceable to actual reviews
//   - no invented complaints, no LLM summarization
//   - max 100 reviews unless evidence suggests fewer are sufficient
//   - dedupe, split positive/negative, cluster (not free-form), show counts
//
// Source: the top competitor ASINs already found by Competition Intelligence
// (lib/signal-engine/providers/competition.ts top_competitors) — reused, not
// re-searched, to avoid a second discovery cost.

const TOTAL_REVIEW_BUDGET  = 100
const MAX_SOURCE_PRODUCTS  = 2   // 50 reviews each ≈ 100 total at the same per-review cost as 1 call

// ROOT CAUSE (found 2026-06-24, "Load failed" search-stability bug):
// ReviewCollector's DEFAULT_CONFIG.timeout_ms is 15_000 — sized for the raw
// HTML scraper and Rainforest's fast per-page API calls, both sub-second to
// a few seconds normally. The Apify review-scraping actor used here is a
// run-sync call that, like the Apify search actor used by Competition
// Intelligence, genuinely needs up to ~70s (confirmed live this session for
// the closely related search actor: 30-73s real range). At the 15s default,
// every real run was being aborted and RETRIED (max_retries: 3) — wasting
// up to ~48s per ASIN on retries that were never going to finish in time,
// before giving up. Sequential across 2 ASINs, that's up to ~96s of pure
// waste stacked on top of signal-engine + Claude generation time, which is
// what was pushing total request time past the platform's connection
// tolerance and surfacing as a dropped connection ("Load failed") on the
// client even though the server (and Apify, which bills regardless) kept
// working — explaining why results sometimes appeared later via cache.
const COLLECTOR_TIMEOUT_MS = 70_000
const COLLECTOR_MAX_RETRIES = 1   // a slow-but-working call should NOT be retried — retrying just repeats the same wait for the same likely outcome
// Hard ceiling on the whole multi-ASIN fetch (run in parallel below, not
// sequentially) so Consumer Intelligence as a stage can never blow past its
// allotted slice of the overall request budget — see app/api/generate/route.ts.
const TOTAL_TIMEOUT_MS = 85_000

// NOTE (negation fix): bare doesn't/don't/didn't were previously their own
// standalone alternatives here — removed. A negation contraction's mere
// presence was never itself evidence of a problem ("doesn't taste bad" was
// matching as a complaint purely because it contains "doesn't"), and it gave
// the now-added negation check below nothing useful to do for this specific
// alternative (the cue WAS the negation). Genuinely negated complaints like
// "doesn't work" are no longer caught by this list alone — an accepted
// recall trade-off for removing a worse false-positive source.
const PROBLEM_CUES  = /\b(but|however|unfortunately|issue|problem|too (?:big|small|large|strong|expensive|hard|tiny|bitter)|disappoint|hard to|difficult to|hate|complain|wish it|stopped working|broke|defective|smell|taste(?:s)? bad)\b/i
const REQUEST_CUES  = /\b(wish|want(?:ed)?|would be nice|should (?:have|add|include|make)|need(?:s)? to|hope they|please add|if only|i'?d love|would love)\b/i
// Real, deterministic repurchase-behavior language — same pattern-matching
// technique already used for PROBLEM_CUES/REQUEST_CUES above, not a new
// category of analysis. Feeds the Subscription/Retention composite (see
// lib/scoring.ts) — never AI-judged, a literal phrase match over real text.
const REPURCHASE_CUES = /\b(re-?order(?:ed|ing)?|re-?purchas(?:e|ed|ing)|re-?buy(?:ing)?|subscribe|subscription|auto-?ship|ran out|run(?:s)? out|out of (?:it|this|these)|order(?:ed|ing)? again|bought again|buy(?:ing)? again|every month|each month|monthly|repeat (?:customer|buyer|purchase)|been using (?:it|this) for (?:months|years)|stocked up|buying more)\b/i

// Negation guard: a cue word/phrase immediately preceded by a negation token
// means the opposite of what the bare cue implies ("won't reorder", "don't
// want this", "doesn't taste bad") — matching it as-is silently inverted the
// signal. Checks only the few words directly before each match (English
// negation overwhelmingly precedes what it negates), not a full parse —
// same deterministic-regex tier as the cues above, not a new analysis method.
const NEGATION_TOKENS = /\b(not|never|no|none|nothing|without|cannot|can'?t|won'?t|wouldn'?t|shouldn'?t|doesn'?t|don'?t|didn'?t|isn'?t|wasn'?t|aren'?t|weren'?t)\b/i
const NEGATION_WINDOW_WORDS = 4

function hasUnnegatedMatch(text: string, cueRegex: RegExp): boolean {
  const flags   = cueRegex.flags.includes('g') ? cueRegex.flags : cueRegex.flags + 'g'
  const matches = Array.from(text.matchAll(new RegExp(cueRegex.source, flags)))
  return matches.some(match => {
    const start  = match.index ?? 0
    const before = text.slice(0, start).trim().split(/\s+/).slice(-NEGATION_WINDOW_WORDS).join(' ')
    return !NEGATION_TOKENS.test(before)
  })
}

export async function analyzeConsumerIntelligence(
  competitors: { productId: string; brand: string }[],
  query?: string,
): Promise<ConsumerIntelligenceReport | null> {
  const targets = competitors.slice(0, MAX_SOURCE_PRODUCTS)
  if (!targets.length) return null

  // Product/brand/query words aren't customer sentiment — exclude them so
  // "magnesium glycinate" or "pure encapsulations" don't surface as "themes"
  // just because the product is mentioned by name.
  const excludeWords = Array.from(new Set(
    [query ?? '', ...targets.map(t => t.brand)]
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 1),
  ))

  const reviewsPerProduct = Math.floor(TOTAL_REVIEW_BUDGET / targets.length)
  const provider = new ApifyReviewProvider(reviewsPerProduct)
  if (!provider.enabled) return null

  // Parallel, not sequential — two independent Apify runs don't need to wait
  // on each other, and running them concurrently halves this stage's
  // worst-case wall-clock contribution to the overall request.
  const fetchOne = async (target: { productId: string; brand: string }) => {
    try {
      const collector = new ReviewCollector([provider], {
        max_reviews:  reviewsPerProduct,
        timeout_ms:   COLLECTOR_TIMEOUT_MS,
        max_retries:  COLLECTOR_MAX_RETRIES,
      })
      // ReviewCollector.collect takes an Amazon ASIN today (it's a
      // provider-layer concern — every current ReviewProvider is Amazon-
      // only) — target.productId is that same value under its generic
      // core-model name.
      const result = await collector.collect(target.productId)
      return { target, reviews: result.reviews }
    } catch (e: unknown) {
      console.error('[ConsumerIntelligence] collection failed', { productId: target.productId, error: e instanceof Error ? e.message : e })
      return { target, reviews: [] as CollectedReview[] }
    }
  }

  const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))])

  const settled = await withTimeout(
    Promise.all(targets.map(fetchOne)),
    TOTAL_TIMEOUT_MS,
    targets.map(target => ({ target, reviews: [] as CollectedReview[] })),
  )

  const productsAnalyzed: SourceProduct[] = []
  const seen: Set<string> = new Set()
  const allReviews: CollectedReview[] = []

  for (const { target, reviews } of settled) {
    const fresh = reviews.filter(r => !seen.has(r.id))
    fresh.forEach(r => seen.add(r.id))
    allReviews.push(...fresh)
    productsAnalyzed.push({ productId: target.productId, brand: target.brand, reviewsCollected: fresh.length })
  }

  if (allReviews.length < 5) {
    console.log('[ConsumerIntelligence] too few reviews collected', { total: allReviews.length })
    return null
  }

  const cleaned = allReviews.map(r => ({ ...r, body: cleanReviewText(r.body) }))

  const positive = cleaned.filter(r => r.rating >= 4)
  const negative = cleaned.filter(r => r.rating <= 2)

  const toSentences = (reviews: CollectedReview[]): SentenceRef[] =>
    reviews.flatMap(r => splitSentences(r.body).map(text => ({ reviewId: r.id, text })))

  const negativeSentences = toSentences(negative)
  const positiveSentences = toSentences(positive)
  const allSentences      = toSentences(cleaned)
  const problemSentences  = allSentences.filter(s => hasUnnegatedMatch(s.text, PROBLEM_CUES))
  const requestSentences  = allSentences.filter(s => hasUnnegatedMatch(s.text, REQUEST_CUES))

  const toThemes = (clusters: ReturnType<typeof clusterPhrases>, poolSize: number): ThemeInsight[] =>
    clusters.map(c => ({
      label:        c.label,
      mentionedBy:  c.reviewCount,
      outOf:        poolSize,
      exampleQuote: c.exampleQuote,
    }))

  const negativeThemes        = toThemes(clusterPhrases(negativeSentences, { excludeWords }), negative.length)
  const positiveThemes        = toThemes(clusterPhrases(positiveSentences, { excludeWords }), positive.length)
  const mostMentionedProblems = toThemes(
    clusterPhrases(problemSentences, { minReviewCount: 3, minPoolFraction: 0.03, excludeWords }),
    cleaned.length,
  )
  const featureRequests = toThemes(
    clusterPhrases(requestSentences, { minReviewCount: 2, minPoolFraction: 0.02, excludeWords }),
    cleaned.length,
  )

  const sentimentBreakdown = computeSentimentBreakdown(cleaned)
  const confidence = computeConfidence(cleaned.length, productsAnalyzed.length)

  // Distinct reviews (not sentences) whose body matches repurchase-behavior
  // language — counted across all ratings, same scope as mostMentionedProblems,
  // since repurchase behavior is a fact about usage, not sentiment.
  const repurchaseReviewCount = cleaned.filter(r => hasUnnegatedMatch(r.body, REPURCHASE_CUES)).length

  return {
    productsAnalyzed,
    totalReviewsCollected: cleaned.length,
    positivePoolSize:      positive.length,
    negativePoolSize:      negative.length,
    sentimentBreakdown,
    negativeThemes,
    mostMentionedProblems,
    featureRequests,
    positiveThemes,
    repurchaseLanguage: { mentionedBy: repurchaseReviewCount, outOf: cleaned.length },
    confidence,
    generatedAt: new Date().toISOString(),
  }
}

function computeSentimentBreakdown(reviews: CollectedReview[]): SentimentBreakdown {
  const total = reviews.length
  const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const r of reviews) {
    const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5
    counts[star]++
    sum += r.rating
  }
  const distribution = ([1, 2, 3, 4, 5] as const).map(star => ({
    star,
    count: counts[star],
    pct:   total > 0 ? Math.round((counts[star] / total) * 1000) / 10 : 0,
  }))

  return {
    avgRating:    total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
    totalReviews: total,
    distribution,
    positivePct: total > 0 ? Math.round(((counts[4] + counts[5]) / total) * 1000) / 10 : 0,
    neutralPct:  total > 0 ? Math.round((counts[3] / total) * 1000) / 10 : 0,
    negativePct: total > 0 ? Math.round(((counts[1] + counts[2]) / total) * 1000) / 10 : 0,
  }
}

// Volume-based confidence, no LLM-derived component (there is no LLM in this
// pipeline) — more real reviews collected = more representative clusters.
function computeConfidence(reviewCount: number, productCount: number): number {
  const volumeFactor =
    reviewCount >= 90 ? 1.00 :
    reviewCount >= 60 ? 0.80 :
    reviewCount >= 30 ? 0.60 :
    reviewCount >= 15 ? 0.40 : 0.25
  const sourceFactor = productCount >= 2 ? 1.0 : 0.85   // single-product sample is slightly less representative
  return Math.round(volumeFactor * sourceFactor * 100) / 100
}
