import type {
  SignalProvider,
  SignalContext,
  ProviderSignals,
  DemandSignal,
  CompetitionSignal,
  GrowthSignal,
  PricingSignal,
  RevenueSignal,
  ReviewVelocitySignal,
  SeasonalitySignal,
  SupplyVelocitySignal,
} from '../types'
import { checkKeywordRelevance } from '../../keyword-engine/relevance-guard'
import { scanForClaimRiskLanguage } from '../../regulatory-engine/claim-risk'

// ── Keepa API constants ───────────────────────────────────────────

const KEEPA_API = 'https://api.keepa.com'

// Category node IDs (Amazon US, domain=1), one per supported category module.
// Each found and verified live via Keepa's /search?type=category endpoint and
// confirmed against /bestsellers before being trusted (2026-06-24) — not
// guessed. Supplements predates this file's other four; same verification
// standard applies to all five now.
//
//   supplements → 23675621011 "Vitamins, Minerals & Supplements"
//     (sub-node under Health & Household; tree walk 3760901 → 3760931 → here)
//   beauty      → 3760911     "Beauty & Personal Care"      (top-level, parent=0)
//   pets        → 2619533011  "Pet Supplies"                (top-level, parent=0)
//   fitness     → 3375251     "Sports & Outdoors"           (top-level, parent=0)
//   home        → 1055398     "Home & Kitchen"               (top-level, parent=0)
const CATEGORY_NODES: Record<string, number> = {
  supplements: 23675621011,
  beauty:      3760911,
  pets:        2619533011,
  fitness:     3375251,
  home:        1055398,
}

// Keepa CSV array indices in raw stats arrays (stats.current[], stats.avg90[], etc.).
// Source: Keepa API docs + confirmed via live call 2026-06-24 (original 6 indices).
// Phase 1 expansion 2026-07-08: added MARKETPLACE_NEW, LIST_PRICE, NEW_FBA, COUNT_USED.
// New indices not yet confirmed via live call — first run will log actual values.
const CSV = {
  AMAZON_PRICE:    0,  // Amazon's own retail price (absent/-1 when Amazon is not a seller)
  MARKETPLACE_NEW: 1,  // lowest 3rd-party new offer price (not FBA-specific)
  LIST_PRICE:      4,  // manufacturer list price / MSRP
  BSR:             3,  // Best Sellers Rank in root category
  NEW_FBA:         10, // lowest new FBA-fulfilled offer — real floor for new-entrant comparison
  NEW_OFFER_CNT:   11, // count of new competing offers (seller count proxy)
  COUNT_USED:      12, // count of used offers — proxy for commodity / aging category
  RATING:          16, // CONFIRMED live 2026-06-24: ×10 encoding (47 = 4.7★)
  COUNT_REVIEWS:   17, // CONFIRMED live 2026-06-24: requires &rating=1 request param
  BUYBOX_PRICE:    18, // Buy Box price (including shipping for 3P sellers)
} as const

// Keepa sentinel: -1 means "not available" for that data point
const NO_DATA = -1

// Keepa epoch: Jan 1, 2011 00:00:00 UTC in unix seconds.
// All Keepa timestamps are encoded as minutes since this epoch.
// Decode: unix_seconds = KEEPA_EPOCH + keepaMinutes * 60
// Confirmed live 2026-07-08: negative values = products listed before 2011 (valid).
const KEEPA_EPOCH = 1_293_840_000

// ── Raw Keepa API response shapes ────────────────────────────────
// These are the RAW responses from the API before any normalization.

interface KeepaStats {
  current?:  number[]   // current value by CSV index
  avg90?:    number[]   // 90-day average by CSV index
  avg365?:   number[]   // 365-day average by CSV index
  // CONFIRMED VIA LIVE CALL 2026-06-26: single number for monthlySold delta,
  // not an array. Real 90-day percent change in Keepa's monthlySold estimate.
  deltaPercent90_monthlySold?: number
  // CONFIRMED VIA LIVE CALL 2026-07-08 (5/5 products): outOfStockPercentage90
  // is indexed by CSV slot. [0] = Amazon price slot — 0% means Amazon always
  // in stock (competing directly); 68–99% means Amazon rarely sells (accessible).
  outOfStockPercentage90?: number[]
  // CONFIRMED VIA LIVE CALL 2026-07-08: present in STANDARD response (no
  // buybox=1 needed) when Amazon IS the buy box holder. Absent otherwise.
  // buyBoxSellerId='ATVPDKIKX0DER' is Amazon's canonical seller ID.
  buyBoxIsAmazon?: boolean
  buyBoxSellerId?: string
}

// Phase 1 expansion (2026-07-08): added manufacturer, parentAsin, numberOfItems,
// package dimensions, and category tree. All new fields are optional with
// defensive access — present for most products but may be absent for
// marketplace-only or incomplete catalogue entries.
// Sprint 1–3 expansion (2026-07-08): isSNS, monthlySoldHistory, listedSince,
// variations, features, ingredients, categoryTree, reviews all CONFIRMED VIA
// LIVE CALL on 5/5 bestsellers AND 5/5 query-specific products.
interface KeepaProduct {
  asin:           string
  title?:         string
  brand?:         string
  manufacturer?:  string  // often same as brand for supplement brands; distinct for contract-mfg products
  parentAsin?:    string  // present on variation children (flavors, sizes); enables product-family grouping
  numberOfItems?: number  // pack count (e.g. 90 for a 90-count bottle); used for price-per-unit calc
  // Package dimensions per Keepa API docs (units: mm for dimensions, grams for weight).
  // Not yet used in score computation but collected for future FBA fee precision.
  packageHeight?: number
  packageWidth?:  number
  packageLength?: number
  packageWeight?: number
  // Category tree: array of node IDs from specific to root (e.g. [23675621011, 3760931, 3760901]).
  // Enables breadcrumb reconstruction without Apify.
  categories?:    number[]
  rootCategory?:  number
  stats?:         KeepaStats
  monthlySold?:   number  // Keepa's estimated monthly unit sales (top-level field)
  // CONFIRMED VIA LIVE CALL 2026-06-26: real top-level fields on the Keepa
  // product response — Amazon's own published fee schedule for this
  // product's category/size tier, mirrored by Keepa, not a Keepa-side estimate.
  fbaFees?:               { pickAndPackFee?: number }
  referralFeePercentage?: number
  // ── Sprint 1–3 additions — all confirmed live 2026-07-08 ──────────────────
  // Subscribe & Save enrollment. True on ALL tested bestsellers and query products.
  isSNS?: boolean
  // Full monthly units-sold time series: [keepaTimestamp, units, keepaTimestamp, units, ...]
  // Arrays of 218–1522 elements confirmed live. Decode: date = KEEPA_EPOCH + t*60.
  monthlySoldHistory?: number[]
  // Listing date in Keepa minutes from epoch. Negative = listed before 2011 (valid).
  listedSince?: number
  // Variation family: [{asin, attributes:[{dimension,value}], image}].
  // numberOfVariations field is absent — use variations.length instead.
  variations?: Array<{ asin: string; attributes?: Array<{ dimension: string; value: string }>; image?: string }>
  // Listing bullet points (Amazon "features" / bullets). 5/5 products confirmed.
  features?: string[]
  // Ingredient label text verbatim from listing. 5/5 products confirmed.
  ingredients?: string
  // Full category breadcrumb with names: [{catId, name}, ...] from specific to general.
  categoryTree?: Array<{ catId: number; name: string }>
  // Review time series (returned when rating=1 param set).
  reviews?: { ratingCount?: number[] }
}

// Response from GET /category — confirmed live 2026-07-07.
// 1 token; returns category-level aggregate stats for a given node ID.
interface KeepaCategoryData {
  soldByAmazonPercent?: number   // % of category products sold directly by Amazon
  isFBAPercent?:        number   // % of category products FBA-fulfilled
  hasCouponPercent?:    number   // % of category products with an active coupon
  avgReviewCount?:      number   // average review count across category products
  productCount?:        number   // total product count in the category
  topBrands?:           string[] // top brand names by sales
  children?:            number[] // sub-category node IDs
}

interface KeepaProductResponse {
  products?: KeepaProduct[]
}

interface KeepaBestsellerResponse {
  bestSellersList?: {
    asinList?: string[]
  }
}

// Response from GET /search?type=product&term={query}&domain=1 (Phase 2).
// Keepa's product database search — returns products whose titles contain
// the query terms. NOT Amazon's live organic search ranking — Keepa uses its
// own relevance algorithm over its database. Highly correlated with Amazon SERP
// results but not identically ranked (no sponsored/organic distinction either).
// UNCONFIRMED response format as of 2026-07-08 — first live call will log the
// actual shape so we can validate or fix the field references.
interface KeepaSearchResponse {
  products?:     KeepaProduct[]  // lightweight product objects (may lack full stats)
  asinList?:     string[]        // alternative response format: just ASINs
  totalResults?: number
  domainId?:     number
}

// ── Helpers ───────────────────────────────────────────────────────

// checkKeywordRelevance (imported above) is deliberately permissive when
// the original query contains no species/demographic/body-area/product-type
// term at all — by design, for ITS use case (DataForSEO keyword broadening).
// CONFIRMED VIA LIVE REGRESSION (2026-06-29): that permissiveness is too
// wide for Keepa's bestseller sample specifically — "Decorative Ceramic
// Garden Gnome" / "Antique Pocket Watch Collection" hit none of those
// vocab lists and so were still credited with an unrelated category
// bestseller's revenue. This generic, title-vs-query word-overlap check is
// a second, independent gate — local to this file, NOT a change to the
// shared relevance-guard module (which stays exactly as validated for its
// own callers) — requiring at least one real shared word as a coarse but
// category-agnostic backstop.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'pack', 'count',
])
function significantWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOPWORDS.has(w)),
  )
}

