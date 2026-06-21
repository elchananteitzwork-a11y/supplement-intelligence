// ── Public API of the Competitive Review Engine ───────────────────────────
//
// Typical usage (Keepa-resolved):
//
//   import { CompetitiveReviewEngine } from '@/lib/competitive-review-engine'
//   const engine = new CompetitiveReviewEngine()
//   const report = await engine.analyzeByNode(23675621011, {}, 'Gut Health')
//
// Explicit ASIN list (no Keepa required):
//
//   const report = await engine.analyzeByASINs(
//     ['B001234567', 'B002345678', 'B003456789'],
//     { reviews_per_product: 150, country: 'US' },
//   )
//
// Wiring a custom AI provider:
//
//   import { CompetitiveReviewEngine } from '@/lib/competitive-review-engine'
//   import { setDefaultAIProvider, ClaudeProvider } from '@/lib/review-engine'
//   setDefaultAIProvider(new ClaudeProvider('gpt-key', 'gpt-4o'))
//   const engine = new CompetitiveReviewEngine()

// Core engine
export { CompetitiveReviewEngine } from './engine'

// Domain types (everything a caller needs to type-check inputs and outputs)
export type {
  MarketReport,
  MarketGap,
  WinnerFeature,
  ProductInsight,
  ProductAnalysisResult,
  Competitor,
  CompetitiveEngineOptions,
  GapCategory,
} from './types'

// Intermediate types (for advanced consumers building custom pipelines)
export type { MarketAggregatedData } from './market-aggregator'
export type { MarketScores }         from './market-scorer'
export type { MarketSynthesisResult } from './market-synthesizer'
export type { ProductReviews }       from './multi-collector'

// Utilities (for callers that want to run sub-steps independently)
export { resolveCompetitors, fetchCompetitorASINs, fetchCompetitorDetails } from './competitor-resolver'
export { collectCompetitorReviews }  from './multi-collector'
export { aggregateAcrossProducts }   from './market-aggregator'
export { computeMarketScores }       from './market-scorer'
export { synthesizeMarket }          from './market-synthesizer'
