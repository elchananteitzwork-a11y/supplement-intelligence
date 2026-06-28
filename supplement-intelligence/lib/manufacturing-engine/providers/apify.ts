import type {
  ManufacturingProvider,
  ManufacturingRequest,
  ManufacturingEstimate,
  ManufacturingComplexity,
  ConfidenceLabel,
} from '../types'

// ── Apify Xtracto Alibaba Products Search Scraper provider ───────────────────
// Actor:  xtracto/alibaba-search-scraper
// Docs:   https://apify.com/xtracto/alibaba-search-scraper/api
// Auth:   APIFY_API_TOKEN (Personal API token from console.apify.com/account/integrations)
//
// The RESIDENTIAL proxy group causes Alibaba to return prices in the proxy's
// local currency (ZAR, JMD, etc.). The price parser converts to approximate USD.
//
// Enabled only when APIFY_API_TOKEN is set.
// Returns null on any failure → engine falls through to AI estimate.

const ACTOR_ENDPOINT =
  'https://api.apify.com/v2/acts/xtracto~alibaba-search-scraper/run-sync-get-dataset-items'

// ── Apify response types ─────────────────────────────────────────────────────

interface ApifyProduct {
  title?:             string
  priceFormatted?:    string   // e.g. "R 25,13-40,21" or "JMD 237.07-379.30"
  minOrderQuantity?:  string   // e.g. "Min. order: 500 boxes"
  companyName?:       string
  tradeAssurance?:    boolean
  goldSupplierYears?: string   // e.g. "6 yrs"
  countryCode?:       string   // real, present on every result — was typed but never read until 2026-06-27
  supplierScore?:     string | number  // 0–5
  productId?:         string
  url?:               string
  // CONFIRMED VIA LIVE CALL 2026-06-27: real boolean field, present on
  // every result — directly answers whether this supplier offers
  // OEM/private-label customization, the core question this tab exists
  // to answer for a not-yet-built product.
  customizable?:      boolean
}

// ── Category suffix ───────────────────────────────────────────────────────────

const CATEGORY_SUFFIX: Record<string, string> = {
  supplements:      'OEM private label capsule manufacturer',
  beauty:           'OEM cosmetic skincare manufacturer',
  pets:             'OEM pet supplement treat manufacturer',
  fitness:          'OEM sports nutrition manufacturer',
  'consumer goods': 'manufacturer supplier OEM',
}

function buildQuery(req: ManufacturingRequest): string {
  const suffix = CATEGORY_SUFFIX[req.category.toLowerCase()] ?? 'manufacturer OEM'
  return `${req.product} ${suffix}`
}

// ── Price parsing with USD conversion ────────────────────────────────────────
// Residential proxies serve Alibaba in the proxy's local currency.
// Approximate conversion rates to USD. These are directional estimates —
// the manufacturing score analysis is the authoritative signal.

const TO_USD: Record<string, number> = {
  USD: 1,      CNY: 0.138, ZAR: 0.054,  JMD: 0.0065,
  EUR: 1.08,   GBP: 1.27,  INR: 0.012,  BRL: 0.19,
  AUD: 0.64,   CAD: 0.73,  MXN: 0.052,  THB: 0.028,
  ARS: 0.001,  PHP: 0.017, CLP: 0.001,  PEN: 0.26,
  COP: 0.00023, NGN: 0.00063, EGP: 0.02, PKR: 0.0036,
}

function parseNumericValue(s: string): number {
  const clean = s.trim().replace(/\s+/g, '')
  // European format: comma is decimal separator (e.g. "25,13")
  if (/,\d{1,2}$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.'))
  }
  // American format: period is decimal separator (e.g. "237.07")
  return parseFloat(clean.replace(/,/g, ''))
}