// QUALITY FIX (2026-06-29): two narrow additive checks closing false-positive
// matches — see original comment block for full rationale.
const GENERIC_CLAIM_WORDS = new Set([
  'immune', 'support', 'relief', 'recovery', 'boost', 'defense', 'health',
  'care', 'daily', 'natural', 'premium', 'advanced', 'complete', 'formula',
  'wellness', 'strength', 'energy', 'balance', 'active', 'extra', 'total',
])
const BODY_LOCATION_WORDS = new Set([
  'ankle', 'wrist', 'hand', 'knee', 'neck', 'back', 'shoulder', 'foot',
  'head', 'waist', 'arm', 'leg', 'elbow', 'hip',
])
function hasWordOverlap(query: string, title: string): boolean {
  const queryWords = significantWords(query)
  const titleWords  = significantWords(title)
  const overlap = Array.from(queryWords).filter(w => titleWords.has(w))
  if (overlap.length === 0) return false
  if (!overlap.some(w => !GENERIC_CLAIM_WORDS.has(w))) return false
  const queryLocations = Array.from(queryWords).filter(w => BODY_LOCATION_WORDS.has(w))
  if (queryLocations.length > 0 && !queryLocations.some(w => titleWords.has(w))) return false
  return true
}

function keepaPrice(raw: number | undefined): number | null {
  if (raw === undefined || raw === NO_DATA || raw <= 0) return null
  return raw / 100  // Keepa stores prices in integer cents
}

function statVal(
  stats: KeepaStats | undefined,
  field: keyof KeepaStats,
  idx: number,
): number | null {
  const arr = stats?.[field]
  if (!Array.isArray(arr) || arr.length <= idx) return null
  const v = arr[idx]
  return v === undefined || v === NO_DATA ? null : v
}

function bsrToDemandScore(avgBsr: number): number {
  if (avgBsr <= 1_000)   return 9
  if (avgBsr <= 3_000)   return 8
  if (avgBsr <= 8_000)   return 7
  if (avgBsr <= 20_000)  return 6
  if (avgBsr <= 50_000)  return 4
  if (avgBsr <= 150_000) return 2
  return 1
}

function offersToDomainScore(avgOffers: number): number {
  if (avgOffers < 10)  return 9
  if (avgOffers < 20)  return 8
  if (avgOffers < 35)  return 7
  if (avgOffers < 60)  return 6
  if (avgOffers < 100) return 4
  if (avgOffers < 200) return 2
  return 1
}

function offersToBarrier(avgReviews: number): CompetitionSignal['barrier'] {
  if (avgReviews < 200)  return 'Low'
  if (avgReviews < 2000) return 'Medium'
  return 'High'
}

// ── Competition scoring v2.7.0 ────────────────────────────────────────────────
// review-barrier (60%) + relevant-competitor density (40%)
function reviewCountToBarrierScore(avgReviewCount: number): number {
  if (avgReviewCount > 10_000) return 1
  if (avgReviewCount > 5_000)  return 2
  if (avgReviewCount > 1_000)  return 4
  if (avgReviewCount > 200)    return 6
  return 9
}

function densityToScore(relCount: number): number {
  if (relCount >= 20) return 1
  if (relCount >= 10) return 3
  if (relCount >= 5)  return 5
  if (relCount >= 2)  return 7
  return 9
}

function bsrDeltaYoY(avg90: number | null, avg365: number | null): string | null {
  if (!avg90 || !avg365) return null
  const pct = ((avg365 - avg90) / avg365) * 100
  if (Math.abs(pct) < 5) return 'Stable'
  return pct > 0 ? `+${Math.round(pct)}% YoY` : `${Math.round(pct)}% YoY`
}

// ── Phase 1: New Keepa field helpers ─────────────────────────────────────────

// Price divided by pack size. Avoids over-crediting large-pack products —
// a $35 bottle of 90 servings is $0.39/serving, not $35.
// Returns the per-unit price; uses pack=1 when numberOfItems is absent/1.
function unitPrice(price: number, numberOfItems: number | undefined): number {
  return price / (typeof numberOfItems === 'number' && numberOfItems > 1 ? numberOfItems : 1)
}

// 3-point seller-count trend from offer-count history.
// Returns null when insufficient data — "no sellers" is indistinguishable
// from "data absent" without a positive reference point.
function sellerCountTrend(
  current: number | null,
  avg90:   number | null,
  avg365:  number | null,
): 'Growing' | 'Stable' | 'Shrinking' | null {
  const reference = avg365 ?? avg90
  const recent    = avg90  ?? current
  if (reference === null || recent === null || reference === 0) return null
  const pctChange = ((recent - reference) / reference) * 100
  if (pctChange > 15)  return 'Growing'
  if (pctChange < -15) return 'Shrinking'
  return 'Stable'
}

// Fraction of total reviews controlled by the most-reviewed brand.
// High → one brand dominates and has a review moat; low → fragmented market.
function topBrandReviewShare(products: KeepaProduct[]): number | null {
  const byBrand = new Map<string, number>()
  let total = 0
  for (const p of products) {
    const b = p.brand?.trim().toLowerCase()
    if (!b) continue
    const reviews = statVal(p.stats, 'current', CSV.COUNT_REVIEWS)
    if (!reviews || reviews <= 0) continue
    byBrand.set(b, (byBrand.get(b) ?? 0) + reviews)
    total += reviews
  }
  if (total === 0 || byBrand.size === 0) return null
  const max = Math.max(...Array.from(byBrand.values()))
  return Math.round((max / total) * 100) / 100
}

function countDistinctBrands(products: KeepaProduct[]): number {
  return new Set(
    products.map(p => p.brand?.trim().toLowerCase()).filter((b): b is string => !!b),
  ).size
}

// Market maturity from average review depth and brand density.
// Returns null when data is insufficient to distinguish nascent from missing.
function computeMarketMaturity(
  avgReviewCount: number | null,
  brandCount:     number,
): CompetitionSignal['market_maturity'] {
  if (avgReviewCount === null) return undefined
  if (avgReviewCount < 100  && brandCount <= 3)  return 'Nascent'
  if (avgReviewCount < 1000 && brandCount <= 8)  return 'Growing'
  if (avgReviewCount > 5000 || brandCount > 15)  return 'Saturated'
  return 'Mature'
}

// ── Phase 4: Seasonality from BSR trend ──────────────────────────────────────
//
// True month-by-month seasonality requires parsing Keepa's raw csv[] time-series
// arrays, which would substantially increase response size and parsing complexity.
// This function derives a coarser but real-data-backed signal from the avg90/avg365
// BSR stats already present in every response.
//
// Logic (BSR is inverse of demand — lower BSR = more sales):
//   avg365 >> avg90 → recent demand is HIGHER than annual average → peak or growth
//   avg365 ≈ avg90  → stable year-round demand → Perennial
//   avg365 << avg90 → recent demand is LOWER than annual average → trough or decline
//   extreme momentum90d (±40%) → spike-driven → Event-driven
//
// Returns null when < 2 products have both BSR periods — too thin to trust the average.
function computeSeasonality(
  avgBsr90:    number | null,
  avgBsr365:   number | null,
  momentum90d: number | null,
  sampleSize:  number,
): SeasonalitySignal & { sourceLabel: string } | null {
  if (avgBsr90 === null || avgBsr365 === null || sampleSize < 2) return null

  const bsrPctChange = ((avgBsr365 - avgBsr90) / avgBsr365) * 100
  const isEventDriven = momentum90d !== null && Math.abs(momentum90d) > 40

  const pattern: SeasonalitySignal['pattern'] =
    isEventDriven                ? 'Event-driven' :
    Math.abs(bsrPctChange) <= 15 ? 'Perennial'    :
    'Seasonal'

  // Score: 10 = perennial (ideal for subscription), lower = more volatile or seasonal
  const score =
    pattern === 'Perennial'    ? 9 :
    pattern === 'Event-driven' ? 4 :
    bsrPctChange > 0           ? 7 :  // in-season (current demand above annual avg)
    5                                  // off-season (current demand below annual avg)

  const sourceLabel =
    pattern === 'Perennial'
      ? `keepa BSR trend: stable (${Math.abs(Math.round(bsrPctChange))}% spread, 90d vs 365d avg, n=${sampleSize})`
    : pattern === 'Event-driven'
      ? `keepa BSR trend: event-driven spike (${momentum90d}% units/mo Δ in 90d)`
    : bsrPctChange > 0
      ? `keepa BSR trend: peak demand (recent BSR ${Math.round(bsrPctChange)}% lower than annual avg, n=${sampleSize})`
    : `keepa BSR trend: off-peak demand (recent BSR ${Math.round(Math.abs(bsrPctChange))}% higher than annual avg, n=${sampleSize})`

  return { score, confidence: sampleSize >= 4 ? 0.65 : 0.50, pattern, sourceLabel }
}

