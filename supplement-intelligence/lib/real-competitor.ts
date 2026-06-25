// ── Real biggest-competitor grounding ───────────────────────────────────────
//
// Replaces the model's invented biggest_competitor.name/.revenue (previously
// "best-guess recall from training knowledge — not pulled from Crunchbase,
// SEC filings, or any company database," per lib/provenance.ts) with real
// data already within reach:
//   - name:    the real #1 competitor by review count, already found by
//              Competition Intelligence (signal_evidence.review_velocity.
//              top_competitors[0]) for this EXACT query — not a category
//              guess.
//   - revenue: a targeted Keepa lookup on that exact ASIN for its real price
//              and real monthlySold estimate. Same Keepa account already
//              paid for; this is one extra ~5-token product call, not a new
//              vendor.

const KEEPA_API = 'https://api.keepa.com'
const NO_DATA = -1

interface KeepaSingleProduct {
  monthlySold?: number
  stats?: { avg90?: number[] }
}

function keepaPrice(raw: number | undefined): number | null {
  if (raw === undefined || raw === NO_DATA || raw <= 0) return null
  return raw / 100
}

export interface RealCompetitorRevenue {
  asin:        string
  brand:       string
  price:       number
  monthlySold: number
  revenue:     number
}

// Fetches real price + real monthlySold for one specific ASIN and computes
// real revenue (price × units) — a measured/platform-estimated fact about
// THIS exact competitor, not a category-wide average and not a guess.
export async function fetchRealCompetitorRevenue(
  asin:  string,
  brand: string,
): Promise<RealCompetitorRevenue | null> {
  const key = process.env.KEEPA_API_KEY
  if (!key) return null

  try {
    const url = `${KEEPA_API}/product?key=${encodeURIComponent(key)}&domain=1&asin=${encodeURIComponent(asin)}&stats=90`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.error('Real competitor lookup: Keepa HTTP error', { status: res.status, asin })
      return null
    }

    const data: { products?: KeepaSingleProduct[] } = await res.json()
    const product = data.products?.[0]
    if (!product) return null

    const price = keepaPrice(product.stats?.avg90?.[0])
    const monthlySold = product.monthlySold

    if (price === null || !monthlySold || monthlySold <= 0) return null

    return { asin, brand, price, monthlySold, revenue: Math.round(price * monthlySold) }
  } catch (e: unknown) {
    console.error('Real competitor lookup failed', { asin, error: e instanceof Error ? e.message : e })
    return null
  }
}

function fmtRevenue(n: number): string {
  return n >= 1_000_000 ? `$${Math.round(n / 100_000) / 10}M/mo` : `$${Math.round(n / 1000)}k/mo`
}

export function formatRealCompetitorRevenue(r: RealCompetitorRevenue): string {
  return fmtRevenue(r.revenue)
}
