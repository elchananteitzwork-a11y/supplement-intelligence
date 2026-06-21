import type { CollectedReview } from '../types'

// ── Provider contract ──────────────────────────────────────────────────────
//
// Every review source implements ReviewProvider.
// The ReviewCollector calls fetchPage() in a loop; providers handle the
// format, auth, and transport for their own API or HTML source.
//
// Adding a new provider:
//   1. Implement ReviewProvider in providers/<name>.ts
//   2. Import and register it in providers/registry.ts
//   3. Nothing else changes — the collector picks it up automatically.

export interface ProviderPage {
  reviews:      CollectedReview[]
  has_next:     boolean
  next_page?:   number    // next page number (1-indexed)
  total_count?: number    // total reviews available on the product (if known)
}

export interface ProviderFetchOptions {
  sort_by:       'helpful' | 'recent' | 'top_rated'
  verified_only: boolean
  min_rating?:   number   // 1–5 inclusive filter
  max_rating?:   number   // 1–5 inclusive filter
  country:       string   // ISO 3166-1 alpha-2 marketplace code
  timeout_ms:    number   // per-request network timeout
}

export interface ReviewProvider {
  readonly name:     string
  readonly enabled:  boolean  // false when required env vars are absent
  readonly priority: number   // lower number = higher priority (tried first)

  fetchPage(
    asin:    string,
    page:    number,
    options: ProviderFetchOptions,
  ): Promise<ProviderPage>
}