function parsePrice(formatted: string): { low: number; high: number } | null {
  const trimmed = formatted.trim()
  // Match currency prefix: $, €, £, ¥, standalone R, or 2-4 uppercase letters
  const m = trimmed.match(/^(\$|€|£|¥|R(?!\w)|[A-Z]{2,4})\s*(.+)$/)
  if (!m) return null

  const symbol  = m[1].trim()
  const numPart = m[2]

  const parts = numPart
    .split(/\s*[-–]\s*/)
    .map(parseNumericValue)
    .filter(n => n > 0 && n < 1_000_000)

  if (!parts.length) return null

  const code: string =
    symbol === '$' ? 'USD' :
    symbol === 'R' ? 'ZAR' :
    symbol === '¥' ? 'CNY' :
    symbol === '€' ? 'EUR' :
    symbol === '£' ? 'GBP' : symbol

  const rate = TO_USD[code] ?? 0.1
  const low  = +(Math.min(...parts) * rate).toFixed(2)
  const high = +(Math.max(...parts) * rate).toFixed(2)
  return { low: Math.max(low, 0.01), high: Math.max(high, low) }
}

function extractPriceRange(
  products: ApifyProduct[],
): { low: number; high: number } | null {
  const priced = products
    .map(p => (p.priceFormatted ? parsePrice(p.priceFormatted) : null))
    .filter((r): r is { low: number; high: number } => r !== null)

  if (!priced.length) return null

  priced.sort((a, b) => a.low - b.low)
  const p25 = priced[Math.floor(priced.length * 0.25)]
  const p75 = priced[Math.floor(priced.length * 0.75)]
  return { low: p25.low, high: p75.high }
}

// Real per-listing MOQ quantity, same regex `extractPriceRange`'s sibling
// `parseMOQ` already uses, just returning the raw number instead of
// folding it into an aggregate range — needed here to pair MOQ with price
// on the SAME listing rather than computing each independently.
function parseMOQQuantity(minOrderQuantity: string | undefined): number | null {
  if (!minOrderQuantity) return null
  const qtyMatch = minOrderQuantity.match(/[\d,]+/)
  if (!qtyMatch) return null
  const qty = parseInt(qtyMatch[0].replace(/,/g, ''), 10)
  return qty > 0 && qty <= 1_000_000 ? qty : null
}

// Real COGS filtered to the MOQ tier an actual first-order buyer could
// access (2026-06-28 Decision Engine redesign — see realistic_unit_cost on
// ManufacturingEstimate). Unlike extractPriceRange, this pairs MOQ and price
// on the SAME listing: takes the bottom tercile by MOQ, then the median
// price within that filtered, achievable-order-size subset. Returns null
// (never a backfilled guess) when fewer than 3 listings have both a parsed
// MOQ and a parsed price — too thin a sample to filter meaningfully.
function extractRealisticUnitCost(
  products: ApifyProduct[],
): { low: number; high: number } | null {
  const paired = products
    .map(p => {
      const qty   = parseMOQQuantity(p.minOrderQuantity)
      const price = p.priceFormatted ? parsePrice(p.priceFormatted) : null
      return qty !== null && price !== null ? { qty, price } : null
    })
    .filter((r): r is { qty: number; price: { low: number; high: number } } => r !== null)

  if (paired.length < 3) return null

  paired.sort((a, b) => a.qty - b.qty)
  const tercileEnd = Math.max(1, Math.ceil(paired.length / 3))
  const lowMoqTier = paired.slice(0, tercileEnd)

  const prices = lowMoqTier.map(p => p.price.low).sort((a, b) => a - b)
  const median = prices[Math.floor(prices.length / 2)]
  // A real, narrow band around the median (±15%) rather than a single point —
  // consistent with every other ManufacturingEstimate field being a range,
  // not a point estimate, and avoids implying more precision than a median
  // of a handful of listings actually supports.
  return { low: +(median * 0.85).toFixed(2), high: +(median * 1.15).toFixed(2) }
}

// ── MOQ parsing ───────────────────────────────────────────────────────────────
// minOrderQuantity: "Min. order: 500 boxes" | "Min. order: 1,000 units"

const UNIT_MAP: Record<string, string> = {
  piece: 'units', unit: 'units', box: 'boxes',
  bag: 'bags', set: 'sets', kg: 'kg', kilogram: 'kg',
}

