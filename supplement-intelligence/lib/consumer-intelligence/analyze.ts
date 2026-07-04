import { ReviewCollector }        from '../review-collector/collector'
import { getDefaultProviders }    from '../review-collector/providers/registry'
import type { CollectedReview }   from '../review-collector/types'
import { cleanReviewText, splitSentences } from './clean-text'
import { clusterPhrases }         from './cluster'
import type { SentenceRef }       from './cluster'
import { normalizeAndMerge }      from './normalize'
import { correlateThemes }        from './correlate'
import type { CorrelatedThemeInsight } from './types'
import { detectSymptomSignals }   from './symptoms'
import { collectTikTokComments } from './tiktok-comments'
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
// Dual-corpus collection (2026-07-03):
//   Each ASIN is fetched twice:
//     'helpful' pass  — helpful-sorted, no star filter  → positive corpus
//     'critical' pass — max_rating=3, filterByStar=critical → negative corpus
//   Separate cache keys; 14-day TTL on each.
//   Cost per cold analysis: ~$0.09 (helpful) + ~$0.02-0.04 (critical, fewer reviews)
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
// Critical-corpus temporal filter: exclude reviews older than this to prevent
// closed-gap false positives (complaints already fixed by a product reformulation).
const CRITICAL_REVIEW_MONTHS = 18

// ── Sentiment detection ───────────────────────────────────────────────────────

