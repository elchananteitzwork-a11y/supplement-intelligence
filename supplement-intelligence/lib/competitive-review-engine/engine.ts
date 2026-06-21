import { ReviewEngine }                  from '@/lib/review-engine'
import type { AIProvider }               from '@/lib/review-engine'
import { getDefaultAIProvider }          from '@/lib/review-engine'
import type { CollectorConfig }          from '@/lib/review-collector'

import type {
  MarketReport,
  ProductInsight,
  ProductAnalysisResult,
  CompetitiveEngineOptions,
  Competitor,
} from './types'

import { resolveCompetitors }            from './competitor-resolver'
import { collectCompetitorReviews }      from './multi-collector'
import { aggregateAcrossProducts }       from './market-aggregator'
import { computeMarketScores }           from './market-scorer'
import { synthesizeMarket }              from './market-synthesizer'

// ── Constants ──────────────────────────────────────────────────────────────

const ANALYSIS_VERSION = '1.0.0'

const DEFAULT_OPTIONS: CompetitiveEngineOptions = {
  max_products:        10,
  reviews_per_product: 100,
  product_concurrency: 3,
  sort_by:             'helpful',
  country:             'US',
  keepa_timeout_ms:    15_000,
}

// ── ReviewEngine config tuned for competitive (smaller chunks, many products) ─

function perProductEngineConfig() {
  return {
    reviews_per_chunk: 25,   // smaller → more chunk diversity per product
    max_chunks:        20,   // cap at 20 chunks = 500 reviews per product
    concurrency:       2,    // lower concurrency since products run in parallel
    min_body_length:   20,
  }
}

// ── CompetitiveReviewEngine ────────────────────────────────────────────────
//
// Orchestrates the full competitive analysis pipeline:
//
//   Keepa bestsellers → ASINs → parallel review collection → per-ASIN ReviewEngine
//   → cross-ASIN aggregation → market scoring → AI synthesis → MarketReport
//
// Two entry points:
//
//   analyzeByNode(nodeId) — resolves ASINs from Keepa, requires KEEPA_API_KEY
//   analyzeByASINs(asins) — explicit list, works without any API keys
//
// The ReviewEngine is instantiated per-product so there is no shared state
// between concurrent analyses.

export class CompetitiveReviewEngine {
  private ai: AIProvider

  constructor(ai?: AIProvider) {
    this.ai = ai ?? getDefaultAIProvider()
  }

  // ── Entry point: Keepa-resolved category ──────────────────────────────────

  async analyzeByNode(
    nodeId:       number,
    options?:     Partial<CompetitiveEngineOptions>,
    categoryName?: string,
  ): Promise<MarketReport> {
    const apiKey = process.env.KEEPA_API_KEY
    if (!apiKey) throw new Error('CompetitiveReviewEngine.analyzeByNode requires KEEPA_API_KEY')

    const opts = { ...DEFAULT_OPTIONS, ...options }

    console.log('[CompetitiveEngine] resolving competitors from Keepa', { nodeId, max: opts.max_products })

    const competitors = await resolveCompetitors(
      nodeId,
      opts.max_products,
      apiKey,
      opts.keepa_timeout_ms,
    )

    if (!competitors.length) {
      throw new Error(`No competitors found for Keepa node ${nodeId}`)
    }

    const asins = competitors.map(c => c.asin)
    return this.analyzeByASINs(asins, opts, { categoryName, categoryNodeId: nodeId, competitors })
  }

  // ── Entry point: explicit ASIN list ───────────────────────────────────────

