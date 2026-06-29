import type {
  SignalProvider,
  SignalContext,
  ProviderSignals,
  DemandSignal,
  CompetitionSignal,
  GrowthSignal,
  PricingSignal,
  RevenueSignal,
} from '../types'
import { checkKeywordRelevance } from '../../keyword-engine/relevance-guard'

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
//
// Each confirmed via /bestsellers to return a populated ASIN list before
// being wired in (supplements: 10k ASINs; the other four: capped at the
// API's 500k-ASIN ceiling — all four are large, real, live top-level nodes,
// not promotional collections, which is a real distinct category of search
// result Keepa's category search also returns and which must be excluded —
// confirmed by checking productCount/sellerCount, not by name match alone).
//
// NOTE: the /bestsellers call costs ~50 tokens for these four top-level
// nodes (vs. a few tokens for the narrower supplements sub-node) — Keepa
// prices by response size, and a top-level node returns far more ASINs.
// Still comfortably inside the account's continuous refill budget at this
// product's volume.
const CATEGORY_NODES: Record<string, number> = {
  supplements: 23675621011,
  beauty:      3760911,
  pets:        2619533011,
  fitness:     3375251,
  home:        1055398,
}

// Keepa CSV array indices in raw stats arrays (stats.current[], stats.avg90[], etc.).
// Source: Keepa API docs + confirmed via keepa/normalizer.py cross-reference.
const CSV = {
  AMAZON_PRICE:  0,
  BSR:           3,   // Best Sellers Rank in root category
  NEW_OFFER_CNT: 11,  // number of competing new sellers
  BUYBOX_PRICE:  18,
  RATING:        16,  // CONFIRMED VIA LIVE CALL 2026-06-24: real data, e.g. 47 = 4.7★.
  COUNT_REVIEWS: 17,  // Previously documented as "confirmed empty" — that was true only
                       // because the request never sent &rating=1, which Keepa requires
                       // to include this history at all. Indices were also mislabeled
                       // (this file previously had them swapped). Fixed on both counts.
} as const

// Keepa sentinel: -1 means "not available" for that data point
const NO_DATA = -1

// ── Raw Keepa API response shapes ────────────────────────────────
// These are the RAW responses from the API before any normalization.
// (Not to be confused with the Python-normalized keepa/models.py shapes.)

interface KeepaStats {
  current?:  number[]   // current value by CSV index
  avg90?:    number[]   // 90-day average by CSV index
  avg365?:   number[]   // 365-day average by CSV index
  // CONFIRMED VIA LIVE CALL 2026-06-26 (3 real ASINs, supplements category):
  // there is no general `delta90` array indexed by CSV type — that field,
  // previously declared here, does not exist in Keepa's real response and
  // was never actually used anywhere in this file. The real field is this
  // single number, specific to monthlySold: real 90-day percent change
  // (e.g. -16, -1), not an array.
  deltaPercent90_monthlySold?: number
}

interface KeepaProduct {
  asin:        string
  title?:      string
  brand?:      string
  stats?:      KeepaStats
  monthlySold?: number  // Keepa's estimated monthly unit sales (top-level field)
  // CONFIRMED VIA LIVE CALL 2026-06-26: real top-level fields on the Keepa
  // product response — Amazon's own published fee schedule for this
  // product's category/size tier, mirrored by Keepa, not a Keepa-side
  // estimate. fbaFees.pickAndPackFee is in integer cents, same convention
  // as price fields elsewhere in this file.
  fbaFees?:               { pickAndPackFee?: number }
  referralFeePercentage?: number
}

interface KeepaProductResponse {
  products?: KeepaProduct[]
}