function parseMOQ(products: ApifyProduct[]): { low: number; high: number; unit: string } {
  const parsed: Array<{ qty: number; unit: string }> = []

  for (const p of products) {
    if (!p.minOrderQuantity) continue
    const qtyMatch = p.minOrderQuantity.match(/[\d,]+/)
    if (!qtyMatch) continue
    const qty = parseInt(qtyMatch[0].replace(/,/g, ''), 10)
    if (!qty || qty > 1_000_000) continue
    const rawUnit = (p.minOrderQuantity.split(/\s+/).pop() ?? 'units').toLowerCase().replace(/s$/, '')
    parsed.push({ qty, unit: UNIT_MAP[rawUnit] ?? 'units' })
  }

  if (!parsed.length) return { low: 500, high: 2000, unit: 'units' }

  parsed.sort((a, b) => a.qty - b.qty)
  const p25  = parsed[Math.floor(parsed.length * 0.25)]
  const p75  = parsed[Math.floor(parsed.length * 0.75)]
  const unit = parsed[Math.floor(parsed.length / 2)].unit

  return { low: p25.qty, high: Math.max(p75.qty, p25.qty + 100), unit }
}

// ── Supplier rating ───────────────────────────────────────────────────────────
// supplierScore (0–5) takes priority; fall back to goldSupplierYears → 1–5 scale.

function topRating(products: ApifyProduct[]): number | null {
  const scores = products
    .map(p => {
      const v = typeof p.supplierScore === 'number'
        ? p.supplierScore
        : parseFloat(p.supplierScore ?? '')
      return isNaN(v) ? null : v
    })
    .filter((n): n is number => n !== null && n >= 1 && n <= 5)

  if (scores.length) return Math.max(...scores)

  // Fallback: gold supplier years → 1–5 scale (1 yr=1, 5 yrs=2, 10 yrs=3, 15 yrs=4, 20+ yrs=5)
  const years = products
    .map(p => parseInt((p.goldSupplierYears ?? '').match(/\d+/)?.[0] ?? '', 10))
    .filter(n => !isNaN(n) && n > 0)

  if (!years.length) return null
  return Math.min(5, Math.round(Math.max(...years) / 4) + 1)
}

// ── Supplier identity ──────────────────────────────────────────────────────────
// companyName is a real field on every Apify result (confirmed present in the
// existing ApifyProduct interface) but was never read — supplier_count gave a
// number with no names attached, no actual diligence trail. Ranked by the
// same scoring this provider already trusts for top_supplier_rating: real
// supplierScore first, gold-supplier years as fallback, matching topRating's
// own preference order so the "top" suppliers shown are the same ones that
// drove the rating number above them.
const MAX_TOP_SUPPLIERS = 5

function topSuppliers(products: ApifyProduct[]): ManufacturingEstimate['top_suppliers'] {
  const named = products.filter(p => p.companyName?.trim())
  if (!named.length) return undefined

  const scored = named.map(p => {
    const numericScore = typeof p.supplierScore === 'number' ? p.supplierScore : parseFloat(p.supplierScore ?? '')
    const years = parseInt((p.goldSupplierYears ?? '').match(/\d+/)?.[0] ?? '', 10)
    const rank = !isNaN(numericScore) ? numericScore : !isNaN(years) ? years / 4 : 0
    return { p, rank }
  })

  scored.sort((a, b) => b.rank - a.rank)

  const seen = new Set<string>()
  const result: NonNullable<ManufacturingEstimate['top_suppliers']> = []
  for (const { p } of scored) {
    const name = p.companyName!.trim()
    if (seen.has(name)) continue
    seen.add(name)
    const numericScore = typeof p.supplierScore === 'number' ? p.supplierScore : parseFloat(p.supplierScore ?? '')
    result.push({
      name,
      rating:              !isNaN(numericScore) && numericScore >= 1 && numericScore <= 5 ? numericScore : null,
      trade_assurance:      p.tradeAssurance,
      gold_supplier_years:  p.goldSupplierYears,
      country_code:         p.countryCode,
      customizable:         p.customizable,
    })
    if (result.length >= MAX_TOP_SUPPLIERS) break
  }
  return result
}

// ── Lead time (category fallback — Apify actor doesn't expose this field) ─────

