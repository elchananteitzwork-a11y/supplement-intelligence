import type { SignalProvider, ProviderSignals, ReviewVelocitySignal } from '../types'

// ── Rainforest Amazon Search provider — real review count / rating / brand
// concentration for the user's EXACT query, not a category-wide average. ──
//
// Distinct from Keepa's `competition` signal (sellers-per-listing on the
// category's overall top-10 bestsellers): this hits Rainforest's `type=search`
// endpoint with the actual query text and reads `rating` / `ratings_total` /
// `brand` straight off real organic Amazon search results. No LLM step.
//
// Required: RAINFOREST_API_KEY in environment. Same account/key already used
// by lib/review-collector for deep review text analysis — this provider is
// deliberately lighter-weight (one search call, no per-product review
// pagination) because review count + rating is all this dimension needs.

const RAINFOREST_ENDPOINT = 'https://api.rainforestapi.com/request'

// A listing needs at least this many ratings to count as a real, established
// competitor rather than a throwaway/new listing with no track record.
const MEANINGFUL_REVIEW_THRESHOLD = 20
const MIN_ORGANIC_RESULTS = 5

interface RainforestSearchResult {
  asin?:          string
  title?:         string
  brand?:         string
  rating?:        number
  ratings_total?: number
  sponsored?:     boolean
}

interface RainforestSearchResponse {
  request_info?:   { success?: boolean }
  search_results?: RainforestSearchResult[]
}

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

// Higher score = easier to enter. Penalized by how many established (not just
// present) competitors exist, and by how concentrated reviews are in the #1 result —
// a market where one incumbent holds most of the reviews is harder to break into
// than one with the same competitor count spread evenly.
function accessibilityScore(meaningfulCount: number, concentrationRatio: number | null): number {
  let score = 10
  if (meaningfulCount > 15)     score -= 4
  else if (meaningfulCount > 8) score -= 2
  else if (meaningfulCount > 4) score -= 1

  if (concentrationRatio !== null) {
    if (concentrationRatio > 0.5)      score -= 3
    else if (concentrationRatio > 0.3) score -= 1
  }
  return Math.max(1, Math.min(10, score))
}

export class ReviewSignalProvider implements SignalProvider {
  readonly name    = 'rainforest-search'
  readonly enabled = !!process.env.RAINFOREST_API_KEY

  async fetch(category: string): Promise<ProviderSignals | null> {
    if (!this.enabled) return null

    try {
      const params = new URLSearchParams({
        api_key:       process.env.RAINFOREST_API_KEY!,
        type:          'search',
        amazon_domain: 'amazon.com',
        search_term:   category,
      })
      const res = await fetch(`${RAINFOREST_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) {
        console.error('Rainforest search error', { status: res.status, category })
        return null
      }

      const data: RainforestSearchResponse = await res.json()
      const organic = (data.search_results ?? []).filter(r => !r.sponsored)
      if (organic.length < MIN_ORGANIC_RESULTS) {
        console.log('Rainforest search: too few organic results', { category, count: organic.length })
        return null
      }

      return this.computeSignals(organic.slice(0, 15))
    } catch (e: unknown) {
      console.error('Rainforest search provider error', { category, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  private computeSignals(results: RainforestSearchResult[]): ProviderSignals {
    const withReviews   = results.filter(r => typeof r.ratings_total === 'number' && r.ratings_total! > 0)
    const reviewCounts  = withReviews.map(r => r.ratings_total!)
    const ratings       = withReviews.filter(r => typeof r.rating === 'number').map(r => r.rating!)

    const avgReviewCount = avg(reviewCounts)
    const totalReviews   = reviewCounts.reduce((a, b) => a + b, 0)
    const topReviewCount = reviewCounts.length ? Math.max(...reviewCounts) : 0
    const concentration  = totalReviews > 0 ? Math.round((topReviewCount / totalReviews) * 100) / 100 : null

    const meaningfulBrands = new Set(
      withReviews
        .filter(r => r.ratings_total! >= MEANINGFUL_REVIEW_THRESHOLD && r.brand)
        .map(r => r.brand!.toLowerCase().trim()),
    )

    const avgRating = avg(ratings)
    const score     = accessibilityScore(meaningfulBrands.size, concentration)
    const confidence = withReviews.length >= 8 ? 0.75 : withReviews.length >= 5 ? 0.6 : 0.45

    const review_velocity: ReviewVelocitySignal = {
      score,
      confidence,
      avg_rating:                   avgRating !== null ? avgRating.toFixed(1) : undefined,
      sentiment:                    avgRating !== null ? (avgRating >= 4.2 ? 'Positive' : avgRating >= 3.5 ? 'Mixed' : 'Negative') : undefined,
      meaningful_competitor_count:  meaningfulBrands.size,
      avg_review_count:             avgReviewCount !== null ? Math.round(avgReviewCount) : undefined,
      review_concentration_ratio:   concentration ?? undefined,
    }

    console.log('Rainforest search signals computed', {
      organic_results:    results.length,
      with_reviews:        withReviews.length,
      meaningful_brands:   meaningfulBrands.size,
      avg_review_count:    avgReviewCount !== null ? Math.round(avgReviewCount) : null,
      concentration_ratio: concentration,
      avg_rating:          avgRating !== null ? avgRating.toFixed(1) : null,
      accessibility_score: score,
      confidence:          Math.round(confidence * 100) + '%',
    })

    return {
      review_velocity,
      provider:   'rainforest-search',
      fetched_at: new Date().toISOString(),
      confidence,
    }
  }
}
