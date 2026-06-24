import { ReviewCollector }    from '../review-collector/collector'
import { ApifyReviewProvider } from '../review-collector/providers/apify'
import type { CollectedReview } from '../review-collector/types'
import { cleanReviewText, splitSentences } from './clean-text'
import { clusterPhrases } from './cluster'
import type { SentenceRef } from './cluster'
import type {
  ConsumerIntelligenceReport, ThemeInsight, SentimentBreakdown, SourceAsin,
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

const TOTAL_REVIEW_BUDGET = 100
const MAX_SOURCE_ASINS    = 2   // 50 reviews each ≈ 100 total at the same per-review cost as 1 call

const PROBLEM_CUES  = /\b(but|however|unfortunately|issue|problem|too (?:big|small|large|strong|expensive|hard|tiny|bitter)|disappoint|doesn'?t|did ?n'?t|don'?t|hard to|difficult to|hate|complain|wish it|stopped working|broke|defective|smell|taste(?:s)? bad)\b/i
const REQUEST_CUES  = /\b(wish|want(?:ed)?|would be nice|should (?:have|add|include|make)|need(?:s)? to|hope they|please add|if only|i'?d love|would love)\b/i

export async function analyzeConsumerIntelligence(
  competitors: { asin: string; brand: string }[],
  query?: string,
): Promise<ConsumerIntelligenceReport | null> {
  const targets = competitors.slice(0, MAX_SOURCE_ASINS)
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

  const reviewsPerAsin = Math.floor(TOTAL_REVIEW_BUDGET / targets.length)
  const provider = new ApifyReviewProvider(reviewsPerAsin)
  if (!provider.enabled) return null

  const asinsAnalyzed: SourceAsin[] = []
  const seen: Set<string> = new Set()
  const allReviews: CollectedReview[] = []

  for (const target of targets) {
    try {
      const collector = new ReviewCollector([provider], { max_reviews: reviewsPerAsin })
      const result = await collector.collect(target.asin)
      const fresh = result.reviews.filter(r => !seen.has(r.id))
      fresh.forEach(r => seen.add(r.id))
      allReviews.push(...fresh)
      asinsAnalyzed.push({ asin: target.asin, brand: target.brand, reviewsCollected: fresh.length })
    } catch (e: unknown) {
      console.error('[ConsumerIntelligence] collection failed', { asin: target.asin, error: e instanceof Error ? e.message : e })
      asinsAnalyzed.push({ asin: target.asin, brand: target.brand, reviewsCollected: 0 })
    }
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
  const confidence = computeConfidence(cleaned.length, asinsAnalyzed.length)

  return {
    asinsAnalyzed,
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
function computeConfidence(reviewCount: number, asinCount: number): number {
  const volumeFactor =
    reviewCount >= 90 ? 1.00 :
    reviewCount >= 60 ? 0.80 :
    reviewCount >= 30 ? 0.60 :
    reviewCount >= 15 ? 0.40 : 0.25
  const sourceFactor = asinCount >= 2 ? 1.0 : 0.85   // single-product sample is slightly less representative
  return Math.round(volumeFactor * sourceFactor * 100) / 100
}
