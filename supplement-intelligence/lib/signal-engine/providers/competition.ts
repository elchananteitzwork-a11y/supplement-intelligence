import type { SignalProvider, SignalContext, ProviderSignals, ReviewVelocitySignal } from '../types'
import { cacheGet, cacheSet } from '../../provider-cache'
import { scanForClaimRiskLanguage } from '../../regulatory-engine/claim-risk'

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
const MAX_ITEMS = 10
const SERP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days — top-10 competitive landscape stable week-to-week

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
  // CONFIRMED VIA LIVE CALL 2026-06-26 (3 real items, "magnesium glycinate"
  // query): both real and consistently present. breadCrumbs is a single
  // string path ("Health & Household > ... > Magnesium"), not an array.
  // No separate position/rank field exists on this actor — real
  // search-result order is the array index itself (see computeSignals).
  breadCrumbs?: string
  features?:    string[]
  // CONFIRMED VIA LIVE CALL 2026-06-27: real and present on every result —
  // a structured "Important information" block mirroring Amazon's own
  // product-detail accordion (Safety Information, Indications, Ingredients,
  // Directions, Legal Disclaimer). The "Ingredients" item's text often
  // contains the real per-serving dose, e.g. "Magnesium (as magnesium
  // glycinate) 120 mg" — grounds formula comparisons in what a real
  // competitor's label actually says instead of AI general knowledge.
  importantInformation?: { items?: { title?: string; text?: string }[] }
  description?: string   // A+ content / product description block (not always present)
}

// Sub-item titles in importantInformation that reliably contain ingredient text.
// Checked case-insensitively; ordered by specificity (most specific first).
const INGREDIENT_TITLE_PATTERNS = [
  /^ingredients?$/i,
  /^active\s+ingredients?$/i,
  /^supplement\s+facts?$/i,
  /^ingredient\s+list$/i,
  /^formula$/i,
]

// Dose-unit regex: matches "120 mg", "1000mcg", "10 IU", "50%", etc.
// Used to identify feature bullets that contain actual nutritional content.
const DOSE_PATTERN = /\d+\s*(mg|mcg|µg|IU|g\b|%\s*(?:DV|Daily Value))/i

function extractIngredientsLabel(r: JungleeResult): string | undefined {
  const items = r.importantInformation?.items ?? []

  // Pass 1: check importantInformation for known ingredient-title patterns.
  // Most specific titles first — stops at the first match.
  for (const pattern of INGREDIENT_TITLE_PATTERNS) {
    const match = items.find(it => it.title && pattern.test(it.title))
    const text  = match?.text?.trim()
    if (text && text.length > 0) return text
  }

  // Pass 2: any importantInformation item whose text contains dose units —
  // catches non-standard titles like "Product Formulation", "What's Inside".
  // Excluded: "Directions" and "Safety Information" titles, which often contain
  // dose-like text ("Do not exceed 400 mg/day") but are not ingredient lists.
  const EXCLUDE_TITLES = /^(directions?|safety\s+info|warnings?|disclaimer|legal)/i
  for (const it of items) {
    if (it.title && EXCLUDE_TITLES.test(it.title)) continue
    const text = it.text?.trim() ?? ''
    if (text.length > 20 && DOSE_PATTERN.test(text)) return text
  }

  // Pass 3: product feature bullets — supplement bullets often list key actives
  // ("Contains 400mg Magnesium Glycinate per serving"). Only use if at least 2
  // bullets independently match dose units, to avoid grabbing a random sentence.
  if (r.features?.length) {
    const doseBullets = r.features.filter(f => DOSE_PATTERN.test(f))
    if (doseBullets.length >= 2) return doseBullets.join(' | ')
  }

  return undefined
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
  if (meaningfulCount > 30)      score -= 5
  else if (meaningfulCount > 15) score -= 3
  else if (meaningfulCount > 8)  score -= 2
  else if (meaningfulCount > 4)  score -= 1

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

    // ── SERP cache (7-day TTL, saves $0.03/hit at 10 results) ───────────
    const cacheKey = `serp:v1:${category.toLowerCase().trim()}`
    const cached = await cacheGet<ProviderSignals>(cacheKey)
    if (cached) {
      console.log('[Competition] SERP cache HIT', { category })
      return cached
    }

    try {
      // timeout=90 is the actor's OWN max runtime on Apify's side; the
      // AbortSignal below is our client-side ceiling, kept just above the
      // signal engine's 75_000ms shared race timeout (app/api/generate/route.ts)
      // so that shared race — not this abort — is what actually governs.
      const url = `${ACTOR_ENDPOINT}?timeout=90`
      const res = await fetch(url, {
        method:  'POST',
        signal:  AbortSignal.timeout(80_000),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`,
        },
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

      const result = this.computeSignals(items)
      cacheSet(cacheKey, 'junglee-crawler', result, SERP_CACHE_TTL_MS).catch(() => {})
      return result
    } catch (e: unknown) {
      console.error('Apify amazon-crawler provider error', { category, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  private computeSignals(items: JungleeResult[]): ProviderSignals {
    // Real search-result rank, captured BEFORE any filtering/re-sorting —
    // items[] is already in the actor's real Amazon search-result order
    // (confirmed via live call: no separate position/rank field exists),
    // so the 1-indexed array position here is the real rank for this exact
    // query, not invented.
    const withPosition = items.map((r, i) => ({ ...r, _position: i + 1 }))

    const withReviews = withPosition.filter(
      (r): r is typeof withPosition[number] & { reviewsCount: number; brand: string } =>
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
      .sort((a, b) => a._position - b._position)
      .slice(0, 10)
      .filter(r => typeof r.stars === 'number' && typeof r.price?.value === 'number' && !!r.asin)
      .map(r => {
        // M2.19: deterministic DSHEA claim-risk scan over this listing's
        // own real features + extracted ingredients label text — no AI
        // call, no external call.
        const ingredientsLabel = extractIngredientsLabel(r)
        const scanTexts: string[] = []
        if (r.features?.length) scanTexts.push(...r.features)
        if (ingredientsLabel) scanTexts.push(ingredientsLabel)
        const claimRiskFlags = scanForClaimRiskLanguage(scanTexts)

        return {
          productId:   r.asin!,   // r.asin is Apify's real Amazon ASIN — productId is the generic core-model field it populates
          brand:       r.brand,
          reviewCount: r.reviewsCount,
          rating:      r.stars!,
          price:       r.price!.value!,
          position:    r._position,
          breadcrumb:  r.breadCrumbs || undefined,
          bullets:     r.features?.length ? r.features : undefined,
          ingredients_label: ingredientsLabel,
          // M2.19: real matched DSHEA disease-claim-language phrases, or
          // undefined if none found — never a guessed default.
          claim_risk_flags: claimRiskFlags.length ? claimRiskFlags : undefined,
        }
      })

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