interface KeepaBestsellerResponse {
  bestSellersList?: {
    asinList?: string[]
  }
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

// QUALITY FIX (2026-06-29, production smoke test): plain word-overlap let
// through two loose false-positive matches. CONFIRMED VIA LIVE PRODUCTION
// DATA: "Elderberry Immune Gummies for Adults" was credited with "NatureWise
// Vitamin D3...Immune Support..." (a different product entirely, sharing
// only the marketing claim "immune") and "Adjustable Ankle Weights for
// Walking" was credited with "Amazon Basics...Dumbbell Hand Weights" (shares
// the product-type word "weights", but a different body location). Neither
// case is the original bug's severity (an unrelated product with zero
// shared vocabulary) — both share a real word — but neither is a correct
// match either. Two narrow, additive checks close both gaps without
// touching the core overlap logic (preserves recall for every previously-
// confirmed genuine match: niacinamide/toner, magnesium/glycinate/sleep,
// slow feeder/bowl all still pass, since each has a substantive, non-claim,
// location-consistent overlap word independent of these two new checks).
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

  // A shared word must include at least one term that isn't a generic
  // marketing claim — "immune"/"support" etc. appear across huge swaths
  // of unrelated products and aren't evidence of a real product match.
  if (!overlap.some(w => !GENERIC_CLAIM_WORDS.has(w))) return false

  // If the query names a specific body location, the candidate must name
  // the SAME one (or none) — sharing a product-type word like "weights"
  // isn't enough if the query says "ankle" and the candidate says "hand".
  const queryLocations = Array.from(queryWords).filter(w => BODY_LOCATION_WORDS.has(w))
  if (queryLocations.length > 0 && !queryLocations.some(w => titleWords.has(w))) return false

  return true
}

