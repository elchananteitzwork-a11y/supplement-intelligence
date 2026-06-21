import type { Competitor } from './types'

// ── Keepa constants (mirrors lib/signal-engine/providers/keepa.ts) ─────────
// Kept local to avoid coupling the competitive engine to the signal engine.

const KEEPA_API = 'https://api.keepa.com'
const NO_DATA   = -1

// ── Raw Keepa shapes ───────────────────────────────────────────────────────

interface KeepaStats {
  current?: number[]
  avg90?:   number[]
}

interface KeepaProduct {
  asin:         string
  title?:       string
  brand?:       string
  stats?:       KeepaStats
  monthlySold?: number
}

interface KeepaProductResponse {
  products?: KeepaProduct[]
}

interface KeepaBestsellerResponse {
  bestSellersList?: { asinList?: string[] }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statVal(
  stats: KeepaStats | undefined,
  field: 'current' | 'avg90',
  idx:   number,
): number | null {
  const arr = stats?.[field]
  if (!Array.isArray(arr) || arr.length <= idx) return null
  const v = arr[idx]
  return v === undefined || v === NO_DATA ? null : v
}

// ── Public functions ───────────────────────────────────────────────────────

// Fetch the ranked bestseller ASIN list for a Keepa category node.
// Returns at most `maxCount` ASINs, ordered by current sales rank.
export async function fetchCompetitorASINs(
  nodeId:    number,
  maxCount:  number,
  apiKey:    string,
  timeoutMs: number,
): Promise<string[]> {
  const url =
    `${KEEPA_API}/bestsellers` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&domain=1` +
    `&category=${nodeId}`

  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) {
    throw new Error(
      `Keepa bestsellers failed: HTTP ${res.status} for node ${nodeId}`
    )
  }

  const data: KeepaBestsellerResponse = await res.json()
  const asins = data.bestSellersList?.asinList ?? []

  console.log('[CompetitorResolver] bestsellers fetched', {
    node_id:   nodeId,
    available: asins.length,
    returning: Math.min(asins.length, maxCount),
  })

  return asins.slice(0, maxCount)
}

// Fetch product details (title, brand, BSR, price) for up to 100 ASINs.
// Keepa charges ~1 token per product; batched to a single API call.
export async function fetchCompetitorDetails(
  asins:     string[],
  apiKey:    string,
  timeoutMs: number,
): Promise<Competitor[]> {
  if (!asins.length) return []

  // Keepa product endpoint accepts up to 100 ASINs per call
  const batches: string[][] = []
  for (let i = 0; i < asins.length; i += 100) {
    batches.push(asins.slice(i, i + 100))
  }

  const competitors: Competitor[] = []

  for (const batch of batches) {
    const url =
      `${KEEPA_API}/product` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&domain=1` +
      `&asin=${batch.join(',')}` +
      `&stats=365`

    let res: Response
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    } catch (err) {
      console.error('[CompetitorResolver] product fetch error', err)
      continue
    }

    if (!res.ok) {
      console.error('[CompetitorResolver] product HTTP error', { status: res.status })
      continue
    }

    let data: KeepaProductResponse
    try { data = await res.json() as KeepaProductResponse } catch { continue }

    for (const p of data.products ?? []) {
      // CSV index 3 = BSR in root category (confirmed in keepa.ts)
      const bsr    = statVal(p.stats, 'current', 3)
      // Buybox price index 18, fallback to Amazon price index 0 (in Keepa cents)
      const rawPx  = statVal(p.stats, 'avg90', 18) ?? statVal(p.stats, 'avg90', 0)

      competitors.push({
        asin:  p.asin,
        title: p.title?.trim()  || undefined,
        brand: p.brand?.trim()  || undefined,
        bsr:   bsr  !== null && bsr  > 0 ? bsr         : undefined,
        price: rawPx !== null && rawPx > 0 ? rawPx / 100 : undefined,
      })
    }
  }

  return competitors
}

// Convenience wrapper: resolve and enrich in one call.
// Used by CompetitiveReviewEngine.analyzeByNode().
export async function resolveCompetitors(
  nodeId:      number,
  maxProducts: number,
  apiKey:      string,
  timeoutMs:   number,
): Promise<Competitor[]> {
  const asins  = await fetchCompetitorASINs(nodeId, maxProducts, apiKey, timeoutMs)
  if (!asins.length) return []
  const details = await fetchCompetitorDetails(asins, apiKey, timeoutMs)

  // Preserve the bestseller ranking order; fill any Keepa misses with stub entries
  const map = new Map(details.map(c => [c.asin, c]))
  return asins.map(asin => map.get(asin) ?? { asin })
}
