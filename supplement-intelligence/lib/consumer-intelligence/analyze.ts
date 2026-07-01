import { ReviewCollector }        from '../review-collector/collector'
import { getDefaultProviders }    from '../review-collector/providers/registry'
import type { CollectedReview }   from '../review-collector/types'
import { cleanReviewText, splitSentences } from './clean-text'
import { clusterPhrases }         from './cluster'
import type { SentenceRef }       from './cluster'
import { collectTikTokComments, PURCHASE_INTENT_CUES } from './tiktok-comments'
import type {
  ConsumerIntelligenceReport, ThemeInsight, SentimentBreakdown, SourceProduct,
} from './types'
import { cacheGet, cacheSet } from '../provider-cache'

// ── Consumer Intelligence orchestrator ──────────────────────────────────────
//
// Rules this exists to satisfy (user-specified, 2026-06-24):
//   - every insight grounded in real review text, traceable to actual reviews
//   - no invented complaints, no LLM summarization
//   - max 100 reviews unless evidence suggests fewer are sufficient
//   - dedupe, split positive/negative, cluster (not free-form), show counts
//
// Source chain (2026-07-01):
//   Tier 1: Amazon reviews via AxessoReviewProvider (axesso_data~amazon-reviews-scraper)
//             — $0.0009/review, no per-run minimum
//             junglee~amazon-reviews-scraper at priority 1 as automatic fallback
//   Tier 1a: provider_cache (Supabase, 14-day TTL) — free on cache hit,
//             eliminating the Apify call for previously-seen ASINs entirely
//   Tier 2: AmazonScraperProvider (HTML scraper, broken since May 2026)
//   Tier 3: TikTok comments (clockworks~free-tiktok-scraper)
//             — runs in PARALLEL with Tier 1, used when Amazon reviews < 5
//
// Cost model (2026-07-01, post-axesso migration):
//   Cold cache (first analysis using an ASIN):  $0.045/ASIN via axesso (50 reviews)
//   Warm cache (any repeat of that ASIN):       $0.00
//   2 ASINs/analysis cold:                      $0.09  (was $1.00 with junglee)
//   Expected average after cache warm-up:       ~$0.01–0.05/analysis

const TOTAL_REVIEW_BUDGET   = 100
const MAX_SOURCE_PRODUCTS   = 2    // up to 2 ASINs; cache makes each free after first fetch
const REVIEW_CACHE_TTL_MS   = 14 * 24 * 60 * 60 * 1000  // 14 days
const COLLECTOR_TIMEOUT_MS  = 70_000
const COLLECTOR_MAX_RETRIES = 1
// Hard ceiling on the whole consumer intelligence stage
const TOTAL_TIMEOUT_MS = 90_000
// TikTok timeout: shorter since it's a fallback/parallel path
const TIKTOK_TIMEOUT_MS = 75_000
// Minimum reviews before we declare Amazon success (skip TikTok fallback)
const AMAZON_SUCCESS_THRESHOLD = 5

// ── Sentiment detection ───────────────────────────────────────────────────────

