import type {
  SignalProvider,
  ProviderSignals,
  DemandSignal,
  CompetitionSignal,
  GrowthSignal,
  PricingSignal,
  ReviewVelocitySignal,
} from '../types'

// ── Keepa API constants ───────────────────────────────────────────

const KEEPA_API = 'https://api.keepa.com'

// Health & Household root node (Amazon US).
// Confirmed: "Health root 3760901" from node discovery (project_node_validation.md).
// Supplement categories live under this tree, so all keyword searches are
// scoped here to avoid cross-category noise (e.g. returning kitchen products).
const HEALTH_ROOT_NODE = 3760901

// Keepa CSV array indices (used in stats.current / stats.avg90 / stats.delta90)
const CSV = {
  AMAZON_PRICE:  0,
  BSR:           3,   // Best Sellers Rank in main category
  NEW_OFFER_CNT: 11,  // number of competing new sellers
  REVIEW_CNT:    16,
  REVIEW_RATING: 17,  // actual rating × 10
  BUYBOX_PRICE:  18,
  SELLER_CNT:    19,
} as const

// Keepa price sentinel: -1 means "not available"
const NO_DATA = -1

// ── Raw Keepa product shape ───────────────────────────────────────
// Only the fields this provider reads; Keepa returns many more.

interface KeepaStats {
  current?:  number[]
  avg90?:    number[]
  avg30?:    number[]
  avg365?:   number[]
  delta90?:  number[]  // delta over last 90 days by CSV index
}

interface KeepaProduct {
  asin:      string
  title?:    string
  brand?:    string
  stats?:    KeepaStats
}

interface KeepaProductResponse {
  products?: KeepaProduct[]
}

interface KeepaSearchResponse {
  asinList?: string[]
  totalResults?: number
}

// ── Helpers ───────────────────────────────────────────────────────

function keepaPrice(raw: number | undefined): number | null {
  if (raw === undefined || raw === NO_DATA || raw <= 0) return null
  return raw / 100   // Keepa stores in cents
}

function statVal(stats: KeepaStats | undefined, field: 'current' | 'avg90' | 'avg30' | 'avg365' | 'delta90', idx: number): number | null {
  const arr = stats?.[field]
  if (!arr || arr.length <= idx) return null
  const v = arr[idx]
  return v === undefined || v === NO_DATA ? null : v
}

// BSR → demand score (0–10). Lower BSR = higher demand.
function bsrToDemandScore(avgBsr: number): number {
  if (avgBsr <= 1_000)   return 9
  if (avgBsr <= 3_000)   return 8
  if (avgBsr <= 8_000)   return 7
  if (avgBsr <= 20_000)  return 6
  if (avgBsr <= 50_000)  return 4
  if (avgBsr <= 150_000) return 2
  return 1
}

// offer count → competition score (0–10, 10 = wide-open market)
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

function bsrDeltaTrendYoY(avg90: number | null, avg365: number | null): string | null {
  if (!avg90 || !avg365) return null
  // BSR direction is inverted: lower BSR = better = growth
  const pct = ((avg365 - avg90) / avg365) * 100
  if (Math.abs(pct) < 5) return 'Stable'
  return pct > 0 ? `+${Math.round(pct)}% YoY` : `${Math.round(pct)}% YoY`
}

function ratingToSentiment(rating: number): ReviewVelocitySignal['sentiment'] {
  if (rating >= 4.3) return 'Positive'
  if (rating >= 3.8) return 'Mixed'
  return 'Negative'
}

// Format BSR as an estimated monthly-sales search-volume proxy
function bsrToVolumeProxy(avgBsr: number): string {
  // Rough Health & Household BSR → units/month mapping
  if (avgBsr <= 500)   return '>10k units/mo'
  if (avgBsr <= 1000)  return '5k–10k units/mo'
  if (avgBsr <= 3000)  return '2k–5k units/mo'
  if (avgBsr <= 8000)  return '800–2k units/mo'
  if (avgBsr <= 20000) return '300–800 units/mo'
  if (avgBsr <= 50000) return '80–300 units/mo'
  return '<80 units/mo'
}

// ── Core provider class ───────────────────────────────────────────

export class KeepaProvider implements SignalProvider {
  readonly name    = 'keepa'
  readonly enabled = !!process.env.KEEPA_API_KEY

