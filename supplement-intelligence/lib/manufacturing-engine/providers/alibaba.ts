import crypto from 'crypto'
import type {
  ManufacturingProvider,
  ManufacturingRequest,
  ManufacturingEstimate,
  ManufacturingComplexity,
  ConfidenceLabel,
} from '../types'

// ── Alibaba Open Platform provider ──────────────────────────────────────────
// API: https://developer.alibaba.com/docs — alibaba.open.product.search
// Auth: MD5 signing (app_key + app_secret)
// Required env vars: ALIBABA_APP_KEY, ALIBABA_APP_SECRET
//
// Enabled only when both vars are set.
// Returns null on any failure → engine falls through to AI estimate.

const API_BASE = 'https://gw.api.alibaba.com/openapi/param2/2/alibaba.open.product.search'

// ── Alibaba response types ───────────────────────────────────────────────────

interface AlibabaSellerDt {
  loginId?:      string
  memberId?:     string
  companyName?:  string
  starLevel?:    number  // 1–5 Trade Assurance star rating
  tradeScore?:   number  // cumulative transaction score
  creditLevel?:  number  // credit rating
}

interface AlibabaProduct {
  subject?:    string
  productId?:  string
  minPrice?:   number
  maxPrice?:   number
  priceUnit?:  string
  moq?:        string      // e.g. "500 Pieces"
  moqUnit?:    string      // e.g. "Piece"
  sellerDt?:   AlibabaSellerDt
  imageUrl?:   string
  // Attributes may contain lead time in some categories
  productAttribute?: Array<{ attrName?: string; attrValue?: string }>
}

interface AlibabaSearchResponse {
  result?: {
    products?:   AlibabaProduct[]
    totalCount?: number
    pageSize?:   number
    page?:       number
  }
  errorCode?:    string
  errorMessage?: string
}

// ── Signing ──────────────────────────────────────────────────────────────────
// Alibaba Open Platform MD5 signature:
//   sort params alphabetically → secret + key1val1key2val2... + secret → MD5 uppercase

function sign(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params).sort()
  let base = secret
  for (const k of sorted) base += k + params[k]
  base += secret
  return crypto.createHash('md5').update(base, 'utf8').digest('hex').toUpperCase()
}

// ── Search query builder ─────────────────────────────────────────────────────
// Appending OEM/private label signals filters out retail listings and surfaces
// manufacturing-oriented suppliers for the relevant category.

const CATEGORY_SUFFIX: Record<string, string> = {
  supplements:   'OEM private label capsule manufacturer',
  beauty:        'OEM cosmetic skincare manufacturer',
  pets:          'OEM pet supplement treat manufacturer',
  fitness:       'OEM sports nutrition manufacturer',
  'consumer goods': 'manufacturer supplier OEM',
}

