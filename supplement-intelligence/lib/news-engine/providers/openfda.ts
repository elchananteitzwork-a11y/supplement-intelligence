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
  // CONFIRMED VIA LIVE CALL 2026-06-26 (food/enforcement, 3 real records):
  // both fields are real and consistently present. classification values
  // seen live: "Class II", "Not Yet Classified". status seen live: "Ongoing".
  classification?:       string
  status?:                string
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
      // openFDA returns 404 for "zero records matched" — a real, checked
      // result (cache it as such). Any other non-ok status (429, 5xx, etc.)
      // is a genuine failed check, not a verified-clean one — must NOT be
      // cached as if it were, and must propagate so the caller (the Safety
      // Gate, via NewsEngine's failedProviders) can tell the two apart.
      if (res.status === 404) {
        cacheSet(cacheKey, [], CACHE_TTL_MS)
        return []
      }
      console.warn('[openFDA] HTTP error', { endpoint, status: res.status })
      throw new Error(`openFDA ${endpoint} HTTP ${res.status}`)
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
          recall_classification: r.classification || undefined,
          recall_status:         r.status || undefined,
        }
      })
      .filter((x): x is NewsItem => x !== null)

    cacheSet(cacheKey, items, CACHE_TTL_MS)
    return items
  } catch (e: unknown) {
    // Network error, timeout, or the HTTP-error throw above — a genuine
    // failed check, never cached, and re-thrown (not swallowed to []) so
    // NewsEngine records this provider as failed rather than "ran, found
    // nothing" — see engine.ts failedProviders.
    console.warn('[openFDA] fetch failed', { endpoint, error: e instanceof Error ? e.message : e })
    throw e
  }
}

// ── CAERS adverse-event reports (/food/event) ───────────────────────────────
// CONFIRMED VIA LIVE CALL 2026-06-27: real, queryable dataset — 1,766 records
// for "magnesium" as a products.name_brand match alone. Distinct from a
// recall: this is a consumer-reported reaction, not a regulatory action — no
// admission of cause is implied (openFDA's own disclaimer says so), and the
// UI must not present it as "the FDA recalled this." Same product-relevance
// risk as a recall search: name_brand can match a CONCOMITANT product the
// consumer also happened to be taking, not the one actually suspected — so
// this filters to reports where the keyword matches a product specifically
// in the SUSPECT role, same spirit as the existing haystack relevance check
// on the recalls endpoint above.

const CAERS_API_BASE = 'https://api.fda.gov/food/event.json'
const CAERS_INFO_PAGE = 'https://www.fda.gov/food/compliance-enforcement/cfsan-adverse-event-reporting-system-caers'
const MAX_ADVERSE_EVENTS = 5

interface FdaEventProduct { name_brand?: string; role_code?: string; role?: string }
interface FdaEventResult {
  report_number?: string
  reactions?:     string[]
  date_created?:  string   // YYYYMMDD
  products?:      FdaEventProduct[]
}

async function fetchAdverseEvents(keyword: string, windowDays: number): Promise<NewsItem[]> {
  const cacheKey = `openfda:caers:${keyword}:${windowDays}`
  const cached = cacheGet<NewsItem[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `${CAERS_API_BASE}?search=products.name_brand:"${encodeURIComponent(keyword)}"&limit=20&sort=date_created:desc`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      // 404 = real "zero records" result, cached as such (same as
      // fetchEndpoint above). Any other status is a genuine failed check —
      // NOT cached (so the next request gets a fresh attempt, not a false
      // "clean" reading for 6h), but also NOT re-thrown: unlike the recall
      // checks below, a CAERS-only failure doesn't void this provider's
      // higher-confidence recall data (HARDENING FIX 2026-06-28 — the
      // original D1 fix made ANY of the 3 sub-checks failing discard all
      // 3, which was over-conservative for the one lowest-confidence,
      // lowest-gate-weight signal of the three; see computeSafetyGateTier,
      // which only escalates on adverse events at a >=2 threshold, well
      // below the recall checks' single-item SKIP/VALIDATE_FURTHER bars).
      if (res.status !== 404) console.warn('[openFDA CAERS] HTTP error', { status: res.status })
      if (res.status === 404) cacheSet(cacheKey, [], CACHE_TTL_MS)
      return []
    }
    const data: { results?: FdaEventResult[] } = await res.json()
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000
    const kwLower = keyword.toLowerCase()

    const items: NewsItem[] = (data.results ?? [])
      .map((r, i): NewsItem | null => {
        const date = parseFdaDate(r.date_created)
        if (!date || new Date(date).getTime() < cutoff) return null
        if (!r.reactions?.length) return null
        // Require the keyword to match a product specifically marked SUSPECT,
        // not just any product (incl. concomitant) in the report.
        const suspectMatch = (r.products ?? []).some(
          p => p.role === 'SUSPECT' && p.name_brand?.toLowerCase().includes(kwLower),
        )
        if (!suspectMatch) return null
        const reactions = r.reactions.slice(0, MAX_ADVERSE_EVENTS)
        return {
          id:         `openfda-caers-${i}`,
          headline:   `Consumer-Reported Reaction: ${reactions.slice(0, 3).join(', ')}`,
          date,
          source:     'FDA CAERS',
          url:        CAERS_INFO_PAGE,
          category:   'Adverse Event Signal',
          // Lower than recalls' 0.95 — CAERS is a real dataset but, per
          // openFDA's own disclaimer, an unverified consumer report, not a
          // confirmed cause-and-effect finding the way a recall is.
          confidence: 0.7,
          provider:   'openfda',
          adverse_event_reactions: reactions,
        }
      })
      .filter((x): x is NewsItem => x !== null)
      .slice(0, MAX_ADVERSE_EVENTS)

    cacheSet(cacheKey, items, CACHE_TTL_MS)
    return items
  } catch (e: unknown) {
    // Swallowed, not re-thrown — see the HTTP-error branch above for why a
    // CAERS-only failure shouldn't void this provider's recall data.
    console.warn('[openFDA CAERS] fetch failed', { error: e instanceof Error ? e.message : e })
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

    const [food, drug, adverseEvents] = await Promise.all([
      fetchEndpoint('food', keyword, ctx.windowDays),
      fetchEndpoint('drug', keyword, ctx.windowDays),
      fetchAdverseEvents(keyword, ctx.windowDays),
    ])
    return [...food, ...drug, ...adverseEvents]
  }
}
