import type { ReviewProvider, ProviderPage, ProviderFetchOptions } from './types'
import type { CollectedReview } from '../types'
import { RetryableError, NonRetryableError } from '../retry'

// ── Apify `axesso_data/amazon-reviews-scraper` — primary Amazon review provider
//
// Replaced junglee~amazon-reviews-scraper as priority-0 provider on 2026-07-01
// after live head-to-head benchmark confirmed identical review text at 11x lower cost:
//
//   Provider  | 50 reviews | Speed  | Verified | Body len
//   ──────────┼────────────┼────────┼──────────┼─────────
//   axesso    | $0.045     | 17.6s  | 100%     | 332 avg
//   junglee   | $0.500     | 22.1s  | 100%     | 332 avg
//
// Pricing (pay-per-event, no per-run minimum):
//   $0.0009/review = $0.90/1,000 reviews
//   50 reviews × 2 ASINs/analysis = $0.09/analysis  (was $1.00 with junglee)
//
// Input:
//   input: [{ asin, domainCode, sortBy, maxPages, reviewerType }]
//   Amazon returns 10 reviews/page; maxPages = ceil(N/10), capped at 10.
//
// Output fields of interest:
//   reviewId        string   — unique review ID
//   text            string   — full review body
//   title           string   — review headline
//   rating          string   — "5.0 out of 5 stars" (parsed to float)
//   date            string   — "Reviewed in the United States on May 26, 2026"
//   verified        boolean  — verified purchase flag
//   numberOfHelpful number   — helpful vote count
//   variationId     string   — ASIN of the specific variant purchased
//   statusCode      number   — 200 (found) or 404 (delisted); 404s filtered out
//
// junglee~amazon-reviews-scraper (apify.ts) remains at priority 1 as fallback.

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/axesso_data~amazon-reviews-scraper/run-sync-get-dataset-items'

interface AxessoItem {
  statusCode?:      number
  reviewId?:        string
  text?:            string
  title?:           string
  rating?:          string   // "5.0 out of 5 stars"
  date?:            string   // "Reviewed in the United States on May 26, 2026"
  verified?:        boolean
  numberOfHelpful?: number
  variationId?:     string
}

export class AxessoReviewProvider implements ReviewProvider {
  readonly name     = 'axesso-amazon-reviews'
  readonly enabled  = !!process.env.APIFY_API_TOKEN
  readonly priority = 0

  constructor(private reviewsPerAsin: number = 50) {}

  async fetchPage(
    asin:    string,
    page:    number,
    options: ProviderFetchOptions,
  ): Promise<ProviderPage> {
    if (!this.enabled) throw new NonRetryableError('Axesso: APIFY_API_TOKEN not set')
    if (page > 1) return { reviews: [], has_next: false }

    const maxReviews = Math.max(5, Math.min(100, this.reviewsPerAsin))
    const maxPages   = Math.min(10, Math.ceil(maxReviews / 10))

    const sortMap: Record<string, string> = {
      helpful:   'helpful',
      recent:    'recent',
      top_rated: 'helpful',
    }
    const sortBy = sortMap[options.sort_by] ?? 'helpful'

    let res: Response
    try {
      res = await fetch(`${ACTOR_ENDPOINT}?token=${process.env.APIFY_API_TOKEN}`, {
        method:  'POST',
        signal:  AbortSignal.timeout(options.timeout_ms),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: [{
            asin,
            domainCode:   'com',
            sortBy,
            maxPages,
            reviewerType: 'all_reviews',
          }],
        }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new RetryableError(`Axesso reviews: fetch failed — ${msg}`)
    }

    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`Axesso reviews: HTTP ${res.status}`, res.status)
    }
    if (!res.ok) {
      throw new NonRetryableError(`Axesso reviews: HTTP ${res.status} for ASIN ${asin}`, res.status)
    }

    const items: AxessoItem[] = await res.json()

    const reviews: CollectedReview[] = items
      .filter(r => r.statusCode !== 404 && r.reviewId && r.text?.trim())
      .slice(0, maxReviews)
      .map(r => ({
        id:              r.reviewId!,
        asin,
        title:           r.title ?? '',
        body:            r.text!,
        rating:          parseRating(r.rating),
        verified:        !!r.verified,
        helpful_votes:   r.numberOfHelpful ?? 0,
        date:            parseDate(r.date),
        variation:       r.variationId || undefined,
        country:         'US',
        source_provider: this.name,
        collected_at:    new Date().toISOString(),
      }))

    console.log('[AxessoReviewProvider] fetched', {
      asin, maxReviews, maxPages, sortBy,
      returned: items.length,
      usable:   reviews.length,
    })

    return { reviews, has_next: false, total_count: reviews.length }
  }
}

function parseRating(raw?: string): number {
  if (!raw) return 3
  const match = raw.match(/^(\d+(?:\.\d+)?)/)
  return match ? Math.min(5, Math.max(1, parseFloat(match[1]))) : 3
}

function parseDate(raw?: string): string {
  if (!raw) return new Date().toISOString()
  const match = raw.match(/on\s+(.+)$/)
  if (!match) return new Date().toISOString()
  const d = new Date(match[1])
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
