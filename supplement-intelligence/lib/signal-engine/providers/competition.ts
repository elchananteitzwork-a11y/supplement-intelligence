import type { SignalProvider, SignalContext, ProviderSignals, ReviewVelocitySignal } from '../types'
import { cacheGet, cacheSet } from '../../provider-cache'
import { scanForClaimRiskLanguage } from '../../regulatory-engine/claim-risk'
import {
  fetchManufacturerRecallHistoryBatch,
  toManufacturerRecallFlags,
} from '../../regulatory-engine/manufacturer-credibility'

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
// Cost note (bug-fix audit finding 5, 2026-07-18): the $0.003/result figure
// above and the `cost_estimate_usd` log below cover ONLY the actor's
// `result` PAY_PER_EVENT charge. The actor's real, live-confirmed pricing
// model (changed 2026-04-14) ALSO bills `offer` ($0.0015/offer) and
// `seller` ($0.0015/seller) events separately whenever the response
// includes that sub-data. This is therefore a LOWER-BOUND estimate only —
// real spend may be higher if offer/seller sub-data is present in the
// response. Not corrected to an exact figure here because this actor's
// response shape (JungleeResult, above) doesn't surface offer/seller counts
// for us to multiply against — that would require its own live
// confirmation, not a guess.
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

// Bug-fix audit Finding 4 (2026-07-18): `price.currency` was typed but never
// read — `price.value` was emitted as a bare number with no currency check,
// silently assuming USD. CONFIRMED VIA LIVE-FETCHED APIFY DOCS: for the
// amazon.com domain (the only domain this provider ever queries — see the
// hardcoded `amazon.com` search URL in fetch()), this actor's real currency
// symbol is `'$'`. Only `'$'`/`'USD'` are trusted as confirmed-USD; any
// other or missing currency value means we cannot honestly assert this is a
// real USD price, so the price is dropped (treated as absent) rather than
// assumed.
function usdPrice(price: JungleeResult['price']): number | undefined {
  if (!price || typeof price.value !== 'number') return undefined
  const currency = price.currency?.trim()
  if (currency !== '$' && currency !== 'USD') return undefined
  return price.value
}