  async fetch(category: string): Promise<ProviderSignals | null> {
    if (!this.enabled) return null

    const key = process.env.KEEPA_API_KEY!

    try {
      // 1. Search for top ASINs in this supplement category
      const searchTerm = `${category.trim()} supplement`
      const asins = await this.search(key, searchTerm)
      if (asins.length < 5) {
        console.log('Keepa: too few search results', { category, count: asins.length })
        return null
      }

      // 2. Fetch product details (top 10 for token efficiency)
      const products = await this.fetchProducts(key, asins.slice(0, 10))
      const valid = products.filter(p => {
        const bsr = statVal(p.stats, 'current', CSV.BSR)
        return bsr !== null && bsr > 0
      })
      if (valid.length < 3) {
        console.log('Keepa: too few valid products', { category, valid: valid.length })
        return null
      }

      return this.computeSignals(valid)
    } catch (e) {
      console.error('Keepa provider error', { category, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  // ── Private: API calls ────────────────────────────────────────

  private async search(key: string, term: string): Promise<string[]> {
    const url =
      `${KEEPA_API}/search?key=${encodeURIComponent(key)}` +
      `&domain=1&type=product` +
      `&term=${encodeURIComponent(term)}` +
      `&category=${HEALTH_ROOT_NODE}`

    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) {
      console.error('Keepa search error', { status: res.status, term })
      return []
    }
    const data: KeepaSearchResponse = await res.json()
    return data.asinList ?? []
  }

  private async fetchProducts(key: string, asins: string[]): Promise<KeepaProduct[]> {
    const url =
      `${KEEPA_API}/product?key=${encodeURIComponent(key)}` +
      `&domain=1` +
      `&asin=${asins.join(',')}` +
      `&stats=365`    // includes current, avg30, avg90, avg365, delta90

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.error('Keepa product error', { status: res.status, asins: asins.length })
      return []
    }
    const data: KeepaProductResponse = await res.json()
    return data.products ?? []
  }

  // ── Private: signal computation ───────────────────────────────

  private computeSignals(products: KeepaProduct[]): ProviderSignals {
    const n = products.length

    // ── Demand (BSR-based) ──
    const bsrs90:  number[] = []
    const bsrs365: number[] = []
    const bsrsCur: number[] = []

    // ── Competition (offer count + review count) ──
    const offers:  number[] = []
    const reviews: number[] = []

    // ── Pricing ──
    const prices: number[] = []

    // ── Review velocity ──
    const ratings:        number[] = []
    const reviewDeltas90: number[] = []

    for (const p of products) {
      const s = p.stats

      const bsr90  = statVal(s, 'avg90',  CSV.BSR)
      const bsr365 = statVal(s, 'avg365', CSV.BSR)
      const bsrCur = statVal(s, 'current', CSV.BSR)
      if (bsr90  !== null) bsrs90.push(bsr90)
      if (bsr365 !== null) bsrs365.push(bsr365)
      if (bsrCur !== null) bsrsCur.push(bsrCur)

      const offer = statVal(s, 'current', CSV.NEW_OFFER_CNT)
      if (offer !== null && offer > 0) offers.push(offer)

      const rev = statVal(s, 'current', CSV.REVIEW_CNT)
      if (rev !== null && rev >= 0) reviews.push(rev)

      // Try Amazon price first, then Buy Box
      const price = keepaPrice(statVal(s, 'avg90', CSV.AMAZON_PRICE) ?? undefined)
               ?? keepaPrice(statVal(s, 'avg90', CSV.BUYBOX_PRICE)  ?? undefined)
      if (price !== null && price > 0) prices.push(price)

      const rating = statVal(s, 'current', CSV.REVIEW_RATING)
      if (rating !== null && rating > 0) ratings.push(rating / 10)

      // delta90 index 16 = review count change over 90 days
      const revDelta = statVal(s, 'delta90', CSV.REVIEW_CNT)
      if (revDelta !== null && revDelta > 0) reviewDeltas90.push(revDelta)
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    const avgBsr90   = avg(bsrs90)
    const avgBsr365  = avg(bsrs365)
    const avgBsrCur  = avg(bsrsCur)
    const avgOffers  = avg(offers)
    const avgReviews = avg(reviews)
    const avgPrice   = avg(prices)
    const avgRating  = avg(ratings)
    const avgRevDelta90 = avg(reviewDeltas90) // reviews / 90 days

    // ── Demand signal ──
    let demand: DemandSignal | undefined
    if (avgBsr90 !== null) {
      const trend = bsrDeltaTrendYoY(avgBsr90, avgBsr365)
      const sc    = bsrToDemandScore(avgBsr90)
      demand = {
        score:         sc,
        confidence:    bsrs90.length >= 5 ? 0.80 : 0.60,
        search_volume: bsrToVolumeProxy(avgBsr90),
        trend:         trend ?? 'Stable',
        signal:        sc >= 7 ? 'Strong' : sc >= 5 ? 'Moderate' : 'Weak',
      }
    }

    // ── Competition signal ──
    let competition: CompetitionSignal | undefined
    if (avgOffers !== null) {
      const sc         = offersToDomainScore(avgOffers)
      const avgOffersRound = Math.round(avgOffers)
      competition = {
        score:           sc,
        confidence:      offers.length >= 5 ? 0.75 : 0.55,
        competing_brands: `${Math.max(1, avgOffersRound - 5)}–${avgOffersRound + 10}`,
        saturation:      offersToSaturation(avgOffers),
        barrier:         avgReviews !== null ? offersToBarrier(avgReviews) : 'Medium',
      }
    }

    // ── Growth signal (BSR trend direction) ──
    let growth: GrowthSignal | undefined
    if (avgBsr90 !== null && avgBsr365 !== null) {
      const trendStr = bsrDeltaTrendYoY(avgBsr90, avgBsr365)
      const pctChange = ((avgBsr365 - avgBsr90) / avgBsr365) * 100
      const sc =
        pctChange > 15  ? 8 :
        pctChange > 5   ? 7 :
        Math.abs(pctChange) <= 5 ? 6 :
        pctChange < -15 ? 3 : 4
      growth = {
        score:      sc,
        confidence: Math.min(bsrs90.length, bsrs365.length) >= 4 ? 0.70 : 0.45,
        yoy_change: trendStr ?? 'Stable',
        momentum:
          pctChange > 5   ? 'Accelerating' :
          pctChange < -5  ? 'Decelerating' : 'Stable',
      }
    }

    // ── Pricing signal ──
    let pricing: PricingSignal | undefined
    if (avgPrice !== null) {
      const minP = Math.min(...prices)
      const maxP = Math.max(...prices)
      pricing = {
        score:         avgPrice > 35 ? 7 : avgPrice > 20 ? 6 : 5,
        confidence:    prices.length >= 5 ? 0.85 : 0.60,
        avg_price:     `$${Math.round(avgPrice)}`,
        price_range:   `$${Math.round(minP)}–$${Math.round(maxP)}`,
        premium_viable: avgPrice > 30 && maxP > avgPrice * 1.4,
      }
    }

    // ── Review velocity signal ──
    let review_velocity: ReviewVelocitySignal | undefined
    if (avgRating !== null || avgRevDelta90 !== null) {
      const monthlyPerProduct = avgRevDelta90 !== null
        ? Math.round((avgRevDelta90 / 90) * 30)
        : null
      const sentiment = avgRating !== null ? ratingToSentiment(avgRating) : undefined
      const sc =
        monthlyPerProduct !== null
          ? monthlyPerProduct > 200 ? 8 : monthlyPerProduct > 50 ? 6 : 4
          : avgRating !== null ? (avgRating >= 4.3 ? 7 : 5) : 5

      review_velocity = {
        score:          sc,
        confidence:     0.65,
        monthly_reviews: monthlyPerProduct !== null
          ? `~${monthlyPerProduct}/product/mo` : undefined,
        sentiment,
        avg_rating:     avgRating !== null ? avgRating.toFixed(1) : undefined,
      }
    }

    // ── Overall confidence (avg of populated dimension confidences) ──
    const dims = [demand, competition, growth, pricing, review_velocity].filter(Boolean)
    const overallConf = dims.length
      ? dims.reduce((s, d) => s + d!.confidence, 0) / dims.length
      : 0.3

    return {
      demand,
      competition,
      growth,
      pricing,
      review_velocity,
      provider:   'keepa',
      fetched_at: new Date().toISOString(),
      confidence: overallConf,
    }
  }
}
