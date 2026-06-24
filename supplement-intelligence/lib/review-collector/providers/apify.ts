import type { ReviewProvider, ProviderPage, ProviderFetchOptions } from './types'
import type { CollectedReview } from '../types'
import { RetryableError, NonRetryableError } from '../retry'

// ── Apify `web_wanderer/amazon-reviews-extractor` — real review TEXT ──────
//
// Distinct from providers/competition.ts (search-result metadata only, no
// review bodies) and from Keepa (confirmed live, 2026-06-24: no review-text
// field exists anywhere in its product schema — rating/count only).
//
// Chosen after comparing real Apify billing schemas (not marketing pages)
// for two candidates:
//   junglee/amazon-reviews-scraper      — $0.50 MINIMUM charge per run (binds
//     at any review count below ~125-170 reviews depending on tier)
//   web_wanderer/amazon-reviews-extractor — $0.02 minimum, ~$0.001/review.
//     Confirmed via a real billed run: 100 reviews = $0.10002 (FREE tier).
// web_wanderer is ~5x cheaper for our target volume. Live-tested: returns
// real reviewText, verifiedPurchase, rating, helpfulVoteCount, reviewDate —
// 100/100 reviews returned on a real ASIN.
//
// KNOWN DATA QUALITY ISSUE, confirmed live and handled in consumer-intelligence/
// clean-text.ts: this actor's reviewText sometimes contains a duplicated
// leading fragment (Amazon's truncated "...read more" preview gets
// concatenated with the full expansion). Must be cleaned before counting —
// otherwise themes get double-counted within a single review.
//
// This provider intentionally ignores the actor's bundled `reviewsAISummary`
// and `aspects` fields (Amazon's own AI-generated summary, mirrored by the
// actor) — using them would violate the "no LLM assumptions presented as
// facts" requirement. Only raw per-review fields are read.

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/web_wanderer~amazon-reviews-extractor/run-sync-get-dataset-items'

interface WebWandererReview {
  reviewId?:          string
  productAsin?:       string
  rating?:            number
  verifiedPurchase?:  boolean
  reviewTitle?:       string
  reviewText?:        string
  reviewDate?:        string
  helpfulVoteCount?:  number
}

export class ApifyReviewProvider implements ReviewProvider {
  readonly name     = 'apify-amazon-reviews'
  readonly enabled  = !!process.env.APIFY_API_TOKEN
  readonly priority = 0   // funded and verified — tried before Rainforest (unfunded) and the raw scraper (best-effort)

  // Reviews requested per ASIN per call. ~10 reviews/page, capped by the
  // actor at 10 pages (100 reviews) per product. Set via constructor so
  // callers can budget total cost across multiple competitor ASINs.
  constructor(private reviewsPerAsin: number = 50) {}

  // The actor handles its own pagination internally in one synchronous
  // call — there is no real per-page HTTP loop to control. So: page 1 does
  // the full fetch and reports has_next: false; later pages are never
  // reached because the collector stops once has_next is false.
  async fetchPage(
    asin:    string,
    page:    number,
    options: ProviderFetchOptions,
  ): Promise<ProviderPage> {
    if (!this.enabled) throw new NonRetryableError('Apify: APIFY_API_TOKEN not set')
    if (page > 1) return { reviews: [], has_next: false }

    const pages = Math.max(1, Math.min(10, Math.ceil(this.reviewsPerAsin / 10)))
    const sort  = options.sort_by === 'recent' ? 'recent' : 'helpful'

    let res: Response
    try {
      res = await fetch(`${ACTOR_ENDPOINT}?token=${process.env.APIFY_API_TOKEN}`, {
        method:  'POST',
        signal:  AbortSignal.timeout(options.timeout_ms),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products:      [asin],
          limit:         pages,
          sort,
          personal_data: false,
        }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new RetryableError(`Apify reviews: fetch failed — ${msg}`)
    }

    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`Apify reviews: HTTP ${res.status}`, res.status)
    }
    if (!res.ok) {
      throw new NonRetryableError(`Apify reviews: HTTP ${res.status} for ASIN ${asin}`, res.status)
    }

    const items: WebWandererReview[] = await res.json()
    const reviews: CollectedReview[] = items
      .filter(r => r.reviewId && r.reviewText?.trim() && typeof r.rating === 'number')
      .slice(0, this.reviewsPerAsin)
      .map(r => ({
        id:              r.reviewId!,
        asin,
        title:           r.reviewTitle ?? '',
        body:            r.reviewText!,
        rating:          r.rating!,
        verified:        !!r.verifiedPurchase,
        helpful_votes:   r.helpfulVoteCount ?? 0,
        date:            parseDate(r.reviewDate),
        source_provider: this.name,
        collected_at:    new Date().toISOString(),
      }))

    console.log('[ApifyReviewProvider] fetched', { asin, requested_pages: pages, returned: items.length, usable: reviews.length })

    return { reviews, has_next: false, total_count: reviews.length }
  }
}

function parseDate(raw?: string): string {
  if (!raw) return new Date().toISOString()
  const d = new Date(raw)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