function buildQuery(req: ManufacturingRequest): string {
  const suffix = CATEGORY_SUFFIX[req.category.toLowerCase()] ?? 'manufacturer OEM'
  return `${req.product} ${suffix}`
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseMOQ(moq?: string, moqUnit?: string): { low: number; high: number; unit: string } | undefined {
  // Normalise unit label
  const rawUnit   = (moqUnit ?? 'Piece').toLowerCase().replace(/s$/, '')
  const unitLabel = ({ piece: 'units', set: 'sets', bag: 'bags', box: 'boxes', kg: 'kg', kilogram: 'kg' }[rawUnit] ?? 'units')

  // AUDIT FIX (2026-07-01): previously returned {low:500, high:2000} as a
  // hardcoded guess when no real MOQ data was present — a clear violation of
  // the "real data or null" rule. Now returns undefined instead. Callers
  // already handle undefined gracefully (show "No data available").
  if (!moq) return undefined

  const nums = moq.match(/\d[\d,]*/g)?.map(n => parseInt(n.replace(/,/g, ''), 10)).filter(n => n > 0) ?? []
  if (!nums.length) return undefined

  const low  = Math.min(...nums)
  // If only one number found, estimate the upper bound
  const high = nums.length > 1 ? Math.max(...nums) : Math.min(low * 5, low + 5000)
  return { low, high, unit: unitLabel }
}

// Alibaba `minPrice` and `maxPrice` are per-unit at the highest-volume tier (USD).
// Extract a representative range from the result set using percentile filtering
// to ignore extreme outliers on both ends.

function extractPriceRange(products: AlibabaProduct[]): { low: number; high: number } | null {
  const priced = products
    .filter(p => (p.minPrice ?? 0) > 0)
    .map(p => ({ low: p.minPrice!, high: p.maxPrice ?? p.minPrice! }))

  if (!priced.length) return null

  priced.sort((a, b) => a.low - b.low)
  // 25th percentile low → 75th percentile high to capture the realistic range
  const p25 = priced[Math.floor(priced.length * 0.25)]
  const p75 = priced[Math.floor(priced.length * 0.75)]
  return { low: +(p25.low.toFixed(2)), high: +(p75.high.toFixed(2)) }
}

// Try to extract lead time from product attributes (available in some categories).
// Falls back to category/complexity-based estimate if not found.

function extractLeadTime(
  products:   AlibabaProduct[],
  req:        ManufacturingRequest,
): { low: number; high: number } {
  for (const p of products) {
    for (const attr of (p.productAttribute ?? [])) {
      const name  = (attr.attrName  ?? '').toLowerCase()
      const value = (attr.attrValue ?? '').toLowerCase()
      if (!name.includes('lead') && !name.includes('delivery')) continue
      const nums = value.match(/\d+/g)?.map(Number).filter(n => n > 0 && n <= 365) ?? []
      if (nums.length === 2) return { low: Math.min(...nums), high: Math.max(...nums) }
      if (nums.length === 1) return { low: Math.round(nums[0] * 0.7), high: Math.round(nums[0] * 1.3) }
    }
  }

  // Category-based fallback (days from PO to shipment)
  const cat = req.category.toLowerCase()
  const complexity = (req.complexity ?? 'Medium').toLowerCase()

  const base: Record<string, [number, number]> = {
    supplements:      [45, 90],
    beauty:           [45, 90],
    pets:             [45, 90],
    fitness:          [60, 120],
    'consumer goods': [30, 75],
  }
  let [low, high] = base[cat] ?? [45, 90]

  if (complexity === 'low')  { low = Math.round(low  * 0.7); high = Math.round(high * 0.7) }
  if (complexity === 'high') { low = Math.round(low  * 1.4); high = Math.round(high * 1.4) }

  return { low, high }
}

// Convert Alibaba star level (1–5) to our 0–5 rating scale.
// Only include suppliers with a star level (Trade Assurance verified).

function topRating(products: AlibabaProduct[]): number | null {
  const levels = products
    .map(p => p.sellerDt?.starLevel)
    .filter((s): s is number => typeof s === 'number' && s >= 1 && s <= 5)

  if (!levels.length) return null
  return Math.max(...levels)
}

// ── Confidence scoring ───────────────────────────────────────────────────────
// Reflect data completeness: price coverage, supplier count, rating coverage.

function scoreConfidence(
  priced:       number,  // count of products with valid price data
  totalSuppliers: number,
  hasRatings:   boolean,
): { confidence: number; confidence_label: ConfidenceLabel } {
  const priceScore   = priced >= 10 ? 0.4 : priced >= 5 ? 0.3 : priced >= 2 ? 0.15 : 0
  const supplyScore  = totalSuppliers >= 100 ? 0.35 : totalSuppliers >= 30 ? 0.25 : totalSuppliers >= 10 ? 0.15 : 0
  const ratingScore  = hasRatings ? 0.25 : 0

  const confidence = Math.min(0.90, priceScore + supplyScore + ratingScore)
  const confidence_label: ConfidenceLabel =
    confidence >= 0.65 ? 'High' : confidence >= 0.40 ? 'Medium' : 'Low'

  return { confidence, confidence_label }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class AlibabaProvider implements ManufacturingProvider {
  readonly id      = 'alibaba' as const
  readonly enabled = !!(process.env.ALIBABA_APP_KEY && process.env.ALIBABA_APP_SECRET)

  async fetch(req: ManufacturingRequest): Promise<ManufacturingEstimate | null> {
    if (!this.enabled) return null

    const appKey    = process.env.ALIBABA_APP_KEY!
    const appSecret = process.env.ALIBABA_APP_SECRET!
    const query     = buildQuery(req)

    const params: Record<string, string> = {
      q:        query,
      language: 'en_US',
      pageSize: '20',
      sort:     '0',    // relevance
    }

    const url = new URL(`${API_BASE}/${appKey}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('sign', sign(params, appSecret))

    let products:    AlibabaProduct[] = []
    let totalCount:  number            = 0

    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal:  AbortSignal.timeout(8_000),
      })

      if (!res.ok) {
        console.error('[AlibabaProvider] HTTP error', res.status, url.pathname)
        return null
      }

      const body = await res.json() as AlibabaSearchResponse

      if (body.errorCode) {
        console.error('[AlibabaProvider] API error', body.errorCode, body.errorMessage)
        return null
      }

      products   = body.result?.products ?? []
      totalCount = body.result?.totalCount ?? products.length
    } catch (e) {
      console.error('[AlibabaProvider] fetch error', e instanceof Error ? e.message : e)
      return null
    }

    if (!products.length) return null

    // ── Normalise all fields ─────────────────────────────────────────────────
    const priceRange  = extractPriceRange(products)
    const priced      = products.filter(p => (p.minPrice ?? 0) > 0).length
    const moqSample   = products.find(p => p.moq) ?? products[0]
    const moq         = parseMOQ(moqSample?.moq, moqSample?.moqUnit)
    const leadTime    = extractLeadTime(products, req)
    const rating      = topRating(products)
    const { confidence, confidence_label } = scoreConfidence(priced, totalCount, rating !== null)

    const complexity: ManufacturingComplexity =
      req.complexity === 'Low'  ? 'Low'  :
      req.complexity === 'High' ? 'High' : 'Medium'

    if (!priceRange) {
      // Supplier count present but no price data — not enough to return a useful estimate
      console.log('[AlibabaProvider] no priced products found', { query, products: products.length })
      return null
    }

    console.log('[AlibabaProvider] estimate built', {
      query,
      products:     products.length,
      totalCount,
      priced,
      priceRange,
      moq:          moq ? `${moq.low}–${moq.high} ${moq.unit}` : 'N/A',
      leadTime:     `${leadTime.low}–${leadTime.high} days`,
      confidence:   `${Math.round(confidence * 100)}%`,
    })

    return {
      product:            req.product,
      category:           req.category,
      unit_cost:          { ...priceRange, currency: 'USD' },
      moq,
      supplier_count:     {
        estimate:   Math.min(totalCount, 9_999),
        confidence: totalCount >= 100 ? 'High' : totalCount >= 30 ? 'Medium' : 'Low',
      },
      top_supplier_rating: rating,
      lead_time_days:     leadTime,
      complexity,
      confidence,
      confidence_label,
      data_source:        'alibaba',
      notes:              `Based on ${priced} priced Alibaba.com listings for "${query}" (${totalCount.toLocaleString()} total). Prices reflect per-unit cost at high-volume tier.`,
      fetched_at:         new Date().toISOString(),
    }
  }
}