const PROBLEM_CUES  = /\b(but|however|unfortunately|issue|problem|too (?:big|small|large|strong|expensive|hard|tiny|bitter)|disappoint|hard to|difficult to|hate|complain|wish it|stopped working|broke|defective|smell|taste(?:s)? bad)\b/i
const REQUEST_CUES  = /\b(wish|want(?:ed)?|would be nice|should (?:have|add|include|make)|need(?:s)? to|hope they|please add|if only|i'?d love|would love)\b/i

// Repurchase language: only applied to Amazon reviews.
// TikTok comments are excluded to avoid "subscribe" (meaning YouTube subscribe)
// falsely counting as product subscription repurchase intent.
const REPURCHASE_CUES = /\b(re-?order(?:ed|ing)?|re-?purchas(?:e|ed|ing)|re-?buy(?:ing)?|subscribe|subscription|auto-?ship|ran out|run(?:s)? out|out of (?:it|this|these)|order(?:ed|ing)? again|bought again|buy(?:ing)? again|every month|each month|monthly|repeat (?:customer|buyer|purchase)|been using (?:it|this) for (?:months|years)|stocked up|buying more)\b/i

const NEGATION_TOKENS      = /\b(not|never|no|none|nothing|without|cannot|can'?t|won'?t|wouldn'?t|shouldn'?t|doesn'?t|don'?t|didn'?t|isn'?t|wasn'?t|aren'?t|weren'?t)\b/i
const NEGATION_WINDOW_WORDS = 7

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

  // ── Tier 1 + 2: Amazon reviews — two passes per ASIN ─────────────────────
  // 'helpful' pass: helpful-sorted, no star filter  → positive corpus
  // 'critical' pass: max_rating=3 (filterByStar=critical via Axesso) → negative corpus
  // Separate cache keys so each corpus is independently cached at 14-day TTL.
  // Helpful pass uses the legacy key for backward compatibility with warm caches.

  const fetchReviews = async (
    target: { productId: string; brand: string },
    mode: 'helpful' | 'critical',
  ): Promise<{ target: { productId: string; brand: string }; reviews: CollectedReview[] }> => {
    const cacheKey = mode === 'helpful'
      ? `reviews:v1:${target.productId}`           // backward-compatible — hits existing cache
      : `reviews:v1:critical:${target.productId}`  // new key for critical corpus

    const cached = await cacheGet<CollectedReview[]>(cacheKey)
    if (cached && cached.length >= AMAZON_SUCCESS_THRESHOLD) {
      console.log('[ConsumerIntelligence] review cache HIT', {
        productId: target.productId, mode, cached: cached.length,
      })
      return { target, reviews: cached }
    }

    try {
      const collector = new ReviewCollector(getDefaultProviders(), {
        max_reviews:  reviewsPerProduct,
        timeout_ms:   COLLECTOR_TIMEOUT_MS,
        max_retries:  COLLECTOR_MAX_RETRIES,
        ...(mode === 'critical' ? { max_rating: 3 } : {}),
      })
      const result = await collector.collect(target.productId)

      if (result.reviews.length >= AMAZON_SUCCESS_THRESHOLD) {
        cacheSet(cacheKey, 'amazon-reviews', result.reviews, REVIEW_CACHE_TTL_MS).catch(() => {})
      }

      return { target, reviews: result.reviews }
    } catch (e: unknown) {
      console.error('[ConsumerIntelligence] Amazon collection failed', {
        productId: target.productId, mode, error: e instanceof Error ? e.message : e,
      })
      return { target, reviews: [] as CollectedReview[] }
    }
  }

  const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))])

  // Run both Amazon passes and TikTok in parallel. Helpful and critical passes start
  // simultaneously; TikTok starts immediately so it never adds serial latency.
  // TikTok result is only merged into analysis when Amazon reviews fall below threshold.
  const [helpfulSettled, criticalSettled, tiktokResult] = await withTimeout(
    Promise.all([
      Promise.all(targets.map(t => fetchReviews(t, 'helpful'))),
      Promise.all(targets.map(t => fetchReviews(t, 'critical'))),
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
      targets.map(target => ({ target, reviews: [] as CollectedReview[] })),
      null,
    ],
  )

  // ── Merge Amazon reviews — two separate corpora ───────────────────────────
  // Helpful and critical reviews are deduped within their own corpus independently
  // (a review appearing in both passes is kept in both — they serve different purposes).
  const productsAnalyzed: SourceProduct[] = []
  const seenHelpful  = new Set<string>()
  const seenCritical = new Set<string>()
  const helpfulReviews:  CollectedReview[] = []
  const criticalReviews: CollectedReview[] = []

  for (const { target, reviews } of helpfulSettled) {
    const fresh = reviews.filter(r => !seenHelpful.has(r.id))
    fresh.forEach(r => seenHelpful.add(r.id))
    helpfulReviews.push(...fresh)
    if (targets.find(t => t.productId === target.productId)) {
      productsAnalyzed.push({
        productId:        target.productId,
        brand:            target.brand,
        reviewsCollected: fresh.length,
      })
    }
  }

  for (const { reviews } of criticalSettled) {
    const fresh = reviews.filter(r => !seenCritical.has(r.id))
    fresh.forEach(r => seenCritical.add(r.id))
    criticalReviews.push(...fresh)
  }

  // Combined pool for TikTok-fallback decision and early-exit check (deduped by id).
  const seenIds     = new Set<string>(Array.from(seenHelpful))
  const amazonReviews: CollectedReview[] = [...helpfulReviews]
  for (const r of criticalReviews) {
    if (!seenIds.has(r.id)) { seenIds.add(r.id); amazonReviews.push(r) }
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
    helpful:    helpfulReviews.length,
    critical:   criticalReviews.length,
    tiktok:     tiktokReviews.length,
    total:      allReviews.length,
    dataSource,
  })

  // ── Text analysis ──────────────────────────────────────────────────────────
  // 'cleaned' is built from allReviews (helpful + deduped critical + TikTok) and
  // drives allSentences, featureRequests, mostMentionedProblems — unchanged behavior.
  const cleaned = allReviews.map(r => ({ ...r, body: cleanReviewText(r.body) }))

  // Positive pool: 4-5★ from cleaned. TikTok comments carry rating=3 (neutral)
  // so they naturally fall out of this pool.
  const positive = cleaned.filter(r => r.rating >= 4)

  // Negative pool: dedicated critical corpus (1-3★ from the second collection pass),
  // temporally filtered to the last 18 months to exclude complaints that incumbent
  // products may have already resolved via reformulation or line extension.
  // Fallback chain: recent critical → all critical → 1-2★ from helpful corpus.
  const criticalCutoff = new Date()
  criticalCutoff.setMonth(criticalCutoff.getMonth() - CRITICAL_REVIEW_MONTHS)
  const allCriticalCleaned = criticalReviews.map(r => ({ ...r, body: cleanReviewText(r.body) }))
  const criticalFiltered   = allCriticalCleaned.filter(r => new Date(r.date) >= criticalCutoff)
  const negative =
    criticalFiltered.length   >= AMAZON_SUCCESS_THRESHOLD ? criticalFiltered   :
    allCriticalCleaned.length >= AMAZON_SUCCESS_THRESHOLD ? allCriticalCleaned :
    cleaned.filter(r => r.rating <= 2)   // pre-dual-corpus behavior if critical pass empty

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

  // Semantic normalization (Step 2): normalizeAndMerge calls claude-haiku to
  //   (a) assign canonical labels so synonyms merge before Step 3 correlation
  //   (b) filter out positive-sentiment phrases extracted from critical reviews
  //   (c) filter noise (generic phrases that passed frequency threshold)
  // Graceful fallback: if ANTHROPIC_API_KEY absent or call fails, returns raw clusters.
  const rawNegativeClusters  = clusterPhrases(negativeSentences, { excludeWords })
  const { clusters: normalizedNegativeClusters } = await normalizeAndMerge(
    rawNegativeClusters,
    { category: query ?? 'product', corpusType: 'negative' },
  )

  // Cross-competitor correlation (Step 3): map each cluster's reviewIds back
  // to their source ASINs using the negative corpus. Clusters appearing in
  // reviews from ≥2 distinct ASINs are tagged as category gaps; clusters from
  // only 1 ASIN are tagged as competitor-specific execution issues.
  // Pure function — no I/O, no LLM calls. Always runs regardless of API key.
  const reviewToAsin   = new Map<string, string>(negative.map(r => [r.id, r.asin]))
  const criticalAsins  = new Set(negative.map(r => r.asin))
  const correlatedClusters = correlateThemes(
    normalizedNegativeClusters,
    reviewToAsin,
    criticalAsins.size,
  )

  const toCorrelatedTheme = (c: ReturnType<typeof correlateThemes>[number]): CorrelatedThemeInsight => ({
    label:              c.label,
    mentionedBy:        c.reviewCount,
    outOf:              negative.length,
    exampleQuote:       c.exampleQuote,
    competitorCount:    c.competitorCount,
    competitorCoverage: c.competitorCoverage,
    isCategoryGap:      c.isCategoryGap,
  })

  const categoryGapThemes     = correlatedClusters.filter(c => c.isCategoryGap).map(toCorrelatedTheme)
  const productSpecificThemes = correlatedClusters.filter(c => !c.isCategoryGap).map(toCorrelatedTheme)

  // negativeThemes = full combined list (all competitors) for backward compatibility.
  // UI and scoring consumers that predate Step 3 continue to work unchanged.
  const negativeThemes        = toThemes(normalizedNegativeClusters, negative.length)
  const positiveThemes        = toThemes(clusterPhrases(positiveSentences, { excludeWords }), positive.length)
  const mostMentionedProblems = toThemes(
    clusterPhrases(problemSentences, { minReviewCount: 3, minPoolFraction: 0.03, excludeWords }),
    cleaned.length,
  )
  // Apply minReviewCount against the full cleaned pool (not the request-language
  // sub-pool) so generic 2-review phrases don't pass the 2% threshold when the
  // request-language pool is small (~30-40 reviews vs 200+ total).
  const featureMinCount = Math.max(2, Math.ceil(0.02 * cleaned.length))
  const featureRequests = toThemes(
    clusterPhrases(requestSentences, { minReviewCount: featureMinCount, minPoolFraction: 0, excludeWords }),
    cleaned.length,
  )

  // Step 4: separate feature requests by corpus origin.
  // Critical corpus requests = "wish/want/need" from dissatisfied reviewers (1-3★).
  //   These are prerequisites — the customer is naming something they needed but didn't get.
  //   Contributes to Customer Pain scoring.
  // Positive corpus requests = "would love/wish" from satisfied reviewers (4-5★).
  //   These are enhancement ideas — the customer is already happy and imagining improvements.
  //   Surface as enhancement opportunities; do NOT increase Customer Pain.
  //
  // Pool fractions are calibrated against each corpus independently (not the full cleaned
  // pool) because each corpus is ~50–90 reviews — applying the 2% full-pool threshold
  // would be too permissive (any 1-review phrase passes on a 50-review corpus). We
  // use the same absolute minimum (2 reviews) as a floor in both cases.
  const criticalRequestSentences = negativeSentences.filter(s => hasUnnegatedMatch(s.text, REQUEST_CUES))
  const positiveRequestSentences = positiveSentences.filter(s => hasUnnegatedMatch(s.text, REQUEST_CUES))

  const prereqMinCount   = Math.max(2, Math.ceil(0.03 * negative.length))
  const enhanceMinCount  = Math.max(2, Math.ceil(0.03 * positive.length))

  const prerequisiteFeatureRequests = toThemes(
    clusterPhrases(criticalRequestSentences,  { minReviewCount: prereqMinCount,  minPoolFraction: 0, excludeWords }),
    negative.length,
  )
  const enhancementFeatureRequests = toThemes(
    clusterPhrases(positiveRequestSentences, { minReviewCount: enhanceMinCount, minPoolFraction: 0, excludeWords }),
    positive.length,
  )

  // ── Helpful-corpus-only pool for sentiment, repurchase, symptom detection ──
  // The critical corpus is intentionally biased 1-3★ — including it in sentiment
  // would inflate negativePct far beyond the true market distribution. Derived from
  // helpfulReviews (no TikTok possible in the helpful pass, but filter for safety).
  const amazonCleaned = helpfulReviews
    .map(r => ({ ...r, body: cleanReviewText(r.body) }))
    .filter(r => r.source_provider !== 'tiktok-comments')

  // TikTok comments carry rating=3 (neutral) by construction — including them
  // deflates avgRating and inflates neutralPct. Use helpful-corpus when available.
  const sentimentBreakdown = computeSentimentBreakdown(helpfulReviews.length > 0 ? amazonCleaned : cleaned)
  const confidence = computeConfidence(cleaned.length, productsAnalyzed.length + (useTikTok ? 1 : 0))

  // ── Repurchase language: Amazon reviews ONLY ──────────────────────────────
  // TikTok comments excluded — "subscribe" means YouTube channel subscription,
  // not product subscription. Avoids false positives in the Subscription composite.
  const repurchaseReviewCount = amazonCleaned.filter(r => hasUnnegatedMatch(r.body, REPURCHASE_CUES)).length

  // ── TikTok purchase intent (separate from repurchase) ─────────────────────
  const tiktokPurchaseIntent = useTikTok && tiktokResult
    ? {
        mentionedBy: tiktokResult.purchaseIntentCount,
        outOf:       tiktokReviews.length,
        hashtag:     tiktokResult.hashtag,
      }
    : undefined

  // ── Symptom / adverse-effect detection (Amazon reviews only) ─────────────
  // Runs over the Amazon-only pool (not TikTok) — single-word signals that the
  // n-gram clustering cannot surface. Only emitted when Amazon reviews exist.
  const symptomSignals = amazonReviews.length >= AMAZON_SUCCESS_THRESHOLD
    ? detectSymptomSignals(amazonCleaned)
    : undefined

  return {
    productsAnalyzed,
    totalReviewsCollected: cleaned.length,
    positivePoolSize:      positive.length,
    negativePoolSize:      negative.length,
    negativeRawPoolSize:   allCriticalCleaned.length,
    sentimentBreakdown,
    negativeThemes,
    categoryGapThemes,
    productSpecificThemes,
    mostMentionedProblems,
    featureRequests,
    prerequisiteFeatureRequests,
    enhancementFeatureRequests,
    positiveThemes,
    repurchaseLanguage: { mentionedBy: repurchaseReviewCount, outOf: amazonCleaned.length },
    tiktokPurchaseIntent,
    symptomSignals,
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
  const negativePct = total > 0 ? Math.round(((counts[1] + counts[2]) / total) * 100) : 0
  const neutralPct  = total > 0 ? 100 - positivePct - negativePct : 0
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
