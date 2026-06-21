// ── Public API of the Review Collector ────────────────────────────────────
//
// Typical usage:
//
//   import { ReviewCollector } from '@/lib/review-collector'
//   const collector = new ReviewCollector()
//   const result    = await collector.collect('B08XYZ123')
//
//   // Feed straight into the Review Intelligence Engine:
//   import { ReviewEngine } from '@/lib/review-engine'
//   const engine = new ReviewEngine()
//   const report = await engine.analyze(result.reviews, result.asin)
//
// Custom config:
//   const collector = new ReviewCollector(undefined, {
//     max_reviews:   1000,
//     max_pages:     40,
//     sort_by:       'recent',
//     verified_only: true,
//     country:       'GB',
//   })
//
// Custom provider set (e.g. only Rainforest, no scraper):
//   import { RainforestProvider } from '@/lib/review-collector'
//   const collector = new ReviewCollector([new RainforestProvider()])

// Core
export { ReviewCollector } from './collector'

// Providers
export { RainforestProvider, AmazonScraperProvider } from './providers/registry'
export { getDefaultProviders }                        from './providers/registry'
export type { ReviewProvider, ProviderPage, ProviderFetchOptions } from './providers/types'

// Error types (for callers that want to inspect retry behaviour)
export { RetryableError, NonRetryableError, withRetry, sleep } from './retry'
export { RateLimiter } from './rate-limiter'

// Domain types
export type {
  CollectedReview,
  CollectionResult,
  CollectionError,
  CollectorConfig,
} from './types'
