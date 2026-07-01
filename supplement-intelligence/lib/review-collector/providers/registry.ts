import type { ReviewProvider } from './types'
import { AxessoReviewProvider }  from './axesso'
import { ApifyReviewProvider }   from './apify'
import { RainforestProvider }    from './rainforest'
import { AmazonScraperProvider } from './scraper'

// ── Default provider registry ──────────────────────────────────────────────
//
// Providers are ordered by priority (ascending). The collector tries them in
// that order and stops once it has enough reviews.
//
// Priority chain (as of 2026-07-01):
//   0 — AxessoReviewProvider  axesso_data/amazon-reviews-scraper
//         $0.0009/review, confirmed working, 17.6s for 50 reviews
//   1 — ApifyReviewProvider   junglee/amazon-reviews-scraper
//         $0.50/run minimum, confirmed working, 22.1s for 50 reviews
//         fallback for ASINs where axesso returns 0 reviews (delisted, 404)
//   2 — RainforestProvider    not currently funded (no RAINFOREST_API_KEY)
//   3 — AmazonScraperProvider HTML scraper — permanently broken since
//         Amazon's May 2026 change blocking unauthenticated review access
//
// To add a new provider:
//   1. Implement ReviewProvider in providers/<name>.ts
//   2. Import and append it here with a unique priority number.
//   3. Nothing else changes.

const DEFAULT_PROVIDERS: ReviewProvider[] = [
  new AxessoReviewProvider(),   // priority 0 — primary, cheapest confirmed provider
  new ApifyReviewProvider(),    // priority 1 — junglee fallback
  new RainforestProvider(),     // priority 2 — unfunded
  new AmazonScraperProvider(),  // priority 3 — broken (May 2026 Amazon changes)
]

export function getDefaultProviders(): ReviewProvider[] {
  return DEFAULT_PROVIDERS
}

export { AxessoReviewProvider, ApifyReviewProvider, RainforestProvider, AmazonScraperProvider }