function estimateLeadTime(req: ManufacturingRequest): { low: number; high: number } {
  const cat        = req.category.toLowerCase()
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

// ── Confidence ────────────────────────────────────────────────────────────────

function scoreConfidence(
  priced:     number,
  total:      number,
  hasRatings: boolean,
): { confidence: number; confidence_label: ConfidenceLabel } {
  const priceScore  = priced >= 10 ? 0.4 : priced >= 5 ? 0.3 : priced >= 2 ? 0.15 : 0
  const supplyScore = total  >= 30  ? 0.35 : total  >= 10 ? 0.2  : total  >= 3  ? 0.1  : 0
  const ratingScore = hasRatings ? 0.25 : 0
  const confidence  = Math.min(0.90, priceScore + supplyScore + ratingScore)
  const confidence_label: ConfidenceLabel =
    confidence >= 0.65 ? 'High' : confidence >= 0.40 ? 'Medium' : 'Low'
  return { confidence, confidence_label }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class ApifyProvider implements ManufacturingProvider {
  readonly id      = 'apify' as const
  readonly enabled = !!process.env.APIFY_API_TOKEN

  async fetch(req: ManufacturingRequest): Promise<ManufacturingEstimate | null> {
    if (!this.enabled) return null

    const token   = process.env.APIFY_API_TOKEN!
    const query   = buildQuery(req)
    const apiUrl  = `${ACTOR_ENDPOINT}?token=${token}&timeout=25`

    let products: ApifyProduct[] = []

    try {
      const res = await fetch(apiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries:            [query],
          maxPagesPerQuery:   1,
          proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
        }),
        signal: AbortSignal.timeout(26_000),
      })

      if (!res.ok) {
        console.error('[ApifyProvider] HTTP error', res.status)
        return null
      }

      products = await res.json() as ApifyProduct[]
    } catch (e) {
      console.error('[ApifyProvider] fetch error', e instanceof Error ? e.message : e)
      return null
    }

    if (!products.length) return null

    const priceRange = extractPriceRange(products)
    if (!priceRange) {
      console.log('[ApifyProvider] no priced products', { query, products: products.length })
      return null
    }

    const priced    = products.filter(p => p.priceFormatted && parsePrice(p.priceFormatted)).length
    const moq       = parseMOQ(products)
    const leadTime  = estimateLeadTime(req)
    const rating    = topRating(products)
    const suppliers = topSuppliers(products)
    const realisticUnitCost = extractRealisticUnitCost(products)
    const { confidence, confidence_label } = scoreConfidence(priced, products.length, rating !== null)

    const complexity: ManufacturingComplexity =
      req.complexity === 'Low'  ? 'Low'  :
      req.complexity === 'High' ? 'High' : 'Medium'

    console.log('[ApifyProvider] estimate built', {
      query,
      products:   products.length,
      priced,
      priceRange,
      realisticUnitCost: realisticUnitCost ? `${realisticUnitCost.low}–${realisticUnitCost.high}` : 'n/a',
      moq:        `${moq.low}–${moq.high} ${moq.unit}`,
      leadTime:   `${leadTime.low}–${leadTime.high} days`,
      confidence: `${Math.round(confidence * 100)}%`,
      named_suppliers: suppliers?.length ?? 0,
    })

    return {
      product:             req.product,
      category:            req.category,
      unit_cost:           { ...priceRange, currency: 'USD' },
      realistic_unit_cost: realisticUnitCost ? { ...realisticUnitCost, currency: 'USD' } : undefined,
      moq,
      supplier_count:      {
        estimate:   products.length,
        confidence: products.length >= 30 ? 'High' : products.length >= 10 ? 'Medium' : 'Low',
      },
      top_supplier_rating: rating,
      lead_time_days:      leadTime,
      complexity,
      confidence,
      confidence_label,
      data_source:         'apify',
      notes:               `Based on ${priced} priced Alibaba.com listings via Apify for "${query}" (${products.length} total). Prices converted to approximate USD.`,
      fetched_at:          new Date().toISOString(),
      top_suppliers:       suppliers,
    }
  }
}