// Bug-fix audit Finding 3 (2026-07-18): sponsored + organic placements for
// the same ASIN on one real Amazon SERP is a real, documented phenomenon —
// with no dedupe, that single real listing would double-count in
// totalReviews/review_concentration_ratio and appear twice in
// top_competitors. Keeps the FIRST occurrence of each real ASIN — i.e. the
// earliest (highest-ranked/lowest `_position`) real appearance of that
// listing in this exact SERP, since callers already run this over an
// array tagged with `_position` in original search-result order. A
// sponsored placement for a given ASIN typically appears before its own
// organic listing, so this also tends to keep the sponsored slot's real
// position — still a real, non-invented value, never a synthesized
// "merged" one. Items with no real `asin` at all have nothing reliable to
// dedupe against, so they all pass through unchanged.
function dedupeByAsin<T extends { asin?: string }>(items: T[]): T[] {
  const seenAsins = new Set<string>()
  const result: T[] = []
  for (const r of items) {
    const asin = r.asin?.trim()
    if (asin) {
      if (seenAsins.has(asin)) continue
      seenAsins.add(asin)
    }
    result.push(r)
  }
  return result
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

      // Bug-fix audit Finding 1 (2026-07-18): MIN_RESULTS must gate on the
      // USABLE count (real reviewsCount>0 + real brand), not the raw Apify
      // item count. review_velocity is currently an uncontested
      // single-provider dimension (see header comment) — engine.ts's
      // aggregateDimension() passes its score straight through with no
      // confidence-weighting from a second provider. If the actor's
      // `brand` field goes empty for a batch (a real, documented failure
      // mode — see the automation-lab/amazon-scraper rejection above),
      // withReviews would become empty while raw items.length still
      // cleared the old gate, silently producing a confident-looking score
      // off zero real usable competitors. Same class of fix already
      // applied to keepa.ts (Finding 1) and tiktok-shop.ts (MIN_RESULTS)
      // this session.
      const withReviews = this.filterWithReviews(items)
      if (withReviews.length < MIN_RESULTS) {
        console.log('Apify amazon-crawler: too few usable results', {
          category, rawCount: items.length, usableCount: withReviews.length,
        })
        return null
      }

      const result = await this.computeSignals(withReviews, items.length)
      cacheSet(cacheKey, 'junglee-crawler', result, SERP_CACHE_TTL_MS).catch(() => {})
      return result
    } catch (e: unknown) {
      console.error('Apify amazon-crawler provider error', { category, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  // Real search-result rank is captured BEFORE any dedupe/filtering —
  // items[] is already in the actor's real Amazon search-result order
  // (confirmed via live call: no separate position/rank field exists), so
  // the 1-indexed array position here is the real rank for this exact
  // query, not invented. Dedupe (Finding 3) runs AFTER position-tagging so
  // a kept ASIN's `_position` always reflects its real, earliest SERP
  // index rather than a post-dedupe, compacted index.
  //
  // Extracted as its own method (mirrors tiktok-shop.ts's filterUsable)
  // specifically so fetch()'s MIN_RESULTS gate can check the real usable
  // count AFTER dedupe/filtering, not the raw Apify item count — see
  // fetch()'s own comment (Finding 1).
  private filterWithReviews(items: JungleeResult[]) {
    const withPosition = items.map((r, i) => ({ ...r, _position: i + 1 }))
    const deduped = dedupeByAsin(withPosition)
    return deduped.filter(
      (r): r is typeof deduped[number] & { reviewsCount: number; brand: string } =>
        typeof r.reviewsCount === 'number' && r.reviewsCount > 0 && !!r.brand?.trim(),
    )
  }

  // `withReviews` is ALREADY the post-filterWithReviews, deduped set (see
  // fetch()) — never re-derived here, so this method's own competitor
  // count can never diverge from what fetch()'s MIN_RESULTS gate actually
  // checked. `rawCount` is passed through only for logging (real total
  // Apify items vs. real usable count), never used in any threshold
  // decision.
  private async computeSignals(
    withReviews: ReturnType<CompetitionSignalProvider['filterWithReviews']>,
    rawCount: number,
  ): Promise<ProviderSignals> {
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

    // Finding 4 (currency): `usdPrice` drops any price whose currency isn't
    // confirmed USD, rather than assuming — see usdPrice()'s own comment.
    //
    // Bug-fix audit Finding 2 (2026-07-18): an earlier attempt at this fix
    // widened top_competitors[].rating/.price to optional so this exact
    // set could include price/stars-less listings — that was implemented,
    // then REVERTED this same session after a full-repo `tsc --noEmit` run
    // surfaced real, unauthorized-scope breakage in lib/evidence/adapter.ts
    // (decision-engine-agent's owned file), components/memo/SupplyLandscape.tsx,
    // and lib/ai-interpretation/writer/output-validator.ts. Per the
    // Planner's revised, narrower instruction: `filteredResults` and
    // `top_competitors[]` below are UNCHANGED from before that attempt —
    // same shape, same stars/price/asin gate, zero ripple into any other
    // file. The real scan-coverage gap is now covered by a separate,
    // additive block below (`unlisted_competitor_safety_flags`) instead.
    const filteredResults = [...withReviews]
      .sort((a, b) => a._position - b._position)
      .slice(0, 10)
      .filter(r => typeof r.stars === 'number' && usdPrice(r.price) !== undefined && !!r.asin)

    // Bug-fix audit Finding 2 (2026-07-18, revised) — purely additive fix:
    // real competitors in the SAME top-10-by-position candidate window
    // (`filteredResults` was sliced from) that have a real asin+brand and
    // real scannable text (features or extractIngredientsLabel), but were
    // excluded from `filteredResults`/`topCompetitors` below ONLY because
    // they're missing a real star rating or confirmed-USD price (e.g.
    // temporarily out of stock) — price/rating has no logical bearing on
    // claim-risk-scan/recall-lookup eligibility. Scanned separately below so
    // `top_competitors[]`'s existing shape/type is completely untouched.
    // Computed here (before the recall batch call) so its brands can be
    // folded into ONE shared lookup rather than a second, separate one.
    const candidatePool = [...withReviews].sort((a, b) => a._position - b._position).slice(0, 10)
    const excludedScanEligible = candidatePool.filter(r => {
      if (!r.asin || !r.brand?.trim()) return false
      const hasScannableText = (r.features?.length ?? 0) > 0 || !!extractIngredientsLabel(r)
      if (!hasScannableText) return false
      const inFilteredResults = typeof r.stars === 'number' && usdPrice(r.price) !== undefined
      return !inFilteredResults
    })

    // M2.20 (Manufacturer Recall History): real per-class OpenFDA recall
    // counts for each competitor's manufacturer identity. Apify's
    // junglee/amazon-crawler exposes no separate manufacturer field — real,
    // disclosed limitation, not worked around — so this is keyed on r.brand
    // only. Deduped to exactly one live call per unique brand string within
    // this response before issuing any requests.
    //
    // Efficiency audit fix (2026-07-18): a single batch call over the UNION
    // of filteredResults's and excludedScanEligible's brands, not two
    // independent batch calls. fetchManufacturerRecallHistory's own cache
    // write fires `cacheSet(...).catch(() => {})` without awaiting it (see
    // lib/regulatory-engine/manufacturer-credibility.ts), so a second,
    // separate batch call issued right after the first — as this file
    // previously did — could miss that still-in-flight cache write and
    // re-fetch the SAME brand's recall history live from api.fda.gov twice
    // within one request (real scenario: the same brand appears on both a
    // priced listing in filteredResults and an out-of-stock listing in
    // excludedScanEligible). Both consumers below read from this one map.
    const recallHistoryByFirm = await fetchManufacturerRecallHistoryBatch([
      ...filteredResults.map(r => r.brand),
      ...excludedScanEligible.map(r => r.brand),
    ])

    const topCompetitors = filteredResults.map(r => {
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
          // Finding 4: usdPrice(r.price) is guaranteed defined here — this
          // row only exists because filteredResults's filter above already
          // confirmed it — never a bare, currency-unchecked r.price.value.
          price:       usdPrice(r.price)!,
          position:    r._position,
          breadcrumb:  r.breadCrumbs || undefined,
          bullets:     r.features?.length ? r.features : undefined,
          ingredients_label: ingredientsLabel,
          // M2.19: real matched DSHEA disease-claim-language phrases, or
          // undefined if none found — never a guessed default.
          claim_risk_flags: claimRiskFlags.length ? claimRiskFlags : undefined,
          // M2.20: real per-class OpenFDA recall counts for r.brand, or
          // undefined if none found for this exact firm-name string — never
          // a guessed default. See MANUFACTURER_RECALL_DISCLAIMER for the
          // exact-string-match false-negative risk.
          // recallHistoryByFirm is keyed by trimmed firm name (see
          // fetchManufacturerRecallHistoryBatch) — trim here too so a
          // real brand string with incidental leading/trailing whitespace
          // doesn't silently miss its own successfully-fetched recall data.
          manufacturer_recall_flags: toManufacturerRecallFlags(recallHistoryByFirm.get(r.brand.trim())),
        }
      })

    // excludedScanEligible (computed above, before the shared recall batch
    // call) — scan it here using that SAME recallHistoryByFirm map, not a
    // second, separate lookup (see the efficiency-fix comment above).
    let unlistedFlaggedCount = 0
    for (const r of excludedScanEligible) {
      const ingredientsLabel = extractIngredientsLabel(r)
      const scanTexts: string[] = []
      if (r.features?.length) scanTexts.push(...r.features)
      if (ingredientsLabel) scanTexts.push(ingredientsLabel)
      const claimRiskFlags = scanForClaimRiskLanguage(scanTexts)
      const recallFlags    = toManufacturerRecallFlags(recallHistoryByFirm.get(r.brand.trim()))
      if (claimRiskFlags.length > 0 || (recallFlags && recallFlags.length > 0)) {
        unlistedFlaggedCount++
      }
    }
    // Present only when this excluded subset actually produced ≥1 real
    // flag — never a fabricated `{ count: 0 }` shown as if it were
    // meaningful.
    const unlisted_competitor_safety_flags = unlistedFlaggedCount > 0
      ? {
          count: unlistedFlaggedCount,
          note: `${unlistedFlaggedCount} additional competitor listing(s) with real claim-risk or recall history were found but excluded from the displayed table due to missing price/rating data.`,
        }
      : undefined

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
      unlisted_competitor_safety_flags,
    }

    console.log('Apify amazon-crawler signals computed', {
      total_results:        rawCount,
      with_reviews_and_brand: withReviews.length,
      meaningful_brands:     meaningfulBrands.size,
      avg_review_count:      avgReviewCount !== null ? Math.round(avgReviewCount) : null,
      top3_concentration:    concentration,
      avg_rating:            avgRating !== null ? avgRating.toFixed(1) : null,
      accessibility_score:   score,
      confidence:            Math.round(confidence * 100) + '%',
      // Finding 5: LOWER-BOUND only — covers the actor's `result` charge
      // event alone. See header comment for why real spend may be higher.
      cost_estimate_usd_lower_bound: Math.round(rawCount * 0.003 * 1000) / 1000,
    })

    return {
      review_velocity,
      provider:   'apify-amazon-search',
      fetched_at: new Date().toISOString(),
      confidence,
    }
  }
}
