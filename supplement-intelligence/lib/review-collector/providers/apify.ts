import type { ReviewProvider, ProviderPage, ProviderFetchOptions } from './types'
import type { CollectedReview } from '../types'
import { RetryableError, NonRetryableError } from '../retry'

// ── Apify `junglee/amazon-reviews-scraper` — FALLBACK provider (priority 1)
//
// Demoted from primary to fallback on 2026-07-01 in favour of axesso (axesso.ts),
// which is identical in review quality at 11x lower cost ($0.045 vs $0.50/50 reviews).
//
// Kept as fallback because it is the only other provider with a confirmed
// live test against May 2026 Amazon changes. If axesso returns 0 reviews for
// an ASIN (e.g. statusCode 404, temporary block), the collector falls through
// to this provider automatically.
//
// Pricing (BRONZE plan, pay-per-event):
//   actor-start: $0.005 per run
//   review:      $0.005 per review
//   minimum:     $0.50 per run (enforced by Apify even if reviews < 100)
//   Only incurred on axesso miss — expected to be rare.
//
// Input format:
//   productUrls: [{ url: "https://www.amazon.com/dp/{ASIN}" }]
//   maxReviews: N
//   sort: "helpful" | "recent" | "top_critical" | "top_positive"
//
// Output fields used:
//   reviewId, reviewTitle, reviewDescription, ratingScore, date,
//   isVerified, reviewReaction (string → parseInt), variant

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/junglee~amazon-reviews-scraper/run-sync-get-dataset-items'

interface JungleeReview {
  reviewId?:          string
  reviewTitle?:       string
  reviewDescription?: string
  ratingScore?:       number
  date?:              string
  isVerified?:        boolean
  reviewReaction?:    string | number   // helpful votes as string "115" or number
  variant?:           string
  productAsin?:       string
}

export class ApifyReviewProvider implements ReviewProvider {
  readonly name     = 'apify-amazon-reviews'
  readonly enabled  = !!process.env.APIFY_API_TOKEN
  readonly priority = 1

  constructor(private reviewsPerAsin: number = 50) {}

  async fetchPage(
    asin:    string,
    page:    number,
    options: ProviderFetchOptions,
  ): Promise<ProviderPage> {
    if (!this.enabled) throw new NonRetryableError('Apify: APIFY_API_TOKEN not set')
    if (page > 1) return { reviews: [], has_next: false }

    const maxReviews = Math.max(5, Math.min(100, this.reviewsPerAsin))

    const sortMap: Record<string, string> = {
      helpful:    'helpful',
      recent:     'recent',
      top_rated:  'top_positive',
    }
    const sort = sortMap[options.sort_by] ?? 'helpful'

    let res: Response
    try {
      res = await fetch(`${ACTOR_ENDPOINT}?token=${process.env.APIFY_API_TOKEN}`, {
        method:  'POST',
        signal:  AbortSignal.timeout(options.timeout_ms),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productUrls: [{ url: `https://www.amazon.com/dp/${asin}` }],
          maxReviews,
          sort,
        }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new RetryableError(`Apify reviews: fetch failed — ${msg}`)
    }

    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`Apify reviews: HTTP ${res.status}`, res.status)
    }
    if (res.status === 402) {
      throw new NonRetryableError(
        `Apify reviews: HTTP 402 — Apify account has insufficient credits. ` +
        `Check https://console.apify.com/billing. ASIN ${asin} skipped.`,
        402,
      )
    }
    if (res.status === 403) {
      // Apify uses 403 (not 402) for monthly hard-limit exhaustion.
      const body = await res.json().catch(() => null) as { error?: { type?: string; message?: string } } | null
      const isHardLimit = body?.error?.type === 'platform-feature-disabled'
      throw new NonRetryableError(
        isHardLimit
          ? `Apify reviews: Apify monthly usage hard limit exceeded — go to ` +
            `https://console.apify.com/billing to increase the limit. ASIN ${asin} skipped.`
          : `Apify reviews: HTTP 403 for ASIN ${asin}`,
        403,
      )
    }
    if (!res.ok) {
      throw new NonRetryableError(`Apify reviews: HTTP ${res.status} for ASIN ${asin}`, res.status)
    }

    const items: JungleeReview[] = await res.json()

    const reviews: CollectedReview[] = items
      .filter(r => r.reviewId && r.reviewDescription?.trim() && typeof r.ratingScore === 'number')
      .slice(0, this.reviewsPerAsin)
      .map(r => ({
        id:              r.reviewId!,
        asin,
        title:           r.reviewTitle ?? '',
        body:            r.reviewDescription!,
        rating:          Math.min(5, Math.max(1, r.ratingScore!)),
        verified:        !!r.isVerified,
        helpful_votes:   typeof r.reviewReaction === 'string'
                           ? (parseInt(r.reviewReaction, 10) || 0)
                           : (r.reviewReaction ?? 0),
        date:            parseDate(r.date),
        variation:       r.variant || undefined,
        country:         'US',
        source_provider: this.name,
        collected_at:    new Date().toISOString(),
      }))

    console.log('[ApifyReviewProvider] fetched', {
      asin, maxReviews, sort,
      returned: items.length,
      usable:   reviews.length,
    })

    return { reviews, has_next: false, total_count: reviews.length }
  }
}

function parseDate(raw?: string): string {
  if (!raw) return new Date().toISOString()
  const d = new Date(raw)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
