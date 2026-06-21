import type { RawReview, ReviewReport, ReviewEngineConfig, ChunkAnalysis } from './types'
import type { AIProvider } from './ai/types'
import { getDefaultAIProvider } from './ai/registry'
import { chunkReviews, type ReviewChunk } from './chunker'
import { analyzeChunk } from './analyzer'
import { aggregateChunks } from './aggregator'
import { computeScores } from './scorer'
import { synthesize } from './synthesizer'

// ── Constants ──────────────────────────────────────────────────────────────

const ANALYSIS_VERSION = '1.0.0'

const DEFAULT_CONFIG: ReviewEngineConfig = {
  reviews_per_chunk:  50,
  max_chunks:         100,
  concurrency:        5,
  chunk_timeout_ms:   30_000,
  min_body_length:    20,
  sampling_strategy:  'stratified',
}

// ── ReviewEngine ───────────────────────────────────────────────────────────
//
// Orchestrates the full pipeline:
//   raw reviews → chunks → parallel AI analysis → aggregation → scoring → synthesis
//
// To swap the AI provider:
//   new ReviewEngine(new GPTProvider())      // or GeminiProvider, etc.
//
// To tune for large batches:
//   new ReviewEngine(undefined, { concurrency: 10, max_chunks: 200 })

export class ReviewEngine {
  private ai:     AIProvider
  private config: ReviewEngineConfig

  constructor(
    ai?:    AIProvider,
    config?: Partial<ReviewEngineConfig>,
  ) {
    this.ai     = ai ?? getDefaultAIProvider()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ── Main entry point ─────────────────────────────────────────────────────

  async analyze(reviews: RawReview[], asin?: string): Promise<ReviewReport> {
    if (!reviews.length) throw new Error('ReviewEngine.analyze: reviews array is empty')

    // ── Step 1: Chunk (and optionally sample) ──
    const { chunks, sampling_used, analyzed_count } = chunkReviews(reviews, this.config)
    if (!chunks.length) {
      throw new Error(
        `ReviewEngine: no reviews passed the minimum body-length filter (min: ${this.config.min_body_length} chars)`
      )
    }

    console.log('[ReviewEngine] starting analysis', {
      total_input:     reviews.length,
      to_analyze:      analyzed_count,
      chunks:          chunks.length,
      sampling_used,
      concurrency:     this.config.concurrency,
      provider:        this.ai.name,
    })

    // ── Step 2: Parallel chunk analysis (with concurrency cap) ──
    const chunkAnalyses = await this.analyzeChunksConcurrently(chunks)
    if (!chunkAnalyses.length) {
      throw new Error('ReviewEngine: all chunk analyses failed — check AI provider connectivity')
    }

    const successRate = chunkAnalyses.length / chunks.length
    console.log('[ReviewEngine] chunks completed', {
      succeeded: chunkAnalyses.length,
      total:     chunks.length,
      success_rate: `${Math.round(successRate * 100)}%`,
    })

    // ── Step 3: Aggregate raw chunk extractions → ranked insights ──
    const insights = aggregateChunks(chunkAnalyses)

    // ── Step 4: Compute Pain / Opportunity / Confidence scores ──
    const scores = computeScores(insights, chunkAnalyses, reviews.length)

    console.log('[ReviewEngine] scores', scores)

    // ── Step 5: Final AI synthesis pass ──
    const synthesis = await synthesize(this.ai, insights, scores, reviews.length)

    // ── Step 6: Assemble final report ──
    const report: ReviewReport = {
      // Input meta
      product_asin:           asin,
      total_reviews_input:    reviews.length,
      total_reviews_analyzed: analyzed_count,
      chunk_count:            chunkAnalyses.length,
      sampling_used,

      // Scores
      pain_score:        scores.pain_score,
      opportunity_score: scores.opportunity_score,
      market_confidence: scores.market_confidence,

      // AI-curated top items
      top_complaints:         synthesis.top_complaints,
      top_requested_features: synthesis.top_requested_features,

      // Full ranked breakdowns
      pain_points:            insights.pain_points,
      missing_features:       insights.missing_features,
      requested_improvements: insights.requested_improvements,
      quality_issues:         insights.quality_issues,
      packaging_issues:       insights.packaging_issues,
      shipping_issues:        insights.shipping_issues,
      price_complaints:       insights.price_complaints,
      positive_themes:        insights.positive_themes,

      // Sentiment
      avg_rating:             insights.avg_rating,
      sentiment_distribution: insights.sentiment_distribution,
      overall_sentiment:      insights.overall_sentiment,

      // AI synthesis
      ai_recommendation: synthesis.ai_recommendation,

      // Meta
      analyzed_at:      new Date().toISOString(),
      analysis_version: ANALYSIS_VERSION,
    }

    return report
  }

  // ── Private: bounded parallel chunk processing ────────────────────────────

  private async analyzeChunksConcurrently(
    chunks: ReviewChunk[],
  ): Promise<ChunkAnalysis[]> {
    const results: (ChunkAnalysis | null)[] = new Array(chunks.length).fill(null)
    let completed = 0

    for (let start = 0; start < chunks.length; start += this.config.concurrency) {
      const batch = chunks.slice(start, start + this.config.concurrency)

      const settled = await Promise.allSettled(
        batch.map(chunk => analyzeChunk(this.ai, chunk, this.config.chunk_timeout_ms))
      )

      for (let i = 0; i < settled.length; i++) {
        const r = settled[i]
        if (r.status === 'fulfilled') {
          results[start + i] = r.value
        } else {
          console.error(`[ReviewEngine] chunk ${start + i} failed:`, r.reason)
        }
        completed++
        this.config.on_progress?.(completed, chunks.length)
      }
    }

    return results.filter((r): r is ChunkAnalysis => r !== null)
  }
}
