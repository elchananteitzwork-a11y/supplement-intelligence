import type { ReviewProvider } from './types'
import { ApifyReviewProvider }   from './apify'
import { RainforestProvider }    from './rainforest'
import { AmazonScraperProvider } from './scraper'

// ── Default provider registry ──────────────────────────────────────────────
//
// Providers are ordered by priority (ascending). The collector tries them in
// that order and stops once it has enough reviews.
//
// To add a new provider:
//   1. Implement ReviewProvider in providers/<name>.ts
//   2. Import and append it here with a unique priority number.
//   3. Nothing else changes.

const DEFAULT_PROVIDERS: ReviewProvider[] = [
  new ApifyReviewProvider(),   // priority 0 — funded and verified, real review text
  new RainforestProvider(),    // priority 1 — API-backed, not currently funded (no RAINFOREST_API_KEY)
  new AmazonScraperProvider(), // priority 2 — best-effort HTML scraper, no API key needed
]

export function getDefaultProviders(): ReviewProvider[] {
  return DEFAULT_PROVIDERS
}

export { ApifyReviewProvider, RainforestProvider, AmazonScraperProvider }
