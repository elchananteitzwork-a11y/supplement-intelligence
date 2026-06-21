// ── Public API of the Review Intelligence Engine ──────────────────────────
//
// Usage (server-side, e.g. inside a Next.js API route):
//
//   import { ReviewEngine } from '@/lib/review-engine'
//   const engine = new ReviewEngine()
//   const report = await engine.analyze(reviews, asin)
//
// Swap provider (e.g. for GPT):
//
//   import { ReviewEngine, setDefaultAIProvider } from '@/lib/review-engine'
//   setDefaultAIProvider(new GPTProvider())
//
// Custom config:
//
//   const engine = new ReviewEngine(undefined, {
//     reviews_per_chunk: 30,
//     max_chunks: 200,
//     concurrency: 8,
//   })

// Core engine
export { ReviewEngine } from './engine'

// AI layer — expose interface + registry so callers can inject custom providers
export type { AIProvider, AICompletionOptions, AICompletionResult, AIMessage } from './ai/types'
export { ClaudeProvider, getDefaultAIProvider, setDefaultAIProvider } from './ai/registry'

// Types consumers need to construct inputs and read outputs
export type {
  RawReview,
  ReviewReport,
  ReviewEngineConfig,
  ChunkAnalysis,
  ChunkExtraction,
  RankedInsight,
  SentimentDistribution,
  SentimentLabel,
  Severity,
  RatingDistribution,
} from './types'

// Intermediate types (for advanced consumers that build custom pipelines)
export type { AggregatedInsights, ExtractionKey } from './aggregator'
export type { ReviewScores }                       from './scorer'
export type { SynthesisResult }                    from './synthesizer'
export type { ReviewChunk, ChunkPlan }             from './chunker'