  async analyzeByASINs(
    asins:   string[],
    options?: Partial<CompetitiveEngineOptions>,
    context?: {
      categoryName?:   string
      categoryNodeId?: number
      competitors?:    Competitor[]
    },
  ): Promise<MarketReport> {
    if (!asins.length) throw new Error('CompetitiveReviewEngine: asins array is empty')

    const opts = { ...DEFAULT_OPTIONS, ...options }

    const effectiveASINs = asins.slice(0, opts.max_products)

    console.log('[CompetitiveEngine] starting competitive analysis', {
      asins:        effectiveASINs.length,
      reviews_each: opts.reviews_per_product,
      concurrency:  opts.product_concurrency,
      provider:     this.ai.name,
    })

    // ── Step 1: Collect reviews for all ASINs in parallel ──────────────────
    const collectorConfig: Partial<CollectorConfig> = {
      max_reviews:   opts.reviews_per_product,
      max_pages:     Math.ceil(opts.reviews_per_product / 10) + 2,
      sort_by:       opts.sort_by,
      country:       opts.country,
    }

    const productReviews = await collectCompetitorReviews(
      effectiveASINs,
      collectorConfig,
      opts.product_concurrency,
    )

    const totalCollected = productReviews.reduce((s, r) => s + r.reviews_collected, 0)
    console.log('[CompetitiveEngine] collection complete', { totalCollected })

    // ── Step 2: Per-product ReviewEngine analysis (parallel, bounded) ───────
    const productResults = await this.analyzeAllProducts(
      productReviews,
      context?.competitors,
      opts.product_concurrency,
    )

    const successCount = productResults.filter(r => r.report !== null).length
    console.log('[CompetitiveEngine] per-product analysis complete', {
      succeeded: successCount,
      failed:    productResults.length - successCount,
    })

    // ── Step 3: Cross-ASIN aggregation ──────────────────────────────────────
    const insights = aggregateAcrossProducts(productResults)

    // ── Step 4: Market scoring ───────────────────────────────────────────────
    const scores = computeMarketScores(productResults, insights)

    console.log('[CompetitiveEngine] market scores', scores)

    // ── Step 5: AI synthesis ─────────────────────────────────────────────────
    const products         = productResults.map(r => r.insight)
    const totalAnalyzed    = productResults.reduce((s, r) => s + r.insight.reviews_collected, 0)

    const synthesis = await synthesizeMarket(
      this.ai,
      scores,
      insights.universal_gaps,
      insights.common_gaps,
      insights.winner_features,
      products,
      context?.categoryName,
      totalAnalyzed,
    )

    // ── Step 6: Assemble MarketReport ─────────────────────────────────────────
    const sortedProducts = [...products].sort(
      (a, b) => b.opportunity_score - a.opportunity_score
    )

    const report: MarketReport = {
      category_name:    context?.categoryName,
      category_node_id: context?.categoryNodeId,
      asins_analyzed:   effectiveASINs,
      products_analyzed: productResults.filter(r => r.report !== null).length,

      products: sortedProducts,

      market_pain_score:        scores.market_pain_score,
      market_opportunity_score: scores.market_opportunity_score,
      gap_score:                scores.gap_score,
      competition_risk:         scores.competition_risk,
      market_confidence:        scores.market_confidence,

      universal_gaps: insights.universal_gaps,
      common_gaps:    insights.common_gaps,
      niche_gaps:     insights.niche_gaps,

      top_market_gaps:          synthesis.top_market_gaps,
      winner_features:          synthesis.winner_features,

      ai_market_recommendation: synthesis.ai_market_recommendation,
      ai_product_brief:         synthesis.ai_product_brief,

      total_reviews_collected:  totalCollected,
      total_reviews_analyzed:   totalAnalyzed,

      analyzed_at:      new Date().toISOString(),
      analysis_version: ANALYSIS_VERSION,
    }

    return report
  }

  // ── Private: per-product analysis loop ────────────────────────────────────

  private async analyzeAllProducts(
    productReviews: Awaited<ReturnType<typeof collectCompetitorReviews>>,
    competitors:    Competitor[] | undefined,
    concurrency:    number,
  ): Promise<ProductAnalysisResult[]> {
    const competitorMap = new Map(
      (competitors ?? []).map(c => [c.asin, c])
    )

    const results: ProductAnalysisResult[] = new Array(productReviews.length)

    for (let start = 0; start < productReviews.length; start += concurrency) {
      const batch   = productReviews.slice(start, start + concurrency)
      const settled = await Promise.allSettled(
        batch.map(pw => this.analyzeOneProduct(pw, competitorMap.get(pw.asin)))
      )

      for (let i = 0; i < settled.length; i++) {
        const r = settled[i]
        if (r.status === 'fulfilled') {
          results[start + i] = r.value
        } else {
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
          const asin = batch[i]!.asin
          console.error(`[CompetitiveEngine] analysis failed for ${asin}:`, msg)
          results[start + i] = {
            asin,
            report:  null,
            insight: buildEmptyInsight(asin, competitorMap.get(asin), msg),
          }
        }
      }
    }

    return results
  }

  private async analyzeOneProduct(
    pw:         { asin: string; reviews: import('@/lib/review-collector').CollectedReview[]; reviews_collected: number; error?: string },
    competitor: Competitor | undefined,
  ): Promise<ProductAnalysisResult> {
    const { asin, reviews, reviews_collected, error: collectionError } = pw

    if (!reviews_collected) {
      return {
        asin,
        report:  null,
        insight: buildEmptyInsight(asin, competitor, collectionError ?? 'No reviews collected'),
      }
    }

    console.log(`[CompetitiveEngine] analyzing ${asin} (${reviews_collected} reviews)`)

    const engine = new ReviewEngine(this.ai, perProductEngineConfig())
    const report = await engine.analyze(reviews, asin)

    console.log(`[CompetitiveEngine] ${asin} done`, {
      pain:  report.pain_score,
      opp:   report.opportunity_score,
      conf:  report.market_confidence,
      gaps:  report.pain_points.length + report.missing_features.length,
    })

    const insight: ProductInsight = {
      asin,
      title:                  competitor?.title,
      brand:                  competitor?.brand,
      bsr:                    competitor?.bsr,
      avg_rating:             report.avg_rating,
      reviews_collected,

      pain_score:             report.pain_score,
      opportunity_score:      report.opportunity_score,
      market_confidence:      report.market_confidence,

      top_complaints:         report.top_complaints,
      top_requested_features: report.top_requested_features,
      overall_sentiment:      report.overall_sentiment,
    }

    return { asin, report, insight }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildEmptyInsight(
  asin:       string,
  competitor: Competitor | undefined,
  error:      string,
): ProductInsight {
  return {
    asin,
    title:                  competitor?.title,
    brand:                  competitor?.brand,
    bsr:                    competitor?.bsr,
    avg_rating:             0,
    reviews_collected:      0,
    pain_score:             0,
    opportunity_score:      0,
    market_confidence:      0,
    top_complaints:         [],
    top_requested_features: [],
    overall_sentiment:      'Mixed',
    error,
  }
}
