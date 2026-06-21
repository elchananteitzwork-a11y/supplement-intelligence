import type {
  SignalProvider,
  ProviderSignals,
  DemandSignal,
  CompetitionSignal,
  GrowthSignal,
  PricingSignal,
} from '../types'

// ── Keepa API constants ───────────────────────────────────────────

const KEEPA_API = 'https://api.keepa.com'

// Supplement category node IDs (Amazon US, confirmed via live Keepa API calls).
// Node 23675621011 = "Vitamins, Minerals & Supplements" under Health & Household.
// Confirmed working: returns 10,000 ASINs from the bestsellers endpoint.
//
// How we found this: category tree walk from 3760901 (Health & Household root) →
// children → "Products" (3760931) → children → 23675621011.
// Previous assumption (6973753011) returned 0 ASINs — that node has no live data.
//
// This node provides category-level signals: BSR velocity, pricing range,
// seller density, and monthly unit sales for the top supplement brands.
// Claude uses these as calibration baselines when generating the 20 opportunities.
const SUPPLEMENT_NODES = {
  default: 23675621011,  // Vitamins, Minerals & Supplements — confirmed, 10k ASINs
} as const

// Keepa CSV array indices in raw stats arrays (stats.current[], stats.avg90[], etc.).
// Source: Keepa API docs + confirmed via keepa/normalizer.py cross-reference.
const CSV = {
  AMAZON_PRICE:  0,
  BSR:           3,   // Best Sellers Rank in root category
  NEW_OFFER_CNT: 11,  // number of competing new sellers
  BUYBOX_PRICE:  18,
  // NOTE: REVIEW_CNT(16) and REVIEW_RATING(17) are confirmed empty in Keepa's
  // stats arrays for supplement products. Do not read these indices — they return -1.
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
  delta90?:  number[]   // delta over last 90 days by CSV index
}

interface KeepaProduct {
  asin:        string
  title?:      string
  brand?:      string
  stats?:      KeepaStats
  monthlySold?: number  // Keepa's estimated monthly unit sales (top-level field)
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

function bsrToVolumeProxy(avgBsr: number): string {
  if (avgBsr <= 500)    return '>10k units/mo'
  if (avgBsr <= 1_000)  return '5k–10k units/mo'
  if (avgBsr <= 3_000)  return '2k–5k units/mo'
  if (avgBsr <= 8_000)  return '800–2k units/mo'
  if (avgBsr <= 20_000) return '300–800 units/mo'
  if (avgBsr <= 50_000) return '80–300 units/mo'
  return '<80 units/mo'
}

// ── Core provider class ───────────────────────────────────────────

export class KeepaProvider implements SignalProvider {
  readonly name    = 'keepa'
  readonly enabled = !!process.env.KEEPA_API_KEY

  async fetch(category: string): Promise<ProviderSignals | null> {
    if (!this.enabled) return null

    const key    = process.env.KEEPA_API_KEY!
    const nodeId = SUPPLEMENT_NODES.default

    try {
      // 1. Fetch top ASINs from the Vitamins & Supplements bestsellers list.
      //    This endpoint is confirmed working for supplement discovery
      //    (Python system validated: gut_health, protein, supplements → node 6973753011).
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

      return this.computeSignals(valid)
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
    // Token cost: ~5 tokens/product × 10 products = ~50 tokens.
    const url =
      `${KEEPA_API}/product` +
      `?key=${encodeURIComponent(key)}` +
      `&domain=1` +
      `&asin=${asins.join(',')}` +
      `&stats=365`

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.error('Keepa product error', { status: res.status, asins: asins.length })
      return []
    }
    const data: KeepaProductResponse = await res.json()
    return data.products ?? []
  }

  // ── Private: compute standardized signals ─────────────────────

  private computeSignals(products: KeepaProduct[]): ProviderSignals {
    const bsrs90:       number[] = []
    const bsrs365:      number[] = []
    const offers:       number[] = []
    const prices:       number[] = []
    const monthlySolds: number[] = []

    // NOTE: review count (CSV[16]) and rating (CSV[17]) are not populated by Keepa
    // for supplements via the product/stats endpoint. Confirmed via live API calls:
    // csv[16] and csv[17] are empty arrays for all top supplement ASINs.
    // review_velocity signal is omitted rather than estimated from missing data.

    for (const p of products) {
      const s = p.stats

      const bsr90  = statVal(s, 'avg90',  CSV.BSR)
      const bsr365 = statVal(s, 'avg365', CSV.BSR)
      if (bsr90  !== null) bsrs90.push(bsr90)
      if (bsr365 !== null) bsrs365.push(bsr365)

      // stats.current[11] = new offer count. Confirmed matches stats.totalOfferCount.
      const offer = statVal(s, 'current', CSV.NEW_OFFER_CNT)
      if (offer !== null && offer > 0) offers.push(offer)

      const priceAmazon = keepaPrice(statVal(s, 'avg90', CSV.AMAZON_PRICE) ?? undefined)
      const priceBuyBox = keepaPrice(statVal(s, 'avg90', CSV.BUYBOX_PRICE) ?? undefined)
      const price = priceAmazon ?? priceBuyBox
      if (price !== null && price > 0) prices.push(price)

      // monthlySold is a top-level field (not in stats array).
      // Confirmed: 70k–100k for top-10 Vitamins & Supplements products.
      if (p.monthlySold && p.monthlySold > 0) monthlySolds.push(p.monthlySold)
    }

    const avg = (arr: number[]): number | null =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    const avgBsr90       = avg(bsrs90)
    const avgBsr365      = avg(bsrs365)
    const avgOffers      = avg(offers)
    const avgPrice       = avg(prices)
    const avgMonthlySold = avg(monthlySolds)

    // ── Demand signal ──
    // Primary: monthlySold (Keepa estimate, confirmed accurate for top products).
    // Fallback: BSR proxy when monthlySold is unavailable.
    let demand: DemandSignal | undefined
    if (avgBsr90 !== null) {
      const sc = bsrToDemandScore(avgBsr90)
      const volumeStr = avgMonthlySold !== null
        ? `${Math.round(avgMonthlySold / 1000)}k units/mo (top products)`
        : bsrToVolumeProxy(avgBsr90)
      demand = {
        score:         avgMonthlySold !== null && avgMonthlySold > 50_000 ? 9
                     : avgMonthlySold !== null && avgMonthlySold > 10_000 ? 7
                     : sc,
        confidence:    bsrs90.length >= 5 ? 0.82 : 0.65,
        search_volume: volumeStr,
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
      growth = {
        score:      sc,
        confidence: Math.min(bsrs90.length, bsrs365.length) >= 5 ? 0.72 : 0.50,
        yoy_change: trendStr ?? 'Stable',
        momentum:
          pctChange > 5  ? 'Accelerating' :
          pctChange < -5 ? 'Decelerating' : 'Stable',
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

    // ── Overall provider confidence ──
    const dims = [demand, competition, growth, pricing].filter(Boolean)
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
      confidence:      Math.round(overallConf * 100) + '%',
    })

    return {
      demand,
      competition,
      growth,
      pricing,
      provider:   'keepa',
      fetched_at: new Date().toISOString(),
      confidence: overallConf,
    }
  }
}
