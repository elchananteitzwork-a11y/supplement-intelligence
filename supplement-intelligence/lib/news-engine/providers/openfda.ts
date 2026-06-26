import type { NewsProvider, NewsContext, NewsItem } from '../types'
import { toPrimaryKeyword } from '../keyword'
import { cacheGet, cacheSet } from '../cache'

// ── openFDA — real FDA recall data ───────────────────────────────────────────
// Free, public, government data — no API key required, no ToS restriction
// (https://open.fda.gov/license/ is explicit public-domain-style open data,
// built for exactly this kind of programmatic use). Covers /food/enforcement
// (dietary supplements are regulated as food) and /drug/enforcement.
//
// Scope: recalls only. FDA "Warning Letters" are not in openFDA's structured
// API (they live on a separate FDA.gov page with no JSON endpoint) — rather
// than scrape an unstructured page, this provider is recalls-only and says
// so; a dedicated warning-letters provider could be added later without
// touching this one (NewsProvider is a list, not a single source).
//
// No per-recall deep-link URL exists in the openFDA data (no such field) —
// every item links to FDA's real, official recalls index
// (fda.gov/safety/recalls-market-withdrawals-safety-alerts), with the real
// recall number in the headline so it's still independently verifiable.
// Categories this applies to: dietary-supplement-adjacent categories only —
// "home" goods aren't FDA-regulated, so this provider skips it entirely.

const FDA_API   = 'https://api.fda.gov'
const FDA_RECALLS_PAGE = 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts'
const APPLICABLE_CATEGORIES = new Set(['supplements', 'beauty', 'pets', 'fitness'])
const CACHE_TTL_MS = 6 * 60 * 60 * 1000   // 6h — recall data doesn't change minute to minute

interface FdaEnforcementResult {
  recalling_firm?:       string
  reason_for_recall?:    string
  product_description?:  string
  recall_number?:        string
  report_date?:          string   // YYYYMMDD
  classification?:       string
}

function parseFdaDate(yyyymmdd: string | undefined): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null
  const iso = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

async function fetchEndpoint(
  endpoint: 'food' | 'drug',
  keyword: string,
  windowDays: number,
): Promise<NewsItem[]> {
  const cacheKey = `openfda:${endpoint}:${keyword}:${windowDays}`
  const cached = cacheGet<NewsItem[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `${FDA_API}/${endpoint}/enforcement.json?search=product_description:"${encodeURIComponent(keyword)}"&limit=10&sort=report_date:desc`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      if (res.status !== 404) console.warn('[openFDA] HTTP error', { endpoint, status: res.status })
      cacheSet(cacheKey, [], CACHE_TTL_MS)
      return []
    }
    const data: { results?: FdaEnforcementResult[] } = await res.json()
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000

    const items: NewsItem[] = (data.results ?? [])
      .map((r, i): NewsItem | null => {
        const date = parseFdaDate(r.report_date)
        if (!date || new Date(date).getTime() < cutoff) return null
        if (!r.recalling_firm || !r.reason_for_recall) return null
        // openFDA's search tokenizes hyphenated terms (e.g. "pre-workout"
        // matches on "pre" alone) — confirmed live (2026-06-26): a search
        // for "pre-workout" returned a salad recall whose description says
        // "pre-packaged," not "pre-workout." Not a hallucination (the
        // record is real), but a relevance false-positive worth filtering:
        // require the literal keyword phrase to actually appear somewhere
        // in the record before accepting the match.
        const haystack = `${r.product_description ?? ''} ${r.reason_for_recall} ${r.recalling_firm}`.toLowerCase()
        if (!haystack.includes(keyword.toLowerCase())) return null
        return {
          id:         `openfda-${endpoint}-${i}`,
          headline:   `FDA Recall: ${r.recalling_firm} — ${r.reason_for_recall}${r.recall_number ? ` (Recall #${r.recall_number})` : ''}`,
          date,
          source:     'FDA',
          url:        FDA_RECALLS_PAGE,
          category:   'FDA Recall',
          confidence: 0.95,   // openFDA is authoritative + exact product_description match
          provider:   'openfda',
        }
      })
      .filter((x): x is NewsItem => x !== null)

    cacheSet(cacheKey, items, CACHE_TTL_MS)
    return items
  } catch (e: unknown) {
    console.warn('[openFDA] fetch failed', { endpoint, error: e instanceof Error ? e.message : e })
    return []
  }
}

export class OpenFdaProvider implements NewsProvider {
  readonly name    = 'openfda'
  readonly enabled = true

  async fetch(ctx: NewsContext): Promise<NewsItem[]> {
    if (ctx.categoryId && !APPLICABLE_CATEGORIES.has(ctx.categoryId)) return []
    const keyword = toPrimaryKeyword(ctx.query)
    if (!keyword) return []

    const [food, drug] = await Promise.all([
      fetchEndpoint('food', keyword, ctx.windowDays),
      fetchEndpoint('drug', keyword, ctx.windowDays),
    ])
    return [...food, ...drug]
  }
}
