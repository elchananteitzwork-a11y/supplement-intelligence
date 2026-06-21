import type { ReviewProvider } from './types'
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
  new RainforestProvider(),    // priority 1 — API-backed, most reliable
  new AmazonScraperProvider(), // priority 2 — best-effort HTML scraper
]

export function getDefaultProviders(): ReviewProvider[] {
  return DEFAULT_PROVIDERS
}

export { RainforestProvider, AmazonScraperProvider }