function keepaPrice(raw: number | undefined): number | null {
  if (raw === undefined || raw === NO_DATA || raw <= 0) return null
  return raw / 100  // Keepa stores in integer cents
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

function offersToSaturation(avgOffers: number): CompetitionSignal['saturation'] {
  if (avgOffers < 20)  return 'Low'
  if (avgOffers < 60)  return 'Medium'
  if (avgOffers < 120) return 'Medium-High'
  return 'High'
}

function offersToBarrier(avgReviews: number): CompetitionSignal['barrier'] {
  if (avgReviews < 200)  return 'Low'
  if (avgReviews < 2000) return 'Medium'
  return 'High'
}

function bsrDeltaYoY(avg90: number | null, avg365: number | null): string | null {
  if (!avg90 || !avg365) return null
  // Inverted: lower BSR = more sales = growth
  const pct = ((avg365 - avg90) / avg365) * 100
  if (Math.abs(pct) < 5) return 'Stable'
  return pct > 0 ? `+${Math.round(pct)}% YoY` : `${Math.round(pct)}% YoY`
}


// ── Core provider class ───────────────────────────────────────────

export class KeepaProvider implements SignalProvider {
  readonly name    = 'keepa'
  readonly enabled = !!process.env.KEEPA_API_KEY

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    if (!this.enabled) return null

    // Originally hardcoded to the supplements node only — silently returned
    // real-but-irrelevant supplement bestseller data for every other
    // category. Now looks up a real, individually-verified node per
    // category (see CATEGORY_NODES above) instead of guessing one. If a
    // category has no verified mapping, decline rather than invent a node id.
    const nodeId = CATEGORY_NODES[ctx.categoryId ?? '']
    if (!nodeId) {
      console.log('Keepa: skipped — no verified category node mapping', { categoryId: ctx.categoryId })
      return null
    }

    const category = ctx.query
    const key = process.env.KEEPA_API_KEY!

    try {
      // 1. Fetch top ASINs from this category's bestsellers list.
      const asins = await this.fetchBestsellers(key, nodeId)
      if (asins.length < 5) {
        console.log('Keepa: too few bestseller ASINs', { category, nodeId, count: asins.length })
        return null
      }

      // 2. Fetch product details for the top 10 (token-efficient; ~50 tokens total).
      //    stats=365 gives current, avg90, avg365, delta90 arrays.
      const products = await this.fetchProducts(key, asins.slice(0, 10))
      const valid = products.filter(p => {
        const bsr = statVal(p.stats, 'current', CSV.BSR)
        return bsr !== null && bsr > 0
      })
      if (valid.length < 3) {
        console.log('Keepa: too few products with BSR data', { category, valid: valid.length })
        return null
      }

      return this.computeSignals(valid, category)
    } catch (e) {
      console.error('Keepa provider error', { category, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  // ── Private: API calls ────────────────────────────────────────

  private async fetchBestsellers(key: string, nodeId: number): Promise<string[]> {
    // Keepa bestsellers endpoint: returns up to ~100 ranked ASINs for a category node.
    // Token cost: ~1–5 tokens. Source: keepa/client.py get_best_sellers().
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

  private async fetchProducts(key: string, asins: string[]): Promise<KeepaProduct[]> {
    // Product endpoint: returns raw Keepa product data with stats arrays.
    // stats=365 enables avg365 (needed for YoY trend comparison).
    // rating=1 includes RATING/COUNT_REVIEWS history (CSV[16]/[17]) — without
    // it Keepa omits both entirely, which is why they previously looked
    // "empty." Confirmed live (2026-06-24): adds ~2 tokens/product.
    // Token cost: ~5 tokens/product × 10 products = ~50 tokens.
    const url =
      `${KEEPA_API}/product` +
      `?key=${encodeURIComponent(key)}` +
      `&domain=1` +
      `&asin=${asins.join(',')}` +
      `&stats=365` +
      `&rating=1`

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.error('Keepa product error', { status: res.status, asins: asins.length })
      return []
    }
    const data: KeepaProductResponse = await res.json()
    return data.products ?? []
  }

  // ── Private: compute standardized signals ─────────────────────

  private computeSignals(products: KeepaProduct[], query: string): ProviderSignals {
    const bsrs90:       number[] = []
    const bsrs365:      number[] = []
    const offers:       number[] = []
    const prices:       number[] = []
    const monthlySolds: number[] = []
    // Per-product revenue (price × monthlySold for the SAME product, not
    // avg-price × avg-units across different products) — needed to give an
    // honest top-seller-vs-average split instead of one blended number.
    const productRevenues: number[] = []
    // Real rating/review-count per product — directly observed Amazon facts
    // (Keepa mirrors them, doesn't model them), unlike monthlySold/revenue
    // above which are Keepa's own estimates. Requires &rating=1 on the
    // request (see fetchProducts) — see CSV.RATING/COUNT_REVIEWS comment
    // for why this was previously missed.
    const ratings:      number[] = []
    const reviewCounts: number[] = []
    // Real 90-day % change in Keepa's own monthlySold estimate per product —
    // see KeepaStats.deltaPercent90_monthlySold comment above.
    const momentum90dPcts:  number[] = []
    // Real Amazon fee-schedule data per product — see KeepaProduct.fbaFees/
    // referralFeePercentage comment above.
    const fbaPickPackFees:  number[] = []
    const referralFeePcts:  number[] = []

    for (const p of products) {
      const s = p.stats

      const bsr90  = statVal(s, 'avg90',  CSV.BSR)
      const bsr365 = statVal(s, 'avg365', CSV.BSR)
      if (bsr90  !== null) bsrs90.push(bsr90)
      if (bsr365 !== null) bsrs365.push(bsr365)

      // Keepa sentinel: a real 0% change is reported as 0, not -1/undefined,
      // so only filter out actual missing data, not a genuinely flat 0.
      const momentum90d = s?.deltaPercent90_monthlySold
      if (typeof momentum90d === 'number' && momentum90d !== NO_DATA) momentum90dPcts.push(momentum90d)

      const fbaFee = keepaPrice(p.fbaFees?.pickAndPackFee)
      if (fbaFee !== null && fbaFee > 0) fbaPickPackFees.push(fbaFee)
      if (typeof p.referralFeePercentage === 'number' && p.referralFeePercentage > 0) {
        referralFeePcts.push(p.referralFeePercentage)
      }

      // stats.current[11] = new offer count. Confirmed matches stats.totalOfferCount.
      const offer = statVal(s, 'current', CSV.NEW_OFFER_CNT)
      if (offer !== null && offer > 0) offers.push(offer)

      const priceAmazon = keepaPrice(statVal(s, 'avg90', CSV.AMAZON_PRICE) ?? undefined)
      const priceBuyBox = keepaPrice(statVal(s, 'avg90', CSV.BUYBOX_PRICE) ?? undefined)
      const price = priceAmazon ?? priceBuyBox
      if (price !== null && price > 0) prices.push(price)

      // monthlySold is a top-level field (not in stats array).
      // Confirmed: 70k–100k for top-10 Vitamins & Supplements products.
      // Deliberately UNGATED by relevance — shared with the Demand signal's
      // score-boost below, which is out of scope for this fix (see gate
      // comment on productRevenues just below) and already disclosed as a
      // category-wide aggregate (lib/provenance.ts unitsSoldProvenance).
      if (p.monthlySold && p.monthlySold > 0) monthlySolds.push(p.monthlySold)

      // ROOT CAUSE FIX (2026-06-29, live investigation): productRevenues
      // (price × monthlySold for ONE product — the basis for
      // est_monthly_revenue/top_seller_revenue/avg_seller_revenue) used to
      // be pushed unconditionally, regardless of whether this bestseller
      // had anything to do with the query. CONFIRMED VIA LIVE CALL:
      // "Peptide-Fortified Scalp Mask" was credited with $2,446,000/mo —
      // the revenue of La Roche-Posay's Toleriane face moisturizer, the
      // single highest-revenue ASIN in the entire Beauty department's
      // bestseller list (CATEGORY_NODES is resolved by category only, with
      // no way to search Keepa for the specific product). Reusing the same
      // relevance check already proven for keyword broadening
      // (lib/keyword-engine/relevance-guard.ts) against this product's
      // real title — only the dollar-revenue figures are gated; Demand,
      // Competition, Growth, Pricing, fees, rating, and review-count below
      // are untouched (they're either already disclosed as category-wide
      // or are legitimately category-uniform facts, not a per-product
      // dollar claim, and changing them would alter existing scoring
      // behavior, which is out of scope for this fix).
      // Both gates must agree: the vocab-based guard catches species/body-
      // area/demographic drift, the word-overlap check catches everything
      // else it can't see (see hasWordOverlap comment above).
      const isRelevantBestseller =
        !!p.title &&
        checkKeywordRelevance(query, p.title).allowed &&
        hasWordOverlap(query, p.title)
      if (isRelevantBestseller && price !== null && price > 0 && p.monthlySold && p.monthlySold > 0) {
        productRevenues.push(price * p.monthlySold)
      }

      // Keepa encodes rating ×10 (47 = 4.7★); -1/missing means no data, not zero.
      const rating      = statVal(s, 'current', CSV.RATING)
      const reviewCount = statVal(s, 'current', CSV.COUNT_REVIEWS)
      if (rating !== null && rating > 0) ratings.push(rating / 10)
      if (reviewCount !== null && reviewCount > 0) reviewCounts.push(reviewCount)
    }

    const avg = (arr: number[]): number | null =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    const avgBsr90       = avg(bsrs90)
    const avgBsr365      = avg(bsrs365)
    const avgOffers      = avg(offers)
    const avgPrice       = avg(prices)
    const avgMonthlySold = avg(monthlySolds)
    // Rounded at the source — confirmed live (2026-06-26): an unrounded
    // float here ("-74.11111111111111%") reached the UI verbatim.
    const avgMomentum90dRaw = avg(momentum90dPcts)
    const avgMomentum90d = avgMomentum90dRaw !== null ? Math.round(avgMomentum90dRaw * 10) / 10 : null
    const avgFbaFee      = avg(fbaPickPackFees)
    const avgReferralFee = avg(referralFeePcts)

    // ── Demand signal ──
    // Score is derived from real BSR (a legitimate Amazon sales-velocity
    // proxy). search_volume is deliberately NOT set here: Keepa measures
    // Amazon purchase activity, not search queries, and conflating the two
    // was exactly the kind of guess-dressed-as-data this provider should
    // not produce. The real units-sold figure (Keepa's own monthlySold
    // field) lives on the `revenue` signal below instead, labeled for what
    // it actually is.
    let demand: DemandSignal | undefined
    if (avgBsr90 !== null) {
      const sc = bsrToDemandScore(avgBsr90)
      demand = {
        score:         avgMonthlySold !== null && avgMonthlySold > 50_000 ? 9
                     : avgMonthlySold !== null && avgMonthlySold > 10_000 ? 7
                     : sc,
        confidence:    bsrs90.length >= 5 ? 0.82 : 0.65,
        trend:         bsrDeltaYoY(avgBsr90, avgBsr365) ?? 'Stable',
        signal:        sc >= 7 ? 'Strong' : sc >= 5 ? 'Moderate' : 'Weak',
      }
    }

    // ── Competition signal (from offer counts per listing) ──
    // For supplement top-sellers: avg 3–4 sellers/listing → brand-dominant dynamics.
    // This is correct for the supplement category (brands control their listings).
    let competition: CompetitionSignal | undefined
    if (avgOffers !== null) {
      const sc      = offersToDomainScore(avgOffers)
      const rounded = Math.round(avgOffers)
      competition = {
        score:            sc,
        confidence:       offers.length >= 5 ? 0.72 : 0.55,
        competing_brands: `${Math.max(1, rounded - 1)}–${rounded + 5} sellers/listing`,
        saturation:       offersToSaturation(avgOffers),
        // Barrier inferred from brand-exclusive listings (low seller count = brand moat)
        barrier: avgOffers <= 3 ? 'High' : avgOffers <= 8 ? 'Medium' : 'Low',
      }
    }

    // ── Growth signal (BSR 90d vs. 365d trend) ──
    let growth: GrowthSignal | undefined
    if (avgBsr90 !== null && avgBsr365 !== null) {
      const trendStr  = bsrDeltaYoY(avgBsr90, avgBsr365)
      const pctChange = ((avgBsr365 - avgBsr90) / avgBsr365) * 100
      const sc =
        pctChange > 15  ? 8 :
        pctChange > 5   ? 7 :
        Math.abs(pctChange) <= 5 ? 6 :
        pctChange < -15 ? 3 : 4
      // momentum: prefer the real 90-day monthlySold delta (a direct demand
      // measurement) over the BSR 90d-vs-365d ratio (a proxy) when present —
      // same "prefer the more direct real measurement" pattern already used
      // for DataForSEO's own pre-computed trend elsewhere in this codebase.
      // Falls back to the BSR-derived figure when monthlySold delta isn't
      // available for enough products.
      const momentum: GrowthSignal['momentum'] =
        avgMomentum90d !== null
          ? (avgMomentum90d > 5 ? 'Accelerating' : avgMomentum90d < -5 ? 'Decelerating' : 'Stable')
          : (pctChange > 5  ? 'Accelerating' : pctChange < -5 ? 'Decelerating' : 'Stable')
      growth = {
        score:            sc,
        confidence:       Math.min(bsrs90.length, bsrs365.length) >= 5 ? 0.72 : 0.50,
        yoy_change:       trendStr ?? 'Stable',
        momentum,
        momentum_90d_pct: avgMomentum90d,
      }
    }

    // ── Pricing signal ──
    // premium_viable: true if the price range includes products at 40%+ above avg.
    // This is more meaningful than requiring avg > $30 (avg of top products can be
    // lower while high-end products still exist).
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
      }
    }

    // ── Revenue signal (price × monthlySold, per product — not avg×avg) ──
    // Top seller = the single highest-revenue product among the sample.
    // Average seller = mean revenue across the sample. Both are real Keepa
    // fields multiplied together; monthlySold is itself Keepa's own estimate,
    // not a measured fact, so this is Estimated, not Verified — see provenance.
    // avgRating/avgReviewCount are computed independently of productRevenues:
    // rating/review-count only require the product to have stats at all,
    // while revenue additionally requires monthlySold on the SAME product —
    // a stricter condition that shouldn't silently drop real review data
    // just because the revenue figure couldn't be computed.
    const avgRating      = avg(ratings)
    const avgReviewCount = avg(reviewCounts)

    let revenue: RevenueSignal | undefined
    if (productRevenues.length > 0 || avgRating !== null || avgReviewCount !== null) {
      const topRevenue = productRevenues.length ? Math.max(...productRevenues) : null
      const avgRevenue = avg(productRevenues)
      const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k/mo` : `$${Math.round(n)}/mo`
      revenue = {
        score:                  avgRevenue !== null ? (avgRevenue > 50_000 ? 8 : avgRevenue > 15_000 ? 6 : avgRevenue > 5_000 ? 4 : 2) : 0,
        confidence:             productRevenues.length >= 5 ? 0.7 : 0.5,
        est_monthly_revenue:    avgRevenue !== null ? fmt(avgRevenue) : undefined,
        top_seller_revenue:     topRevenue !== null ? fmt(topRevenue) : undefined,
        avg_seller_revenue:     avgRevenue !== null ? fmt(avgRevenue) : undefined,
        est_monthly_units_sold: avgMonthlySold !== null ? `${Math.round(avgMonthlySold).toLocaleString()} units/mo` : undefined,
        avg_rating:             avgRating !== null ? avgRating.toFixed(1) : undefined,
        avg_review_count:       avgReviewCount !== null ? Math.round(avgReviewCount) : undefined,
        avg_fba_pick_pack_fee:  avgFbaFee !== null ? `$${avgFbaFee.toFixed(2)}` : undefined,
        avg_referral_fee_pct:   avgReferralFee !== null ? Math.round(avgReferralFee * 10) / 10 : undefined,
      }
    }

    // ── Overall provider confidence ──
    const dims = [demand, competition, growth, pricing, revenue].filter(Boolean)
    const overallConf = dims.length
      ? dims.reduce((s, d) => s + d!.confidence, 0) / dims.length
      : 0.3

    console.log('Keepa signals computed', {
      products:        products.length,
      bsr_samples:     bsrs90.length,
      avgBsr90:        avgBsr90  !== null ? Math.round(avgBsr90)  : null,
      avgBsr365:       avgBsr365 !== null ? Math.round(avgBsr365) : null,
      avgMonthlySold:  avgMonthlySold !== null ? Math.round(avgMonthlySold) : null,
      avgOffers:       avgOffers !== null ? Math.round(avgOffers * 10) / 10 : null,
      avgPrice:        avgPrice  !== null ? `$${Math.round(avgPrice)}` : null,
      topRevenue:      productRevenues.length ? Math.round(Math.max(...productRevenues)) : null,
      avgRating:       avgRating !== null ? avgRating.toFixed(1) : null,
      avgReviewCount:  avgReviewCount !== null ? Math.round(avgReviewCount) : null,
      avgMomentum90d:  avgMomentum90d !== null ? `${avgMomentum90d}%` : null,
      avgFbaFee:       avgFbaFee !== null ? `$${avgFbaFee.toFixed(2)}` : null,
      avgReferralFee:  avgReferralFee !== null ? `${avgReferralFee}%` : null,
      confidence:      Math.round(overallConf * 100) + '%',
    })

    return {
      demand,
      competition,
      growth,
      pricing,
      revenue,
      provider:   'keepa',
      fetched_at: new Date().toISOString(),
      confidence: overallConf,
    }
  }
}