// ── Phase 2/3: Keepa-based review_velocity (query-specific competition) ──────
//
// Produces a review_velocity signal from Keepa /search results, replacing the
// Apify junglee/amazon-crawler provider when Apify is unavailable.
//
// What's equivalent to Apify:
//   score, avg_review_count, review_concentration_ratio, top_competitors (ASIN/brand/price)
// What's absent vs Apify:
//   Amazon search rank position (Keepa ranks by its own relevance, not SERP)
//   feature bullets, ingredients_label (Keepa doesn't store listing copy)
//
// Confidence: 0.60 (≥5 products with review data) / 0.45 (3–4) / skip < 3.
// Lower than Apify (0.80/0.60) because ranking is Keepa's algorithm, not Amazon's.
// When both are present the engine blends them — Apify's higher confidence dominates.
function computeKeepaReviewVelocity(
  queryProducts: KeepaProduct[],
  query:         string,
): ReviewVelocitySignal & { sourceLabel: string } | null {
  // Only include products that have review and rating data AND pass the
  // same relevance gate used for bestsellers.
  const withReviews = queryProducts.filter(p => {
    const reviews = statVal(p.stats, 'current', CSV.COUNT_REVIEWS)
    const rating  = statVal(p.stats, 'current', CSV.RATING)
    if (!reviews || reviews <= 0 || !rating || rating <= 0) return false
    if (!p.title) return false
    return checkKeywordRelevance(query, p.title).allowed && hasWordOverlap(query, p.title)
  })

  if (withReviews.length < 3) return null

  const reviewCounts = withReviews.map(p => statVal(p.stats, 'current', CSV.COUNT_REVIEWS) ?? 0)
  const totalReviews = reviewCounts.reduce((a, b) => a + b, 0)
  const avgReviewCount = totalReviews / reviewCounts.length

  // Review concentration: fraction of all reviews held by the top-3 products
  const top3Total = [...reviewCounts].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0)
  const concentration = totalReviews > 0 ? Math.round((top3Total / totalReviews) * 100) / 100 : null

  // Meaningful brands: distinct brands with ≥20 reviews
  const meaningfulBrands = new Set(
    withReviews
      .filter(p => (statVal(p.stats, 'current', CSV.COUNT_REVIEWS) ?? 0) >= 20 && p.brand?.trim())
      .map(p => p.brand!.trim().toLowerCase()),
  )

  const ratings    = withReviews.map(p => (statVal(p.stats, 'current', CSV.RATING) ?? 0) / 10).filter(r => r > 0)
  const avgRating  = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null

  // Accessibility score: same formula as Apify competition.ts
  let accessScore = 10
  if (meaningfulBrands.size > 30)      accessScore -= 5
  else if (meaningfulBrands.size > 15) accessScore -= 3
  else if (meaningfulBrands.size > 8)  accessScore -= 2
  else if (meaningfulBrands.size > 4)  accessScore -= 1
  if (concentration !== null) {
    if (concentration > 0.7)      accessScore -= 3
    else if (concentration > 0.5) accessScore -= 1
  }
  accessScore = Math.max(1, Math.min(10, accessScore))

  const confidence = withReviews.length >= 5 ? 0.60 : 0.45

  // Build top_competitors list — these ASINs are the key output that lets
  // Consumer Intelligence know which products to scrape reviews for.
  // Sprint 3: enrich with bullets, ingredients_label, breadcrumb, listing_age_months,
  // variation_count — all CONFIRMED live in Keepa /product response 2026-07-08.
  const topCompetitors = withReviews
    .slice(0, 10)
    .map(p => {
      const reviews = statVal(p.stats, 'current', CSV.COUNT_REVIEWS) ?? 0
      const rating  = (statVal(p.stats, 'current', CSV.RATING) ?? 0) / 10
      // Prefer FBA price as it's what a buyer actually pays from a real brand
      const fbaRaw    = statVal(p.stats, 'avg90', CSV.NEW_FBA)
      const buyBoxRaw = statVal(p.stats, 'avg90', CSV.BUYBOX_PRICE)
      const amazonRaw = statVal(p.stats, 'avg90', CSV.AMAZON_PRICE)
      const price = keepaPrice(fbaRaw ?? undefined) ?? keepaPrice(buyBoxRaw ?? undefined) ?? keepaPrice(amazonRaw ?? undefined)
      if (price === null || !p.brand) return null

      // Sprint 3: categoryTree breadcrumb (specific→general; reverse for display).
      const tree = p.categoryTree as Array<{ catId: number; name: string }> | undefined
      const breadcrumb = Array.isArray(tree) && tree.length > 0
        ? [...tree].reverse().map(c => c.name).join(' > ')
        : undefined

      // M2.19: deterministic DSHEA claim-risk scan over this listing's own
      // real bullets + ingredients label text — no AI call, no external call.
      // Scans only the same first-5 features returned below as `bullets`
      // (not the full, unsliced p.features array) — a flag must always be
      // traceable to a bullet the caller can actually see in this same
      // competitor object, never to text truncated out of it.
      const scanTexts: string[] = []
      if (Array.isArray(p.features)) scanTexts.push(...(p.features as string[]).slice(0, 5))
      if (typeof p.ingredients === 'string') scanTexts.push(p.ingredients)
      const claimRiskFlags = scanForClaimRiskLanguage(scanTexts)

      return {
        productId:          p.asin,
        brand:              p.brand,
        reviewCount:        reviews,
        rating,
        price,
        breadcrumb,
        // Sprint 3: listing bullet points from Keepa features[] (max 5).
        bullets:            Array.isArray(p.features) && (p.features as string[]).length > 0
          ? (p.features as string[]).slice(0, 5)
          : undefined,
        // Sprint 3: verbatim ingredients label from Keepa ingredients field.
        ingredients_label:  typeof p.ingredients === 'string' && p.ingredients.length > 3
          ? p.ingredients.slice(0, 500)
          : undefined,
        // Sprint 3: listing age from listedSince.
        listing_age_months: typeof p.listedSince === 'number'
          ? listedSinceToAgeMonths(p.listedSince) ?? undefined
          : undefined,
        // Sprint 3: variation count from variations[].length.
        variation_count:    Array.isArray(p.variations)
          ? (p.variations as unknown[]).length
          : undefined,
        // M2.19: real matched DSHEA disease-claim-language phrases, or
        // undefined if none found — never a guessed default.
        claim_risk_flags:   claimRiskFlags.length ? claimRiskFlags : undefined,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  return {
    score:                      accessScore,
    confidence,
    avg_rating:                 avgRating !== null ? avgRating.toFixed(1) : undefined,
    sentiment:                  avgRating !== null ? (avgRating >= 4.2 ? 'Positive' : avgRating >= 3.5 ? 'Mixed' : 'Negative') : undefined,
    meaningful_competitor_count: meaningfulBrands.size,
    avg_review_count:           Math.round(avgReviewCount),
    review_concentration_ratio: concentration ?? undefined,
    top_competitors:            topCompetitors.length ? topCompetitors : undefined,
    sourceLabel:                `keepa-search (${withReviews.length} query-specific products, confidence=${Math.round(confidence * 100)}% — note: Keepa ranking ≠ Amazon SERP rank)`,
  }
}


// ── Sprint 1–3: Time-series helpers (all using confirmed KEEPA_EPOCH) ────────

// Decode a keepa timestamp (minutes from KEEPA_EPOCH) to a YYYY-MM string.
function keepaMinToYearMonth(keepaMins: number): string {
  return new Date((KEEPA_EPOCH + keepaMins * 60) * 1000).toISOString().slice(0, 7)
}

// Decode a keepa timestamp to listing age in months from today.
// Negative keepaMins = product listed before 2011 (valid — e.g. Optimum Nutrition
// Creatine listed Dec 2003 has listedSince ≈ -3820000).
function listedSinceToAgeMonths(listedSince: number): number | null {
  const unixSeconds = KEEPA_EPOCH + listedSince * 60
  if (unixSeconds <= 0) return null
  const ageSeconds = Date.now() / 1000 - unixSeconds
  if (ageSeconds <= 0) return null
  return Math.round(ageSeconds / (30.44 * 24 * 3600))
}

// Bucket a monthlySoldHistory flat array [t0,u0,t1,u1,...] into YYYY-MM →
// average-units-sold. Each calendar month may have multiple readings (Keepa
// updates intra-month); average them to get one value per month.
function bucketsFromHistory(msh: number[]): Array<{ ym: string; avg: number }> {
  const byYearMonth = new Map<string, number[]>()
  for (let i = 0; i + 1 < msh.length; i += 2) {
    const t = msh[i]
    const u = msh[i + 1]
    if (typeof t !== 'number' || typeof u !== 'number' || t <= 0 || u <= 0) continue
    const ym = keepaMinToYearMonth(t)
    const arr = byYearMonth.get(ym) ?? []
    arr.push(u)
    byYearMonth.set(ym, arr)
  }
  return Array.from(byYearMonth.entries())
    .map(([ym, vals]) => ({ ym, avg: vals.reduce((a: number, b: number) => a + b, 0) / vals.length }))
    .sort((a, b) => a.ym.localeCompare(b.ym))
}

// True year-over-year unit growth: compare the SAME 3-calendar-month window
// from this year against last year. Requires at least 14 distinct monthly
// buckets (12 months of history + 2 for alignment buffer).
// Returns null when insufficient data or flat base (division by zero).
function computeAnnualGrowthFromHistory(msh: number[]): number | null {
  const monthly = bucketsFromHistory(msh)
  if (monthly.length < 14) return null
  // "Recent" = last 3 calendar months available; "year ago" = same months -12
  const recent  = monthly.slice(-3)
  const yearAgo = monthly.slice(-15, -12)
  if (recent.length < 3 || yearAgo.length < 3) return null
  const recentAvg  = recent.reduce((s, m) => s + m.avg, 0) / recent.length
  const yearAgoAvg = yearAgo.reduce((s, m) => s + m.avg, 0) / yearAgo.length
  if (yearAgoAvg === 0) return null
  return Math.round(((recentAvg - yearAgoAvg) / yearAgoAvg) * 100 * 10) / 10
}

// 3-month rolling average vs 12-month rolling average.
// Positive = recent months running above the annual baseline (accelerating).
// Negative = recent months running below (decelerating).
// Requires at least 12 distinct monthly buckets.
function computeMomentum3m(msh: number[]): number | null {
  const monthly = bucketsFromHistory(msh)
  if (monthly.length < 12) return null
  const avg3m  = monthly.slice(-3).reduce((s, m) => s + m.avg, 0) / 3
  const avg12m = monthly.slice(-12).reduce((s, m) => s + m.avg, 0) / 12
  if (avg12m === 0) return null
  return Math.round(((avg3m / avg12m) - 1) * 100 * 10) / 10
}

// Seasonality from monthlySoldHistory with linear detrending.
// Detrending removes secular growth/decline before measuring within-year
// variation — otherwise a fast-growing product looks "seasonal" when it's
// just trending upward. Requires ≥12 distinct monthly buckets, ≥6 distinct
// calendar months.
// Returns pattern, top-2 peak months, and raw coefficient (0=flat, >0.5=strong).
function computeSeasonalityFromHistory(msh: number[]): {
  pattern:     'Perennial' | 'Seasonal'
  peakMonths:  string[]
  coefficient: number
  sampleSize:  number
} | null {
  const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthly = bucketsFromHistory(msh).slice(-24)
  if (monthly.length < 12) return null

  const n  = monthly.length
  const xs = monthly.map((_, i) => i)
  const ys = monthly.map(m => m.avg)

  // OLS linear trend: y = slope * x + intercept
  const sumX  = xs.reduce((a, b) => a + b, 0)
  const sumY  = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)
  const denom = n * sumX2 - sumX * sumX
  const slope     = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n

  // Subtract trend to isolate seasonal component
  const detrended = ys.map((y, i) => y - (slope * i + intercept))

  // Bucket detrended residuals by calendar month (1–12)
  const byMonth = new Map<number, number[]>()
  for (let i = 0; i < monthly.length; i++) {
    const m = parseInt(monthly[i].ym.slice(5))
    const arr = byMonth.get(m) ?? []
    arr.push(detrended[i])
    byMonth.set(m, arr)
  }
  if (byMonth.size < 6) return null  // too few distinct months

  const monthAvgs = Array.from(byMonth.entries())
    .map(([m, vals]) => ({ m, avg: vals.reduce((a: number, b: number) => a + b, 0) / vals.length }))
    .sort((a, b) => b.avg - a.avg)

  const maxAvg = monthAvgs[0].avg
  const minAvg = monthAvgs[monthAvgs.length - 1].avg
  const midpoint = (maxAvg + minAvg) / 2
  // Coefficient: peak-to-trough span relative to midpoint magnitude.
  // 0 = flat after detrending; >0.2 = mild seasonal; >0.5 = strong seasonal.
  const coefficient = Math.abs(midpoint) > 0
    ? Math.round(Math.abs((maxAvg - minAvg) / Math.abs(midpoint)) * 100) / 100
    : 0

  const pattern: 'Perennial' | 'Seasonal' = coefficient < 0.20 ? 'Perennial' : 'Seasonal'
  const peakMonths = monthAvgs.slice(0, 2).map(x => MONTH_NAMES[x.m])

  return { pattern, peakMonths, coefficient, sampleSize: monthly.length }
}

// Monthly review accrual from reviews.ratingCount time series.
// Finds the reading ~90 days ago and computes (latest - then) / elapsed_months.
// Handles Keepa's high-frequency updates (multiple readings per month).
// Returns null when: insufficient data, stale readings, or negative delta
// (can happen if Keepa corrects a prior over-count).
function computeMonthlyReviewAccrual(product: KeepaProduct): number | null {
  const rc = product.reviews?.ratingCount
  if (!Array.isArray(rc) || rc.length < 4) return null

  const decoded: Array<{ t: number; c: number }> = []
  for (let i = 0; i + 1 < rc.length; i += 2) {
    const t = rc[i]
    const c = rc[i + 1]
    if (typeof t === 'number' && t > 0 && typeof c === 'number' && c > 0) {
      decoded.push({ t, c })
    }
  }
  if (decoded.length < 2) return null

  const latest = decoded[decoded.length - 1]
  // 90 days = 90 × 24 × 60 = 129 600 Keepa minutes
  const TARGET_LOOKBACK = 129_600
  const targetMin = latest.t - TARGET_LOOKBACK

  // Find the first reading at or after the target window start
  const refReading = decoded.find(d => d.t >= targetMin)
  if (!refReading || refReading === latest) return null

  const reviewGain = latest.c - refReading.c
  if (reviewGain < 0) return null  // correction artifact

  const elapsedMins   = latest.t - refReading.t
  const elapsedMonths = elapsedMins / (30 * 24 * 60)  // 43 200 Keepa mins per 30-day month
  if (elapsedMonths < 0.5) return null   // < 2 weeks — too noisy

  return Math.round(reviewGain / elapsedMonths)
}

// Numeric median — returns null for empty arrays.
function numMedian(arr: number[]): number | null {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

const MIN_SUPPLY_VELOCITY_SAMPLE = 5

// Roadmap M2.3 — real listedSince distribution (share of the competitive
// set younger than 12/24 months), not just the pre-existing median
// (avg_listing_age_months on CompetitionSignal). Reuses the exact same
// listedSinceMonths array already collected for that median — zero new
// Keepa tokens spent.
//
// entry_velocity is a single-snapshot proxy, not a true two-point-in-time
// delta (this provider makes one request per analysis; a real "was the
// entry rate higher 6 months ago" needs a persisted historical snapshot,
// which doesn't exist for this signal). The proxy: if new listings arrived
// at a constant rate over the trailing 24 months, exactly half of them
// would fall in the trailing 12 (young_listing_pct_12m / young_listing_pct_24m
// ≈ 0.5). A ratio meaningfully above 0.5 means more than half of the last
// 24 months' entrants are concentrated in the most recent 12 — the entry
// rate is accelerating relative to the earlier half of the window; below
// 0.5 means it's decelerating. This is real arithmetic on real per-product
// listedSince values, not an invented trend line.
export function computeSupplyVelocity(listedSinceMonths: number[]): SupplyVelocitySignal | undefined {
  if (listedSinceMonths.length < MIN_SUPPLY_VELOCITY_SAMPLE) return undefined

  const under12 = listedSinceMonths.filter(m => m <= 12).length
  const under24 = listedSinceMonths.filter(m => m <= 24).length
  const total   = listedSinceMonths.length

  const young_listing_pct_12m = Math.round((under12 / total) * 100) / 100
  const young_listing_pct_24m = Math.round((under24 / total) * 100) / 100

  let entry_velocity_ratio: number | undefined
  let entry_velocity: SupplyVelocitySignal['entry_velocity']
  if (under24 > 0) {
    entry_velocity_ratio = Math.round((under12 / under24) * 100) / 100
    entry_velocity = entry_velocity_ratio > 0.6 ? 'Accelerating'
      : entry_velocity_ratio < 0.4 ? 'Decelerating'
      : 'Stable'
  }

  // Score: fewer young listings = harder for a new entrant to differentiate
  // against an entrenched field (lower score); many young listings = an
  // actively-forming, still-open competitive set (higher score). Confidence
  // scales with sample size, same tiering convention as dataConfidence-style
  // functions elsewhere in this codebase.
  const score = Math.round(young_listing_pct_24m * 10)
  const confidence = total >= 20 ? 0.75 : total >= 10 ? 0.6 : 0.45

  return {
    score,
    confidence,
    young_listing_pct_12m,
    young_listing_pct_24m,
    entry_velocity_ratio,
    entry_velocity,
    sample_size: total,
  }
}

// ── Core provider class ───────────────────────────────────────────

export class KeepaProvider implements SignalProvider {
  readonly name    = 'keepa'
  readonly enabled = !!process.env.KEEPA_API_KEY

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    if (!this.enabled) return null

    const nodeId = CATEGORY_NODES[ctx.categoryId ?? '']
    if (!nodeId) {
      console.log('Keepa: skipped — no verified category node mapping', { categoryId: ctx.categoryId })
      return null
    }

    const category = ctx.query
    const key = process.env.KEEPA_API_KEY!

    try {
      // Phase 2: fetch category bestsellers AND query-specific ASINs in parallel.
      // /bestsellers gives category-level demand/growth/pricing/revenue signals.
      // /search gives query-specific competitor products for review_velocity.
      const [bestsellerAsins, searchAsins] = await Promise.all([
        this.fetchBestsellers(key, nodeId),
        this.fetchSearchAsins(key, category),
      ])

      if (bestsellerAsins.length < 5 && searchAsins.length === 0) {
        console.log('Keepa: too few ASINs from both bestsellers and search', {
          category, nodeId, bestsellerCount: bestsellerAsins.length,
        })
        return null
      }

      // Merge: search-specific first (more query-relevant), then bestsellers not
      // already in the search results. Cap at 10 total for a single /product call.
      const searchSet     = new Set(searchAsins)
      const combinedAsins = [
        ...searchAsins.slice(0, 5),
        ...bestsellerAsins.filter(a => !searchSet.has(a)).slice(0, 5),
      ].slice(0, 10)

      if (combinedAsins.length === 0) return null

      // Run /product and /category in parallel — /category is 1 token, non-blocking.
      // /product timeout extended to 55s to accommodate up to 10 ASINs.
      const [allProducts, categoryStats] = await Promise.all([
        this.fetchProducts(key, combinedAsins, 55_000),
        this.fetchCategoryStats(key, nodeId),
      ])

      // Split: category-level signals use bestseller products;
      // review_velocity uses query-specific products.
      const catProducts   = allProducts.filter(p => bestsellerAsins.slice(0, 5).includes(p.asin))
      const queryProducts = allProducts.filter(p => searchSet.has(p.asin))

      // Need at least some valid data to proceed
      const validCat = catProducts.filter(p => statVal(p.stats, 'current', CSV.BSR) !== null)

      // Phase 2: when bestsellers returned nothing (unusual but possible for very
      // new categories), fall back to query products for category signals too.
      const signaledProducts = validCat.length >= 2 ? validCat : allProducts.filter(
        p => statVal(p.stats, 'current', CSV.BSR) !== null,
      )

      if (signaledProducts.length < 2 && queryProducts.length < 2) {
        console.log('Keepa: too few products with BSR data', {
          category, cat: validCat.length, query: queryProducts.length,
        })
        return null
      }

      return this.computeSignals(signaledProducts, queryProducts, category, categoryStats ?? undefined)
    } catch (e) {
      console.error('Keepa provider error', { category, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  // ── Private: API calls ────────────────────────────────────────

  private async fetchBestsellers(key: string, nodeId: number): Promise<string[]> {
    const url =
      `${KEEPA_API}/bestsellers` +
      `?key=${encodeURIComponent(key)}` +
      `&domain=1` +
      `&category=${nodeId}`

    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) {
      console.error('Keepa bestsellers error', { status: res.status, nodeId })
      return []
    }
    const data: KeepaBestsellerResponse = await res.json()
    return data.bestSellersList?.asinList ?? []
  }

  private async fetchProducts(key: string, asins: string[], timeoutMs = 55_000): Promise<KeepaProduct[]> {
    // stats=365 gives current, avg90, avg365 arrays.
    // rating=1 includes RATING/COUNT_REVIEWS history (CSV[16]/[17]).
    // Token cost: ~5 tokens/product × up to 10 products = ~50 tokens.
    const url =
      `${KEEPA_API}/product` +
      `?key=${encodeURIComponent(key)}` +
      `&domain=1` +
      `&asin=${asins.join(',')}` +
      `&stats=365` +
      `&rating=1`

    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      console.error('Keepa product error', { status: res.status, asins: asins.length })
      return []
    }
    const data: KeepaProductResponse = await res.json()
    return data.products ?? []
  }

  // Sprint 2: fetch category-level aggregate stats via /category endpoint.
  // 1 token cost. Returns soldByAmazonPercent, isFBAPercent, topBrands, etc.
  // Fault-tolerant: returns null on any failure so the main signal path is
  // not blocked by a category stats timeout.
  private async fetchCategoryStats(key: string, nodeId: number): Promise<KeepaCategoryData | null> {
    const url =
      `${KEEPA_API}/category` +
      `?key=${encodeURIComponent(key)}` +
      `&domain=1` +
      `&category=${nodeId}`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) {
        console.log('Keepa category stats: non-OK', { status: res.status, nodeId })
        return null
      }
      const data = await res.json() as { categories?: Record<string, unknown> }
      const cat = data.categories?.[String(nodeId)] as KeepaCategoryData | undefined
      return cat ?? null
    } catch (e) {
      console.log('Keepa category stats: error', { nodeId, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  // Phase 2: query-specific product search from Keepa's database.
  // Returns ASINs matching the query term; full details fetched via fetchProducts().
  // UNCONFIRMED response shape — logs actual keys on first call so we can validate.
  private async fetchSearchAsins(key: string, query: string): Promise<string[]> {
    const url =
      `${KEEPA_API}/search` +
      `?key=${encodeURIComponent(key)}` +
      `&domain=1` +
      `&type=product` +
      `&term=${encodeURIComponent(query)}`

    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) {
      // Non-fatal: bestsellers can still power all category-level signals
      console.log('Keepa search: non-OK status', { status: res.status, query })
      return []
    }

    const data: KeepaSearchResponse = await res.json()

    // Log actual top-level keys on every call until the format is confirmed live
    console.log('Keepa search response shape', {
      keys:  Object.keys(data),
      hasProducts:  Array.isArray(data.products),
      hasAsinList:  Array.isArray(data.asinList),
      productCount: Array.isArray(data.products) ? data.products.length : null,
      asinCount:    Array.isArray(data.asinList)  ? data.asinList.length  : null,
      totalResults: data.totalResults,
      query,
    })

    // Handle both known possible response formats
    if (Array.isArray(data.products) && data.products.length > 0) {
      return data.products.map(p => p.asin).filter(Boolean).slice(0, 8)
    }
    if (Array.isArray(data.asinList) && data.asinList.length > 0) {
      return data.asinList.slice(0, 8)
    }

    console.log('Keepa search: empty or unknown response format', { query })
    return []
  }

  // ── Private: compute standardized signals ─────────────────────
  //
  // bestsellerProducts: from /bestsellers — drives category-level signals
  //                     (demand, competition, growth, pricing, revenue, seasonality)
  // queryProducts:      from /search — drives review_velocity (query-specific
  //                     competition and top_competitors list for Consumer Intelligence)

  private computeSignals(
    bestsellerProducts: KeepaProduct[],
    queryProducts:      KeepaProduct[],
    query:              string,
    categoryStats?:     KeepaCategoryData,
  ): ProviderSignals {
    // ── Arrays for category-level signals (bestsellerProducts) ──────────────
    const bsrs90:       number[] = []
    const bsrs365:      number[] = []
    const offers:       number[] = []    // current offer count — all products
    const offersAvg90:  number[] = []    // 90-day avg offer count — for seller trend
    const offersAvg365: number[] = []    // 365-day avg offer count — for seller trend
    const usedCounts:   number[] = []    // count of used offers — commodity proxy
    const prices:       number[] = []    // relevant-gated prices (avg90 buy box / amazon)
    const allPrices:    number[] = []    // ungated — for revenue fallback
    const fbaFloors:    number[] = []    // NEW_FBA avg90 — FBA price floor per product
    const listPrices:   number[] = []    // LIST_PRICE avg90 — MSRP per product
    const monthlySolds: number[] = []
    // Relevance-gated arrays (query-specific signals)
    const relBsrs90:        number[] = []
    const relBsrs365:       number[] = []
    const relOffers:        number[] = []
    const relMonthlySolds:  number[] = []
    const relMomentum90dPcts: number[] = []
    const productRevenues: number[] = []
    const ratings:        number[] = []
    const reviewCounts:   number[] = []   // ungated — category-wide baseline
    const relReviewCounts: number[] = []  // gated — query-specific competition barrier
    const momentum90dPcts: number[] = []
    const fbaPickPackFees: number[] = []
    const referralFeePcts: number[] = []
    const prices365:       number[] = []
    // Phase 1: per-unit prices
    const unitPrices:     number[] = []   // price / numberOfItems (relevance-gated)
    const fbaFloorUnits:  number[] = []   // NEW_FBA / numberOfItems (relevance-gated)
    // Sprint 1–3: new time-series and metadata collections (bestsellerProducts)
    const annualGrowthRates:   number[] = []  // YoY% from monthlySoldHistory
    const momentum3mPcts:      number[] = []  // 3m vs 12m rolling avg %
    const snsFlags:            boolean[] = [] // isSNS boolean
    const listedSinceMonths:   number[] = []  // listing age in months
    const oosAmazonPcts:       number[] = []  // outOfStockPercentage90[0]
    const buyBoxAmazonFlags:   boolean[] = [] // buyBoxIsAmazon or sellerId check
    const variationCounts:     number[] = []  // variations[].length

    for (const p of bestsellerProducts) {
      const s = p.stats

      const bsr90  = statVal(s, 'avg90',  CSV.BSR)
      const bsr365 = statVal(s, 'avg365', CSV.BSR)
      if (bsr90  !== null) bsrs90.push(bsr90)
      if (bsr365 !== null) bsrs365.push(bsr365)

      const momentum90d = s?.deltaPercent90_monthlySold
      if (typeof momentum90d === 'number' && momentum90d !== NO_DATA) momentum90dPcts.push(momentum90d)

      const fbaFee = keepaPrice(p.fbaFees?.pickAndPackFee)
      if (fbaFee !== null && fbaFee > 0) fbaPickPackFees.push(fbaFee)
      if (typeof p.referralFeePercentage === 'number' && p.referralFeePercentage > 0) {
        referralFeePcts.push(p.referralFeePercentage)
      }

      // Phase 1: seller count history (3-point trend)
      const offerCurrent = statVal(s, 'current', CSV.NEW_OFFER_CNT)
      const offerAvg90   = statVal(s, 'avg90',   CSV.NEW_OFFER_CNT)
      const offerAvg365  = statVal(s, 'avg365',  CSV.NEW_OFFER_CNT)
      if (offerCurrent !== null && offerCurrent > 0) offers.push(offerCurrent)
      if (offerAvg90   !== null && offerAvg90   > 0) offersAvg90.push(offerAvg90)
      if (offerAvg365  !== null && offerAvg365  > 0) offersAvg365.push(offerAvg365)

      // Phase 1: used offer count (commodity / aging signal)
      const usedCount = statVal(s, 'current', CSV.COUNT_USED)
      if (usedCount !== null && usedCount > 0) usedCounts.push(usedCount)

      const priceAmazon = keepaPrice(statVal(s, 'avg90', CSV.AMAZON_PRICE) ?? undefined)
      const priceBuyBox = keepaPrice(statVal(s, 'avg90', CSV.BUYBOX_PRICE) ?? undefined)
      const price = priceAmazon ?? priceBuyBox
      if (price !== null && price > 0) allPrices.push(price)

      // Phase 1: FBA floor price and list price
      const fbaFloor  = keepaPrice(statVal(s, 'avg90', CSV.NEW_FBA)     ?? undefined)
      const listPrice = keepaPrice(statVal(s, 'avg90', CSV.LIST_PRICE)   ?? undefined)
      if (fbaFloor  !== null && fbaFloor  > 0) fbaFloors.push(fbaFloor)
      if (listPrice !== null && listPrice > 0) listPrices.push(listPrice)

      const price365Amazon = keepaPrice(statVal(s, 'avg365', CSV.AMAZON_PRICE) ?? undefined)
      const price365BuyBox = keepaPrice(statVal(s, 'avg365', CSV.BUYBOX_PRICE) ?? undefined)
      const price365 = price365Amazon ?? price365BuyBox

      if (p.monthlySold && p.monthlySold > 0) monthlySolds.push(p.monthlySold)

      const rating      = statVal(s, 'current', CSV.RATING)
      const reviewCount = statVal(s, 'current', CSV.COUNT_REVIEWS)
      if (rating !== null && rating > 0) ratings.push(rating / 10)
      if (reviewCount !== null && reviewCount > 0) reviewCounts.push(reviewCount)

      const isRelevantBestseller =
        !!p.title &&
        checkKeywordRelevance(query, p.title).allowed &&
        hasWordOverlap(query, p.title)

      if (isRelevantBestseller) {
        if (price   !== null && price   > 0) prices.push(price)
        if (price365 !== null && price365 > 0) prices365.push(price365)
        if (price !== null && price > 0 && p.monthlySold && p.monthlySold > 0) {
          productRevenues.push(price * p.monthlySold)
        }
        if (bsr90  !== null) relBsrs90.push(bsr90)
        if (bsr365 !== null) relBsrs365.push(bsr365)
        if (offerCurrent !== null && offerCurrent > 0) relOffers.push(offerCurrent)
        if (p.monthlySold && p.monthlySold > 0) relMonthlySolds.push(p.monthlySold)
        if (typeof momentum90d === 'number' && momentum90d !== NO_DATA) relMomentum90dPcts.push(momentum90d)
        if (reviewCount !== null && reviewCount > 0) relReviewCounts.push(reviewCount)

        // Phase 1: price-per-unit (relevance-gated)
        if (price !== null && price > 0) {
          unitPrices.push(unitPrice(price, p.numberOfItems))
        }
        if (fbaFloor !== null && fbaFloor > 0) {
          fbaFloorUnits.push(unitPrice(fbaFloor, p.numberOfItems))
        }
      }

      // ── Sprint 1–3: new time-series and metadata (all bestsellerProducts) ──

      // P1 (isSNS): Direct Subscribe & Save enrollment flag.
      if (typeof p.isSNS === 'boolean') snsFlags.push(p.isSNS)

      // P1 (monthlySoldHistory): YoY growth and 3m momentum.
      if (Array.isArray(p.monthlySoldHistory) && (p.monthlySoldHistory as number[]).length >= 4) {
        const msh = p.monthlySoldHistory as number[]
        const growth = computeAnnualGrowthFromHistory(msh)
        const mom3m  = computeMomentum3m(msh)
        if (growth !== null) annualGrowthRates.push(growth)
        if (mom3m  !== null) momentum3mPcts.push(mom3m)
      }

      // P4 (listedSince): Listing age in months.
      if (typeof p.listedSince === 'number') {
        const ageMonths = listedSinceToAgeMonths(p.listedSince)
        if (ageMonths !== null && ageMonths > 0) listedSinceMonths.push(ageMonths)
      }

      // P5 (outOfStockPercentage90[0]): Amazon price slot OOS%.
      const oos90 = s?.outOfStockPercentage90
      if (Array.isArray(oos90) && typeof oos90[0] === 'number' && oos90[0] >= 0) {
        oosAmazonPcts.push(oos90[0])
      }

      // P6 (buyBoxIsAmazon): Amazon buy-box detection without buybox=1 param.
      const bbIsAmazon = s?.buyBoxIsAmazon === true || s?.buyBoxSellerId === 'ATVPDKIKX0DER'
      buyBoxAmazonFlags.push(bbIsAmazon)

      // P9 (variations[]): Variation family size.
      if (Array.isArray(p.variations)) {
        variationCounts.push((p.variations as unknown[]).length)
      }
    }

    const avg = (arr: number[]): number | null =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    const avgBsr90       = avg(bsrs90)
    const avgBsr365      = avg(bsrs365)
    const avgOffers      = avg(offers)
    const avgPrice       = avg(prices)
    const avgAllPrice    = avg(allPrices)
    const avgPrice365    = avg(prices365)
    const avgMonthlySold = avg(monthlySolds)
    const avgMomentum90dRaw = avg(momentum90dPcts)
    const avgMomentum90d = avgMomentum90dRaw !== null ? Math.round(avgMomentum90dRaw * 10) / 10 : null
    const avgFbaFee      = avg(fbaPickPackFees)
    const avgReferralFee = avg(referralFeePcts)
    const avgRelBsr90        = avg(relBsrs90)
    const avgRelBsr365       = avg(relBsrs365)
    const avgRelOffers       = avg(relOffers)
    const avgRelMonthlySold  = avg(relMonthlySolds)
    const avgRelMomentum90dRaw = avg(relMomentum90dPcts)
    const avgRelMomentum90d  = avgRelMomentum90dRaw !== null ? Math.round(avgRelMomentum90dRaw * 10) / 10 : null
    const avgRelReviewCount  = avg(relReviewCounts)
    const avgRating          = avg(ratings)
    const avgReviewCount     = avg(reviewCounts)

    // Phase 1: new field aggregates
    const avgFbaFloor         = avg(fbaFloors)
    const avgListPrice        = avg(listPrices)
    const avgOffersAvg90      = avg(offersAvg90)
    const avgOffersAvg365     = avg(offersAvg365)
    const avgOffersCurrentNum = avg(offers)
    const avgUnitPrice        = avg(unitPrices)
    const avgFbaFloorUnit     = avg(fbaFloorUnits)
    const minUnitPrice        = unitPrices.length ? Math.min(...unitPrices) : null
    const maxUnitPrice        = unitPrices.length ? Math.max(...unitPrices) : null

    // Phase 1: seller count trend from 3-point offer history
    const trend = sellerCountTrend(avgOffersCurrentNum, avgOffersAvg90, avgOffersAvg365)

    // Phase 1: brand analysis from bestsellerProducts
    const allBrandShare = topBrandReviewShare(bestsellerProducts)
    const allBrandCount = countDistinctBrands(bestsellerProducts)
    const maturity      = computeMarketMaturity(avgReviewCount, allBrandCount)

    // ── Sprint 1–3: new aggregates ────────────────────────────────────────────

    // P3: SNS enrollment rate across bestsellers.
    const snsPct = snsFlags.length > 0
      ? Math.round((snsFlags.filter(Boolean).length / snsFlags.length) * 100) / 100
      : null

    // P1: YoY growth and 3m momentum — median across relevant bestsellers.
    const medAnnualGrowth = numMedian(annualGrowthRates)
    const medMomentum3m   = numMedian(momentum3mPcts)

    // P4: Median listing age.
    const medListingAgeMonths = numMedian(listedSinceMonths)

    // Roadmap M2.3: the real listedSince distribution (not just the median
    // above) — same underlying array, zero new Keepa tokens.
    const supply_velocity = computeSupplyVelocity(listedSinceMonths)

    // P5: Median Amazon OOS%.
    const medAmazonOosPct = numMedian(oosAmazonPcts)

    // P6: Fraction of bestsellers where Amazon holds buy box.
    const amazonBuyboxPct = buyBoxAmazonFlags.length > 0
      ? Math.round((buyBoxAmazonFlags.filter(Boolean).length / buyBoxAmazonFlags.length) * 100) / 100
      : null

    // P9: Median variation family size.
    const medVariationCount = numMedian(variationCounts)

    // Sprint 1 (P2): Monthly review accrual from reviews.ratingCount time series
    // on query-specific products. These products are the most query-relevant sample.
    const queryReviewAccruals: number[] = []
    for (const p of queryProducts) {
      const accrual = computeMonthlyReviewAccrual(p)
      if (accrual !== null && accrual >= 0) queryReviewAccruals.push(accrual)
    }
    const medMonthlyReviewAccrual = numMedian(queryReviewAccruals)
    const monthlyReviewsStr = medMonthlyReviewAccrual !== null
      ? `${Math.round(medMonthlyReviewAccrual)}/product/month`
      : undefined

    // Sprint 3 (P1 extension): Seasonality from monthlySoldHistory.
    // Collect per-product seasonality results and take the most representative.
    // Prefer this over BSR-based seasonality when available (more direct signal).
    const histSeasonalityResults: ReturnType<typeof computeSeasonalityFromHistory>[] = []
    for (const p of bestsellerProducts) {
      if (Array.isArray(p.monthlySoldHistory)) {
        const r = computeSeasonalityFromHistory(p.monthlySoldHistory as number[])
        if (r !== null) histSeasonalityResults.push(r)
      }
    }
    // Aggregate: majority-vote for pattern, median coefficient, union of top peak months.
    let histSeasonality: {
      pattern: 'Perennial' | 'Seasonal'; peakMonths: string[]; coefficient: number
    } | null = null
    if (histSeasonalityResults.length >= 2) {
      const seasonalCount  = histSeasonalityResults.filter(r => r!.pattern === 'Seasonal').length
      const perennialCount = histSeasonalityResults.length - seasonalCount
      const pattern: 'Perennial' | 'Seasonal' = seasonalCount > perennialCount ? 'Seasonal' : 'Perennial'
      const medCoeff = numMedian(histSeasonalityResults.map(r => r!.coefficient)) ?? 0
      // Collect and deduplicate peak months (top-2 most frequent across products)
      const peakFreq = new Map<string, number>()
      for (const r of histSeasonalityResults) {
        for (const m of r!.peakMonths) peakFreq.set(m, (peakFreq.get(m) ?? 0) + 1)
      }
      const peakMonths = Array.from(peakFreq.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([m]) => m)
      histSeasonality = { pattern, peakMonths, coefficient: Math.round(medCoeff * 100) / 100 }
    }

    // Phase 1: list price discount (positive = market selling below MSRP = commodity pressure)
    const listPriceDiscountPct =
      avgListPrice !== null && avgPrice !== null && avgListPrice > 0
        ? Math.round(((avgListPrice - avgPrice) / avgListPrice) * 100 * 10) / 10
        : null

    // ── Demand signal ──
    let demand: DemandSignal | undefined
    if (avgRelBsr90 !== null) {
      const sc = bsrToDemandScore(avgRelBsr90)
      demand = {
        score:          avgRelMonthlySold !== null && avgRelMonthlySold > 50_000 ? 9
                      : avgRelMonthlySold !== null && avgRelMonthlySold > 10_000 ? 7
                      : sc,
        confidence:     relBsrs90.length >= 5 ? 0.82 : 0.65,
        trend:          bsrDeltaYoY(avgRelBsr90, avgRelBsr365) ?? 'Stable',
        signal:         sc >= 7 ? 'Strong' : sc >= 5 ? 'Moderate' : 'Weak',
        primary_signal: avgRelMonthlySold !== null ? 'monthlySold' : 'bsr',
        // Sprint 1: monthlySoldHistory-derived growth and momentum signals.
        // medAnnualGrowth: same 3-month window YoY (requires 14+ months of history).
        // medMomentum3m: 3m rolling avg vs 12m rolling avg (leading indicator).
        annual_growth_rate: medAnnualGrowth   !== null ? medAnnualGrowth   : undefined,
        momentum_3m_pct:    medMomentum3m     !== null ? medMomentum3m     : undefined,
      }
    }

    // ── Competition signal (v2.7.0 + Phase 1/3 brand enrichment) ──
    let competition: CompetitionSignal | undefined
    {
      const catAvgReviewCount = avg(reviewCounts)
      const reviewBarrierScore = avgRelReviewCount !== null ? reviewCountToBarrierScore(avgRelReviewCount)
                               : catAvgReviewCount  !== null ? reviewCountToBarrierScore(catAvgReviewCount)
                               : null
      const densityScore = relBsrs90.length > 0 ? densityToScore(relBsrs90.length) : null
      const offersScore  = avgRelOffers !== null ? Math.min(6, offersToDomainScore(avgRelOffers)) : null

      if (reviewBarrierScore !== null || densityScore !== null || offersScore !== null) {
        let sc: number
        if (reviewBarrierScore !== null && densityScore !== null) {
          sc = Math.round(reviewBarrierScore * 0.6 + densityScore * 0.4)
        } else if (reviewBarrierScore !== null) {
          sc = reviewBarrierScore
        } else if (densityScore !== null) {
          sc = densityScore
        } else {
          sc = offersScore!
        }
        sc = Math.max(1, Math.min(9, sc))

        const saturation: CompetitionSignal['saturation'] =
          sc <= 2 ? 'High' :
          sc <= 4 ? 'Medium-High' :
          sc <= 6 ? 'Medium' : 'Low'

        const revCountForLabel = avgRelReviewCount ?? catAvgReviewCount
        const barrier: CompetitionSignal['barrier'] = offersToBarrier(revCountForLabel ?? 0)

        const competing_brands = revCountForLabel !== null
          ? `${Math.round(revCountForLabel).toLocaleString()} avg reviews/top competitor`
          : relBsrs90.length > 0
          ? `${relBsrs90.length} relevant products in category`
          : `${Math.round(avgRelOffers ?? 0)} sellers/listing`

        competition = {
          score:                  sc,
          confidence:             (relReviewCounts.length >= 5 || relBsrs90.length >= 5) ? 0.72 : 0.55,
          competing_brands,
          saturation,
          barrier,
          // Phase 1/3: new Keepa-derived fields
          distinct_brand_count:    allBrandCount > 0 ? allBrandCount : undefined,
          top_brand_review_share:  allBrandShare ?? undefined,
          seller_count_trend:      trend ?? undefined,
          market_maturity:         maturity ?? undefined,
          // Sprint 2: listedSince, OOS%, buybox, variation size.
          avg_listing_age_months:  medListingAgeMonths !== null ? Math.round(medListingAgeMonths) : undefined,
          amazon_oos_pct:          medAmazonOosPct     !== null ? Math.round(medAmazonOosPct)     : undefined,
          amazon_buybox_pct:       amazonBuyboxPct     !== null ? amazonBuyboxPct                 : undefined,
          // Sprint 3: variation family size.
          avg_variation_count:     medVariationCount   !== null ? Math.round(medVariationCount)   : undefined,
        }
      }
    }

    // ── Growth signal ──
    let growth: GrowthSignal | undefined
    if (avgRelBsr90 !== null && avgRelBsr365 !== null) {
      const trendStr  = bsrDeltaYoY(avgRelBsr90, avgRelBsr365)
      const pctChange = ((avgRelBsr365 - avgRelBsr90) / avgRelBsr365) * 100
      const sc =
        pctChange > 15  ? 8 :
        pctChange > 5   ? 7 :
        Math.abs(pctChange) <= 5 ? 6 :
        pctChange < -15 ? 3 : 4
      const momentum: GrowthSignal['momentum'] =
        avgRelMomentum90d !== null
          ? (avgRelMomentum90d > 5 ? 'Accelerating' : avgRelMomentum90d < -5 ? 'Decelerating' : 'Stable')
          : (pctChange > 5  ? 'Accelerating' : pctChange < -5 ? 'Decelerating' : 'Stable')
      growth = {
        score:            sc,
        confidence:       Math.min(relBsrs90.length, relBsrs365.length) >= 5 ? 0.72 : 0.50,
        yoy_change:       trendStr ?? 'Stable',
        momentum,
        momentum_90d_pct: avgRelMomentum90d,
      }
    }

    // ── Pricing signal (Phase 1: + per-unit range, FBA floor, list discount) ──
    let pricing: PricingSignal | undefined
    if (avgPrice !== null && prices.length > 0) {
      const minP = Math.min(...prices)
      const maxP = Math.max(...prices)

      pricing = {
        score:          avgPrice > 35 ? 7 : avgPrice > 20 ? 6 : 5,
        confidence:     prices.length >= 5 ? 0.85 : 0.62,
        avg_price:      `$${Math.round(avgPrice)}`,
        price_range:    `$${Math.round(minP)}–$${Math.round(maxP)}`,
        premium_viable: maxP > 35 && maxP > avgPrice * 1.3,
        // Phase 1: new fields
        price_per_unit_range: (() => {
          if (minUnitPrice === null || maxUnitPrice === null) return undefined
          // Only include if pack sizes were actually observed (i.e. at least one product
          // had numberOfItems > 1; if all are 1, this duplicates price_range)
          const anyPacked = bestsellerProducts.some(p => typeof p.numberOfItems === 'number' && p.numberOfItems > 1)
          if (!anyPacked) return undefined
          return `$${minUnitPrice.toFixed(2)}–$${maxUnitPrice.toFixed(2)}/unit`
        })(),
        fba_price_floor:        avgFbaFloor !== null ? `$${Math.round(avgFbaFloor)}` : undefined,
        list_price_discount_pct: listPriceDiscountPct ?? undefined,
      }
    }

    // ── Revenue signal ──
    const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k/mo` : `$${Math.round(n)}/mo`
    let revenue: RevenueSignal | undefined
    if (productRevenues.length > 0 || avgRating !== null || avgReviewCount !== null ||
        (avgPrice !== null && avgMonthlySold !== null)) {
      const topRevenue = productRevenues.length ? Math.max(...productRevenues) : null
      const perProductAvg = avg(productRevenues)
      const avgRevenue =
        perProductAvg ??
        (avgPrice !== null && avgMonthlySold !== null
          ? avgPrice * avgMonthlySold
          : avgAllPrice !== null && avgMonthlySold !== null
          ? avgAllPrice * avgMonthlySold
          : null)
      const isPerProductRevenue  = perProductAvg !== null
      const isRelevantPriceFall  = perProductAvg === null && avgPrice !== null && avgRevenue !== null
      const isCategoryPriceFall  = perProductAvg === null && avgPrice === null  && avgRevenue !== null
      revenue = {
        score:      avgRevenue !== null ? (avgRevenue > 50_000 ? 8 : avgRevenue > 15_000 ? 6 : avgRevenue > 5_000 ? 4 : 2) : 0,
        confidence: isPerProductRevenue ? (productRevenues.length >= 5 ? 0.7 : 0.5)
                  : isRelevantPriceFall  ? 0.35
                  : isCategoryPriceFall  ? 0.20
                  : 0,
        est_monthly_revenue:    avgRevenue !== null ? fmt(avgRevenue) : undefined,
        top_seller_revenue:     topRevenue !== null ? fmt(topRevenue) : undefined,
        est_monthly_units_sold: avgMonthlySold !== null ? `${Math.round(avgMonthlySold).toLocaleString()} units/mo` : undefined,
        avg_rating:             avgRating !== null ? avgRating.toFixed(1) : undefined,
        avg_review_count:       avgReviewCount !== null ? Math.round(avgReviewCount) : undefined,
        avg_fba_pick_pack_fee:  avgFbaFee !== null ? `$${avgFbaFee.toFixed(2)}` : undefined,
        avg_referral_fee_pct:   avgReferralFee !== null ? Math.round(avgReferralFee * 10) / 10 : undefined,
        revenue_sample_count:   productRevenues.length > 0 ? productRevenues.length : undefined,
        revenue_is_category_estimate: !isPerProductRevenue && avgRevenue !== null ? true : undefined,
        revenue_estimate_unavailable: avgRevenue === null ? true : undefined,
        ...(avgPrice !== null && avgPrice365 !== null && prices.length >= 3 && prices365.length >= 3 && {
          price_avg_90d:         Math.round(avgPrice * 100) / 100,
          price_avg_365d:        Math.round(avgPrice365 * 100) / 100,
          price_compression_pct: Math.round(((avgPrice - avgPrice365) / avgPrice365) * 100 * 10) / 10,
        }),
        // Sprint 2: SNS enrollment rate (P3) and /category aggregate stats (P7).
        sns_enrolled_pct:            snsPct !== null ? snsPct : undefined,
        category_fba_pct:            categoryStats?.isFBAPercent !== undefined
          ? Math.round(categoryStats.isFBAPercent * 10) / 10
          : undefined,
        category_amazon_seller_pct:  categoryStats?.soldByAmazonPercent !== undefined
          ? Math.round(categoryStats.soldByAmazonPercent * 10) / 10
          : undefined,
      }
    }

    // ── Phase 4 / Sprint 3: Seasonality signal ──
    // Prefer monthlySoldHistory-based seasonality (direct unit data, higher fidelity)
    // over BSR-based proxy when 2+ products have enough history. Fall back to BSR
    // method when history is insufficient or too few products have it.
    let seasonality: SeasonalitySignal | undefined
    if (histSeasonality !== null) {
      // History-based: compute score from seasonal coefficient (0=flat, >0.5=strong).
      // Perennial → high score (stable year-round demand = ideal for subscription).
      const coeff = histSeasonality.coefficient
      const histScore =
        histSeasonality.pattern === 'Perennial' ? 9 :
        coeff < 0.35 ? 7 :
        coeff < 0.50 ? 5 : 3
      seasonality = {
        score:               histScore,
        confidence:          Math.min(histSeasonalityResults.length, 5) >= 3 ? 0.75 : 0.60,
        pattern:             histSeasonality.pattern,
        peak_months:         histSeasonality.peakMonths.length > 0 ? histSeasonality.peakMonths : undefined,
        seasonal_coefficient: histSeasonality.coefficient,
      }
    } else {
      // BSR-based fallback (existing logic).
      const seasonalityResult = computeSeasonality(
        avgRelBsr90,
        avgRelBsr365,
        avgRelMomentum90d,
        Math.min(relBsrs90.length, relBsrs365.length),
      )
      seasonality = seasonalityResult
        ? { score: seasonalityResult.score, confidence: seasonalityResult.confidence, pattern: seasonalityResult.pattern }
        : undefined
    }

    // ── Phase 2/3: review_velocity from query-specific search products ──
    // Only populated when /search returned usable products — absent otherwise.
    // When Apify also runs and returns its own review_velocity, the signal engine
    // blends them (Apify's higher confidence dominates the string fields).
    const rvResult = computeKeepaReviewVelocity(queryProducts, query)
    const review_velocity: ReviewVelocitySignal | undefined = rvResult
      ? {
          score:                      rvResult.score,
          confidence:                 rvResult.confidence,
          avg_rating:                 rvResult.avg_rating,
          sentiment:                  rvResult.sentiment,
          meaningful_competitor_count: rvResult.meaningful_competitor_count,
          avg_review_count:           rvResult.avg_review_count,
          review_concentration_ratio: rvResult.review_concentration_ratio,
          top_competitors:            rvResult.top_competitors,
          // Sprint 1 (P2): monthly review accrual from reviews.ratingCount time series.
          // Previously always null — now populated from Keepa's high-frequency review
          // tracking data. Feeds Market Accessibility in scoring.ts (displayed in UI).
          monthly_reviews:            monthlyReviewsStr,
        }
      : undefined

    // ── Overall provider confidence ──
    const dims = [demand, competition, growth, pricing, revenue].filter(Boolean)
    const overallConf = dims.length
      ? dims.reduce((s, d) => s + d!.confidence, 0) / dims.length
      : 0.3

    // ── Verbose logging for field validation ──
    console.log('Keepa signals computed', {
      products:            bestsellerProducts.length,
      query_products:      queryProducts.length,
      rel_samples:         relBsrs90.length,
      cat_bsr_samples:     bsrs90.length,
      // Phase 1 new fields:
      avgFbaFloor:         avgFbaFloor !== null ? `$${Math.round(avgFbaFloor)}` : null,
      avgListPrice:        avgListPrice !== null ? `$${Math.round(avgListPrice)}` : null,
      listPriceDiscountPct: listPriceDiscountPct !== null ? `${listPriceDiscountPct}%` : null,
      avgUnitPrice:        avgUnitPrice !== null ? `$${avgUnitPrice.toFixed(2)}/unit` : null,
      sellerCountTrend:    trend,
      distinctBrands:      allBrandCount,
      topBrandShare:       allBrandShare !== null ? `${Math.round(allBrandShare * 100)}%` : null,
      marketMaturity:      maturity,
      usedOfferCount:      usedCounts.length > 0 ? Math.round(avg(usedCounts)!) : null,
      // Phase 2/3:
      reviewVelocityFromKeepa: rvResult ? {
        score:       rvResult.score,
        sampleSize:  queryProducts.length,
        avgReviews:  rvResult.avg_review_count,
        competitors: rvResult.top_competitors?.length ?? 0,
        bulletsPopulated:      rvResult.top_competitors?.filter(c => c.bullets?.length).length ?? 0,
        ingredientsPopulated:  rvResult.top_competitors?.filter(c => c.ingredients_label).length ?? 0,
        breadcrumbsPopulated:  rvResult.top_competitors?.filter(c => c.breadcrumb).length ?? 0,
      } : null,
      // Phase 4 / Sprint 3: seasonality source selection.
      seasonality: seasonality ? {
        pattern:        seasonality.pattern,
        score:          seasonality.score,
        peakMonths:     seasonality.peak_months,
        coefficient:    seasonality.seasonal_coefficient,
        source:         histSeasonality !== null ? 'monthlySoldHistory' : 'bsr-proxy',
        sampleProducts: histSeasonalityResults.length,
      } : null,
      // ── Sprint 1–3 new signals ──────────────────────────────────────────────
      sprint1_monthlyReviews:    monthlyReviewsStr ?? null,
      sprint1_annualGrowthRate:  medAnnualGrowth   !== null ? `${medAnnualGrowth}%`  : null,
      sprint1_momentum3m:        medMomentum3m     !== null ? `${medMomentum3m}%`    : null,
      sprint1_snsPct:            snsPct            !== null ? `${Math.round(snsPct * 100)}%` : null,
      sprint2_listingAge:        medListingAgeMonths !== null ? `${Math.round(medListingAgeMonths)}mo` : null,
      sprint2_amazonOosPct:      medAmazonOosPct   !== null ? `${Math.round(medAmazonOosPct)}%` : null,
      sprint2_amazonBuyboxPct:   amazonBuyboxPct   !== null ? `${Math.round(amazonBuyboxPct * 100)}%` : null,
      sprint2_categoryFbaPct:    categoryStats?.isFBAPercent ?? null,
      sprint2_categoryAmazonPct: categoryStats?.soldByAmazonPercent ?? null,
      sprint3_avgVariationCount: medVariationCount !== null ? Math.round(medVariationCount) : null,
      // ── Existing fields (unchanged) ─────────────────────────────────────────
      avgRelBsr90:         avgRelBsr90  !== null ? Math.round(avgRelBsr90)  : null,
      avgRelBsr365:        avgRelBsr365 !== null ? Math.round(avgRelBsr365) : null,
      avgRelMonthlySold:   avgRelMonthlySold !== null ? Math.round(avgRelMonthlySold) : null,
      avgRelOffers:        avgRelOffers !== null ? Math.round(avgRelOffers * 10) / 10 : null,
      avgRelReviewCount:   avgRelReviewCount !== null ? Math.round(avgRelReviewCount) : null,
      competitionScore:    competition?.score ?? null,
      avgRelMomentum90d:   avgRelMomentum90d !== null ? `${avgRelMomentum90d}%` : null,
      avgCatBsr90:         avgBsr90  !== null ? Math.round(avgBsr90)  : null,
      avgCatMonthlySold:   avgMonthlySold !== null ? Math.round(avgMonthlySold) : null,
      avgPrice:            avgPrice  !== null ? `$${Math.round(avgPrice)}` : null,
      topRevenue:          productRevenues.length ? Math.round(Math.max(...productRevenues)) : null,
      revenueFallback:     productRevenues.length === 0
        ? (avgPrice !== null && avgMonthlySold !== null
            ? `$${Math.round(avgPrice * avgMonthlySold / 1000)}k (relevant-price estimate, conf=0.35)`
            : avgAllPrice !== null && avgMonthlySold !== null
            ? `$${Math.round(avgAllPrice * avgMonthlySold / 1000)}k (category-price estimate, conf=0.20)`
            : 'null')
        : null,
      avgRating:           avgRating !== null ? avgRating.toFixed(1) : null,
      avgReviewCount:      avgReviewCount !== null ? Math.round(avgReviewCount) : null,
      avgFbaFee:           avgFbaFee !== null ? `$${avgFbaFee.toFixed(2)}` : null,
      avgReferralFee:      avgReferralFee !== null ? `${avgReferralFee}%` : null,
      priceCompression:    avgPrice !== null && avgPrice365 !== null
        ? `${Math.round(((avgPrice - avgPrice365) / avgPrice365) * 100 * 10) / 10}%`
        : null,
      confidence:          Math.round(overallConf * 100) + '%',
    })

    return {
      demand,
      competition,
      growth,
      pricing,
      revenue,
      seasonality,
      review_velocity,
      supply_velocity,
      provider:   'keepa',
      fetched_at: new Date().toISOString(),
      confidence: overallConf,
    }
  }
}
