import type { SignalProvider, SignalContext, ProviderSignals, ReviewVelocitySignal } from '../types'

// ── Apify `junglee/amazon-crawler` — real Amazon search results for the
// user's EXACT query, not a category-wide average. ──
//
// Replaces this dimension's previous Rainforest-based implementation
// (lib/signal-engine/providers/reviews.ts, deleted) — Rainforest was never
// funded; Apify already is (APIFY_API_TOKEN already used by the
// Manufacturing Intelligence tab). Reuses the existing review_velocity
// dimension/slot rather than adding a new one.
//
// Actor chosen after live-testing two real candidates (2026-06-24):
//   automation-lab/amazon-scraper ($0.004-0.005/result) — brand field came
//     back EMPTY on every result, even with fetchDetails:true. Disqualified —
//     brand is a hard requirement.
//   junglee/amazon-crawler ($3.00/1,000 results = $0.003/result, cheapest of
//     the two) — brand populated correctly on 15/15 test items (real brands:
//     "Nutricost", "Natrol", "Nature Made", etc.). Chosen.
//
// KNOWN LIMITATION, disclosed rather than worked around: this actor exposes
// no sponsored/ad flag at all (confirmed: field absent on every test item).
// automation-lab does expose isSponsored (confirmed real: 4/5 top results
// sponsored on a real query), but its broken brand field disqualifies it.
// "Meaningful Competitors" here is real-but-unfiltered for sponsored
// placements — a result can be a paid ad and still count, since there's no
// real field to exclude it by. Documented, not silently assumed away.

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/junglee~amazon-crawler/run-sync-get-dataset-items'
const MAX_ITEMS = 20

// A listing needs at least this many reviews to count as a real, established
// competitor rather than a throwaway/new listing with no track record.
const MEANINGFUL_REVIEW_THRESHOLD = 20
const MIN_RESULTS = 5

interface JungleeResult {
  asin?:         string
  title?:        string
  brand?:        string
  price?:        { value?: number; currency?: string }
  stars?:        number
  reviewsCount?: number
}

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

// Higher score = easier to enter. Penalized by how many established (not
// just present) competitors exist, and by how concentrated reviews are in
// the top 3 — a market where 3 incumbents hold most of the reviews is
// harder to break into than one with the same competitor count spread evenly.
function accessibilityScore(meaningfulCount: number, top3Concentration: number | null): number {
  let score = 10
  if (meaningfulCount > 15)     score -= 4
  else if (meaningfulCount > 8) score -= 2
  else if (meaningfulCount > 4) score -= 1

  if (top3Concentration !== null) {
    if (top3Concentration > 0.7)      score -= 3
    else if (top3Concentration > 0.5) score -= 1
  }
  return Math.max(1, Math.min(10, score))
}

export class CompetitionSignalProvider implements SignalProvider {
  readonly name    = 'apify-amazon-search'
  readonly enabled = !!process.env.APIFY_API_TOKEN

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    if (!this.enabled) return null
    const category = ctx.query
    if (!category.trim()) return null

    try {
      // timeout=90 is the actor's OWN max runtime on Apify's side; the
      // AbortSignal below is our client-side ceiling, kept just above the
      // signal engine's 75_000ms shared race timeout (app/api/generate/route.ts)
      // so that shared race — not this abort — is what actually governs.
      const url = `${ACTOR_ENDPOINT}?token=${process.env.APIFY_API_TOKEN}&timeout=90`
      const res = await fetch(url, {
        method:  'POST',
        signal:  AbortSignal.timeout(80_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryOrProductUrls: [{ url: `https://www.amazon.com/s?k=${encodeURIComponent(category)}` }],
          maxItemsPerStartUrl:    MAX_ITEMS,
          maxSearchPagesPerStartUrl: 1,
        }),
      })

      if (!res.ok) {
        console.error('Apify amazon-crawler HTTP error', { status: res.status, category })
        return null
      }

      const items: JungleeResult[] = await res.json()
      if (items.length < MIN_RESULTS) {
        console.log('Apify amazon-crawler: too few results', { category, count: items.length })
        return null
      }

      return this.computeSignals(items)
    } catch (e: unknown) {
      console.error('Apify amazon-crawler provider error', { category, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  private computeSignals(items: JungleeResult[]): ProviderSignals {
    const withReviews = items.filter(
      (r): r is JungleeResult & { reviewsCount: number; brand: string } =>
        typeof r.reviewsCount === 'number' && r.reviewsCount > 0 && !!r.brand?.trim(),
    )

    const reviewCounts   = withReviews.map(r => r.reviewsCount)
    const avgReviewCount = avg(reviewCounts)
    const totalReviews   = reviewCounts.reduce((a, b) => a + b, 0)
    const top3Total      = [...reviewCounts].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0)
    const concentration  = totalReviews > 0 ? Math.round((top3Total / totalReviews) * 100) / 100 : null

    const meaningfulBrands = new Set(
      withReviews
        .filter(r => r.reviewsCount >= MEANINGFUL_REVIEW_THRESHOLD)
        .map(r => r.brand.toLowerCase().trim()),
    )

    const ratings   = withReviews.filter(r => typeof r.stars === 'number').map(r => r.stars!)
    const avgRating = avg(ratings)

    const topCompetitors = [...withReviews]
      .sort((a, b) => b.reviewsCount - a.reviewsCount)
      .slice(0, 10)
      .filter(r => typeof r.stars === 'number' && typeof r.price?.value === 'number' && !!r.asin)
      .map(r => ({
        asin:        r.asin!,
        brand:       r.brand,
        reviewCount: r.reviewsCount,
        rating:      r.stars!,
        price:       r.price!.value!,
      }))

    const score      = accessibilityScore(meaningfulBrands.size, concentration)
    const confidence = withReviews.length >= 10 ? 0.8 : withReviews.length >= 5 ? 0.6 : 0.4

    const review_velocity: ReviewVelocitySignal = {
      score,
      confidence,
      avg_rating:                  avgRating !== null ? avgRating.toFixed(1) : undefined,
      sentiment:                   avgRating !== null ? (avgRating >= 4.2 ? 'Positive' : avgRating >= 3.5 ? 'Mixed' : 'Negative') : undefined,
      meaningful_competitor_count: meaningfulBrands.size,
      avg_review_count:            avgReviewCount !== null ? Math.round(avgReviewCount) : undefined,
      review_concentration_ratio:  concentration ?? undefined,
      top_competitors:             topCompetitors.length ? topCompetitors : undefined,
    }

    console.log('Apify amazon-crawler signals computed', {
      total_results:        items.length,
      with_reviews_and_brand: withReviews.length,
      meaningful_brands:     meaningfulBrands.size,
      avg_review_count:      avgReviewCount !== null ? Math.round(avgReviewCount) : null,
      top3_concentration:    concentration,
      avg_rating:            avgRating !== null ? avgRating.toFixed(1) : null,
      accessibility_score:   score,
      confidence:            Math.round(confidence * 100) + '%',
      cost_estimate_usd:     Math.round(items.length * 0.003 * 1000) / 1000,
    })

    return {
      review_velocity,
      provider:   'apify-amazon-search',
      fetched_at: new Date().toISOString(),
      confidence,
    }
  }
}
