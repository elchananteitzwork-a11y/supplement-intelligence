import { ReviewCollector } from '@/lib/review-collector'
import type { CollectedReview, CollectorConfig } from '@/lib/review-collector'

// ── Output ─────────────────────────────────────────────────────────────────

export interface ProductReviews {
  asin:              string
  reviews:           CollectedReview[]
  reviews_collected: number
  providers_used:    string[]
  error?:            string   // set when all providers failed for this ASIN
}

// ── Public entry point ─────────────────────────────────────────────────────
//
// Collects reviews for every ASIN in the list, processing `concurrency`
// products at a time. Failures for individual ASINs are captured — not thrown
// — so the rest of the competitive analysis can proceed with partial data.

export async function collectCompetitorReviews(
  asins:            string[],
  perProductConfig: Partial<CollectorConfig>,
  concurrency:      number,
): Promise<ProductReviews[]> {
  if (!asins.length) return []

  const results: ProductReviews[] = new Array(asins.length)

  for (let start = 0; start < asins.length; start += concurrency) {
    const batch   = asins.slice(start, start + concurrency)
    const settled = await Promise.allSettled(
      batch.map(asin => collectSingle(asin, perProductConfig))
    )

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i]
      if (r.status === 'fulfilled') {
        results[start + i] = r.value
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        console.error(`[MultiCollector] ASIN ${batch[i]} failed:`, msg.slice(0, 200))
        results[start + i] = {
          asin:              batch[i]!,
          reviews:           [],
          reviews_collected: 0,
          providers_used:    [],
          error:             msg,
        }
      }
    }
  }

  const succeeded = results.filter(r => r.reviews_collected > 0).length
  console.log('[MultiCollector] collection complete', {
    total_asins:    asins.length,
    succeeded,
    failed:         asins.length - succeeded,
    total_reviews:  results.reduce((s, r) => s + r.reviews_collected, 0),
  })

  return results
}

// ── Private ────────────────────────────────────────────────────────────────

async function collectSingle(
  asin:   string,
  config: Partial<CollectorConfig>,
): Promise<ProductReviews> {
  const collector = new ReviewCollector(undefined, config)
  const result    = await collector.collect(asin)

  const errorSummary =
    result.errors.length > 0 && result.reviews.length === 0
      ? result.errors.map(e => e.message).join('; ').slice(0, 300)
      : undefined

  console.log(`[MultiCollector] ${asin}`, {
    reviews:        result.reviews.length,
    providers_used: result.providers_used,
    had_errors:     result.errors.length > 0,
  })

  return {
    asin,
    reviews:           result.reviews,
    reviews_collected: result.reviews.length,
    providers_used:    result.providers_used,
    error:             errorSummary,
  }
}