const PROBLEM_CUES  = /\b(but|however|unfortunately|issue|problem|too (?:big|small|large|strong|expensive|hard|tiny|bitter)|disappoint|hard to|difficult to|hate|complain|wish it|stopped working|broke|defective|smell|taste(?:s)? bad)\b/i
const REQUEST_CUES  = /\b(wish|want(?:ed)?|would be nice|should (?:have|add|include|make)|need(?:s)? to|hope they|please add|if only|i'?d love|would love)\b/i

// Repurchase language: only applied to Amazon reviews.
// TikTok comments are excluded to avoid "subscribe" (meaning YouTube subscribe)
// falsely counting as product subscription repurchase intent.
const REPURCHASE_CUES = /\b(re-?order(?:ed|ing)?|re-?purchas(?:e|ed|ing)|re-?buy(?:ing)?|subscribe|subscription|auto-?ship|ran out|run(?:s)? out|out of (?:it|this|these)|order(?:ed|ing)? again|bought again|buy(?:ing)? again|every month|each month|monthly|repeat (?:customer|buyer|purchase)|been using (?:it|this) for (?:months|years)|stocked up|buying more)\b/i

const NEGATION_TOKENS      = /\b(not|never|no|none|nothing|without|cannot|can'?t|won'?t|wouldn'?t|shouldn'?t|doesn'?t|don'?t|didn'?t|isn'?t|wasn'?t|aren'?t|weren'?t)\b/i
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

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeConsumerIntelligence(
  competitors:     { productId: string; brand: string }[],
  query?:          string,
  tiktokHashtag?:  string,   // from signal_evidence.virality.value.hashtag
): Promise<ConsumerIntelligenceReport | null> {
  const targets = competitors.slice(0, MAX_SOURCE_PRODUCTS)
  if (!targets.length && !tiktokHashtag) return null

  const excludeWords = Array.from(new Set(
    [query ?? '', ...targets.map(t => t.brand)]
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 1),
  ))

  const reviewsPerProduct = Math.floor(TOTAL_REVIEW_BUDGET / Math.max(1, targets.length))

  // ── Tier 1 + 2: Amazon reviews (parallel across competitors) ──────────────
  // Uses getDefaultProviders() which includes junglee (priority 0) →
  // web_wanderer (currently broken, priority 0.5) → AmazonScraper (priority 2).
  // The collector tries providers in priority order and falls back automatically.

  const fetchAmazonReviews = async (target: { productId: string; brand: string }) => {
    const cacheKey = `reviews:v1:${target.productId}`

    // ── Tier 1a: review cache (free on hit, eliminates Apify call) ────────
    const cached = await cacheGet<CollectedReview[]>(cacheKey)
    if (cached && cached.length >= AMAZON_SUCCESS_THRESHOLD) {
      console.log('[ConsumerIntelligence] review cache HIT', {
        productId: target.productId,
        cached:    cached.length,
      })
      return { target, reviews: cached }
    }

    // ── Tier 1: live fetch from provider registry ─────────────────────────
    try {
      const collector = new ReviewCollector(getDefaultProviders(), {
        max_reviews:  reviewsPerProduct,
        timeout_ms:   COLLECTOR_TIMEOUT_MS,
        max_retries:  COLLECTOR_MAX_RETRIES,
      })
      const result = await collector.collect(target.productId)

      // Write to cache — fire-and-forget, never blocks analysis
      if (result.reviews.length >= AMAZON_SUCCESS_THRESHOLD) {
        cacheSet(cacheKey, 'amazon-reviews', result.reviews, REVIEW_CACHE_TTL_MS).catch(() => {})
      }

      return { target, reviews: result.reviews }
    } catch (e: unknown) {
      console.error('[ConsumerIntelligence] Amazon collection failed', {
        productId: target.productId,
        error:     e instanceof Error ? e.message : e,
      })
      return { target, reviews: [] as CollectedReview[] }
    }
  }

  const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))])

  // Run Amazon and TikTok in parallel — TikTok starts immediately so it doesn't
  // add serial latency even when Amazon succeeds. TikTok result is only merged
  // into the analysis when Amazon reviews fall below the success threshold.
  const [amazonSettled, tiktokResult] = await withTimeout(
    Promise.all([
      Promise.all(targets.map(fetchAmazonReviews)),
      tiktokHashtag
        ? collectTikTokComments(tiktokHashtag, TIKTOK_TIMEOUT_MS).catch((e: unknown) => {
            console.error('[ConsumerIntelligence] TikTok collection failed', e instanceof Error ? e.message : e)
            return null
          })
        : Promise.resolve(null),
    ]),
    TOTAL_TIMEOUT_MS,
    [
      targets.map(target => ({ target, reviews: [] as CollectedReview[] })),
      null,
    ],
  )

  // ── Merge Amazon reviews ───────────────────────────────────────────────────
  const productsAnalyzed: SourceProduct[] = []
  const seenIds = new Set<string>()
  const amazonReviews: CollectedReview[] = []

  for (const { target, reviews } of amazonSettled) {
    const fresh = reviews.filter(r => !seenIds.has(r.id))
    fresh.forEach(r => seenIds.add(r.id))
    amazonReviews.push(...fresh)
    if (targets.find(t => t.productId === target.productId)) {
      productsAnalyzed.push({
        productId:        target.productId,
        brand:            target.brand,
        reviewsCollected: fresh.length,
      })
    }
  }

  // ── Decide whether to add TikTok comments ─────────────────────────────────
  const useTikTok = amazonReviews.length < AMAZON_SUCCESS_THRESHOLD && tiktokResult !== null && (tiktokResult?.reviews?.length ?? 0) > 0
  const tiktokReviews  = useTikTok ? (tiktokResult?.reviews ?? []) : []

  // Determine dataSource for provenance tracking
  const dataSource: ConsumerIntelligenceReport['dataSource'] =
    amazonReviews.length > 0 && tiktokReviews.length > 0 ? 'mixed'
    : tiktokReviews.length > 0                            ? 'tiktok-comments'
    : 'amazon-reviews'

  const allReviews = [
    ...amazonReviews,
    // TikTok comments: dedupe by id (already prefixed with 'tiktok-')
    ...tiktokReviews.filter(r => !seenIds.has(r.id)),
  ]

  if (allReviews.length < AMAZON_SUCCESS_THRESHOLD) {
    console.log('[ConsumerIntelligence] too few reviews/comments collected', {
      amazon:  amazonReviews.length,
      tiktok:  tiktokReviews.length,
      total:   allReviews.length,
    })
    return null
  }

  console.log('[ConsumerIntelligence] collection complete', {
    amazon:     amazonReviews.length,
    tiktok:     tiktokReviews.length,
    total:      allReviews.length,
    dataSource,
  })

  // ── Text analysis ──────────────────────────────────────────────────────────
  const cleaned = allReviews.map(r => ({ ...r, body: cleanReviewText(r.body) }))

  // Star-rating pools: only Amazon reviews have meaningful ratings.
  // TikTok comments are all rating=3 (neutral) so they fall out of both pools.
  const positive = cleaned.filter(r => r.rating >= 4)
  const negative = cleaned.filter(r => r.rating <= 2)

  const toSentences = (reviews: CollectedReview[]): SentenceRef[] =>
    reviews.flatMap(r => splitSentences(r.body).map(text => ({ reviewId: r.id, text })))

  const negativeSentences = toSentences(negative)
  const positiveSentences = toSentences(positive)
  const allSentences      = toSentences(cleaned)   // includes TikTok comments
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
  const confidence = computeConfidence(cleaned.length, productsAnalyzed.length + (useTikTok ? 1 : 0))

  // ── Repurchase language: Amazon reviews ONLY ──────────────────────────────
  // TikTok comments excluded — "subscribe" means YouTube channel subscription,
  // not product subscription. Avoids false positives in the Subscription composite.
  const amazonCleaned = cleaned.filter(r => r.source_provider !== 'tiktok-comments')
  const repurchaseReviewCount = amazonCleaned.filter(r => hasUnnegatedMatch(r.body, REPURCHASE_CUES)).length

  // ── TikTok purchase intent (separate from repurchase) ─────────────────────
  const tiktokPurchaseIntent = useTikTok && tiktokResult
    ? {
        mentionedBy: tiktokResult.purchaseIntentCount,
        outOf:       tiktokReviews.length,
        hashtag:     tiktokResult.hashtag,
      }
    : undefined

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
    repurchaseLanguage: { mentionedBy: repurchaseReviewCount, outOf: amazonCleaned.length },
    tiktokPurchaseIntent,
    dataSource,
    confidence,
    generatedAt: new Date().toISOString(),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    pct:   total > 0 ? Math.round((counts[star] / total) * 100) : 0,
  }))
  const positivePct = total > 0 ? Math.round(((counts[4] + counts[5]) / total) * 100) : 0
  const neutralPct  = total > 0 ? Math.round((counts[3]               / total) * 100) : 0
  const negativePct = total > 0 ? Math.round(((counts[1] + counts[2]) / total) * 100) : 0
  return {
    avgRating:    total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
    totalReviews: total,
    distribution,
    positivePct,
    neutralPct,
    negativePct,
  }
}

function computeConfidence(reviewCount: number, sourceCount: number): number {
  const volumeScore = reviewCount >= 50 ? 0.55 : reviewCount >= 20 ? 0.40 : reviewCount >= 10 ? 0.30 : reviewCount >= 5 ? 0.20 : 0
  const sourceScore = sourceCount >= 2 ? 0.25 : sourceCount >= 1 ? 0.15 : 0
  return Math.min(0.80, volumeScore + sourceScore)
}
