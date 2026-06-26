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

const PROBLEM_CUES  = /\b(but|however|unfortunately|issue|problem|too (?:big|small|large|strong|expensive|hard|tiny|bitter)|disappoint|doesn'?t|did ?n'?t|don'?t|hard to|difficult to|hate|complain|wish it|stopped working|broke|defective|smell|taste(?:s)? bad)\b/i
const REQUEST_CUES  = /\b(wish|want(?:ed)?|would be nice|should (?:have|add|include|make)|need(?:s)? to|hope they|please add|if only|i'?d love|would love)\b/i

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
  const problemSentences  = allSentences.filter(s => PROBLEM_CUES.test(s.text))
  const requestSentences  = allSentences.filter(s => REQUEST_CUES.test(s.text))

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
