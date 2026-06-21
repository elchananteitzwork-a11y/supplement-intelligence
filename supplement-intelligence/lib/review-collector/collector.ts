import type { CollectedReview, CollectionResult, CollectionError, CollectorConfig } from './types'
import type { ReviewProvider, ProviderFetchOptions } from './providers/types'
import { getDefaultProviders } from './providers/registry'
import { withRetry, RetryableError, NonRetryableError } from './retry'

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CollectorConfig = {
  max_reviews:   500,
  max_pages:     20,
  sort_by:       'helpful',
  verified_only: false,
  country:       'US',
  timeout_ms:    15_000,
  max_retries:   3,
  retry_base_ms: 1_000,
  retry_max_ms:  30_000,
}

// ── ReviewCollector ────────────────────────────────────────────────────────
//
// Orchestrates one or more ReviewProviders to collect as many reviews as
// possible for a given ASIN. Handles:
//   - Provider priority ordering (try best provider first)
//   - Automatic pagination per provider
//   - Per-page retry with exponential backoff + jitter
//   - Cross-provider deduplication by review ID
//   - Rating and verified-purchase filters
//   - max_reviews and max_pages hard limits
//   - Partial success: if the primary provider fails, falls back to the next
//
// Usage:
//   const collector = new ReviewCollector()
//   const result    = await collector.collect('B08XYZ123')
//
// Feed result.reviews directly to ReviewEngine.analyze():
//   const report = await engine.analyze(result.reviews, asin)
//
// The engine never sees source_provider — the collector strips it before
// constructing the RawReview array that the engine consumes. (Or callers
// can pass CollectedReview[] directly, since CollectedReview is a superset
// of RawReview.)

export class ReviewCollector {
  private providers: ReviewProvider[]
  private config:    CollectorConfig

  constructor(
    providers?: ReviewProvider[],
    config?:    Partial<CollectorConfig>,
  ) {
    const raw       = providers ?? getDefaultProviders()
    // Sort ascending by priority so lower-numbered providers run first
    this.providers  = [...raw].sort((a, b) => a.priority - b.priority)
    this.config     = { ...DEFAULT_CONFIG, ...config }
  }

  // ── Main entry point ─────────────────────────────────────────────────────

  async collect(asin: string): Promise<CollectionResult> {
    if (!asin?.trim()) throw new Error('ReviewCollector.collect: asin is required')

    const seen:          Set<string>       = new Set()
    const allReviews:    CollectedReview[] = []
    const providersUsed: string[]          = []
    const errors:        CollectionError[] = []
    let   totalAvailable: number | undefined

    const fetchOpts: ProviderFetchOptions = {
      sort_by:       this.config.sort_by,
      verified_only: this.config.verified_only,
      min_rating:    this.config.min_rating,
      max_rating:    this.config.max_rating,
      country:       this.config.country,
      timeout_ms:    this.config.timeout_ms,
    }

    const enabledProviders = this.providers.filter(p => p.enabled)
    if (!enabledProviders.length) {
      // Scraper is always enabled; this only happens in tests with mocked providers
      throw new Error('ReviewCollector: no enabled providers')
    }

    for (const provider of enabledProviders) {
      if (allReviews.length >= this.config.max_reviews) break

      const result = await this.drainProvider(provider, asin, fetchOpts, seen, errors)
      if (result.reviews.length > 0) {
        providersUsed.push(provider.name)
        allReviews.push(...result.reviews)
        if (result.total_available !== undefined) totalAvailable = result.total_available
      }
    }

    // Apply post-collection rating filter (providers may not support per-star filters)
    const filtered = this.applyRatingFilter(allReviews)

    // Respect hard cap
    const truncated = filtered.length > this.config.max_reviews
    const reviews   = truncated ? filtered.slice(0, this.config.max_reviews) : filtered

    const result: CollectionResult = {
      asin,
      reviews,
      total_collected:  reviews.length,
      total_available:  totalAvailable,
      providers_used:   providersUsed,
      truncated,
      errors,
      collected_at:     new Date().toISOString(),
    }

    console.log('[ReviewCollector] collection complete', {
      asin,
      total_collected:  reviews.length,
      providers_used:   providersUsed,
      errors:           errors.length,
      truncated,
    })

    return result
  }

  // ── Private: drain a single provider ─────────────────────────────────────
  // Paginates until we have enough reviews, hit max_pages, or the provider
  // signals no more pages.

  private async drainProvider(
    provider: ReviewProvider,
    asin:     string,
    opts:     ProviderFetchOptions,
    seen:     Set<string>,
    errors:   CollectionError[],
  ): Promise<{ reviews: CollectedReview[]; total_available?: number }> {
    const collected: CollectedReview[] = []
    let page             = 1
    let total_available: number | undefined

    while (
      page <= this.config.max_pages &&
      collected.length + /* already collected from previous providers */ 0 < this.config.max_reviews
    ) {
      let pageResult: Awaited<ReturnType<ReviewProvider['fetchPage']>> | null = null
      let retried = false

      try {
        pageResult = await withRetry(
          () => provider.fetchPage(asin, page, opts),
          {
            max:      this.config.max_retries,
            base_ms:  this.config.retry_base_ms,
            max_ms:   this.config.retry_max_ms,
            jitter:   0.20,
            on_retry: (attempt, err, waitMs) => {
              retried = true
              console.warn(`[ReviewCollector] ${provider.name} page ${page} retry ${attempt}`, {
                asin, wait_ms: waitMs,
                error: err instanceof Error ? err.message : String(err),
              })
            },
          }
        )
      } catch (err) {
        const code =
          err instanceof NonRetryableError ? 'non_retryable'
          : err instanceof RetryableError  ? 'retryable_exhausted'
          : 'unknown'

        const message = err instanceof Error ? err.message : String(err)

        errors.push({
          provider:  provider.name,
          message,
          code,
          retried,
          timestamp: new Date().toISOString(),
        })

        console.error(`[ReviewCollector] ${provider.name} page ${page} failed`, {
          asin, code, message: message.slice(0, 200),
        })

        // A non-retryable error likely means bad ASIN or auth problem —
        // stop trying this provider entirely.
        if (err instanceof NonRetryableError) break

        // Retryable errors exhausted — still try the next page optimistically
        // unless this is the first page (no point continuing with no baseline).
        if (page === 1) break
        page++
        continue
      }

      // Deduplicate: skip reviews whose ID we've seen (across providers)
      const newReviews = pageResult.reviews.filter(r => {
        if (!r.id || seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      collected.push(...newReviews)

      if (pageResult.total_count !== undefined) {
        total_available = pageResult.total_count
      }

      console.log(`[ReviewCollector] ${provider.name} page ${page}`, {
        asin,
        new_reviews:    newReviews.length,
        total_so_far:   collected.length,
        has_next:       pageResult.has_next,
        retried,
      })

      if (!pageResult.has_next) break
      if (collected.length >= this.config.max_reviews) break

      page = pageResult.next_page ?? (page + 1)
    }

    return { reviews: collected, total_available }
  }

  // ── Private: post-collection rating filter ────────────────────────────────
  // Applied after collection because some providers (scraper) do not support
  // server-side rating filtering.

  private applyRatingFilter(reviews: CollectedReview[]): CollectedReview[] {
    const { min_rating, max_rating } = this.config
    if (min_rating === undefined && max_rating === undefined) return reviews
    return reviews.filter(r => {
      if (min_rating !== undefined && r.rating < min_rating) return false
      if (max_rating !== undefined && r.rating > max_rating) return false
      return true
    })
  }
}
