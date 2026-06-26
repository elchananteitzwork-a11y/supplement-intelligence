import type { KeywordProvider, KeywordIntelligence, KeywordMetric } from './types'

// ── DataForSEO Labs — Related Keywords (live) ──────────────────────────────
//
// Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live/
// Auth: HTTP Basic, login:password from your DataForSEO dashboard
//   (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD — separate from any other API key
//   in this project). Pay-as-you-go, no monthly minimum at time of writing.
//
// CONFIRMED VIA LIVE CALL (2026-06-24, keyword "bloating supplement",
// depth:1/limit:10, cost $0.0109/call): real HTTP 200, real status_code 20000,
// `items[]` is a flat list (seed + related), each with its own full
// `keyword_data` — not just the seed. Found and fixed one real bug this
// exposed: monthly_searches is ordered most-recent-first, not chronological,
// which had silently inverted every growth percentage (see computeGrowthPct).
// Also added use of `search_volume_trend.yearly`, a real DataForSEO field
// this file wasn't using, in preference to our own derived estimate.
//
// Real fields used, all from DataForSEO directly:
//   keyword_info.search_volume        — real monthly search volume (US, Google)
//   keyword_info.search_volume_trend.yearly — DataForSEO's own pre-computed YoY % (preferred)
//   keyword_info.monthly_searches[]   — real 12-month volume history (fallback growth source)
//   keyword_info.competition          — real 0–1 advertiser-competition index
//   keyword_info.cpc                  — real average advertiser CPC
//   keyword_properties.keyword_difficulty — real 0–100 organic difficulty score

const ENDPOINT = 'https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live'
const US_LOCATION_CODE = 2840

const MIN_VOLUME_FOR_OPPORTUNITY = 200
const MAX_DIFFICULTY_FOR_OPPORTUNITY = 35
const LONG_TAIL_MIN_WORDS = 3
const ITEMS_PER_BUCKET = 10
const MIN_USABLE_KEYWORDS = 3

// CONFIRMED VIA LIVE CALL: DataForSEO's related-keyword graph frequently has
// zero data for a specific compound product idea ("bloating and fatigue
// supplement" → 0 items) but real data for the broader root phrase
// ("bloating and fatigue" → 29 items). This isn't a bug, it's how the graph
// is built — generic trailing words rarely have their own keyword-expansion
// data. Same broadening pattern already used in providers/tiktok.ts's
// GENERIC_TAIL, reused here for consistency rather than inventing a new one.
const GENERIC_TAIL = new Set([
  'supplement', 'supplements', 'support', 'relief', 'formula',
  'loss', 'health', 'care', 'boost', 'gummies', 'capsules', 'powder',
])

function broadenedCandidates(seedKeyword: string): string[] {
  const words = seedKeyword.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const candidates: string[] = [seedKeyword]
  const trimmed = [...words]
  while (trimmed.length > 1 && GENERIC_TAIL.has(trimmed[trimmed.length - 1])) {
    trimmed.pop()
    candidates.push(trimmed.join(' '))
  }
  return candidates
}

interface DfsMonthlySearch { year?: number; month?: number; search_volume?: number }
interface DfsSearchVolumeTrend { monthly?: number; quarterly?: number; yearly?: number }
interface DfsKeywordInfo {
  search_volume?:        number
  competition?:          number
  cpc?:                  number
  monthly_searches?:     DfsMonthlySearch[]
  search_volume_trend?:  DfsSearchVolumeTrend   // DataForSEO's own pre-computed trend — preferred over our own derivation below
}
interface DfsKeywordProperties { keyword_difficulty?: number }
// CONFIRMED VIA DOCS REVIEW (2026-06-26): related_keywords/live's keyword_data
// does not include a search_intent_info field — that's only on a different
// DataForSEO Labs endpoint (search_intent/live), which this provider does not
// call (would be a second paid request per keyword). Typed here defensively
// in case DataForSEO adds it to this endpoint later; when absent (the case
// today), derive.ts's rule-based classifier fills search_intent instead and
// tags it 'computed', never 'dataforseo'.
interface DfsSearchIntentInfo { main_intent?: string }
interface DfsKeywordData {
  keyword?:            string
  keyword_info?:       DfsKeywordInfo
  keyword_properties?: DfsKeywordProperties
  search_intent_info?: DfsSearchIntentInfo
}
interface DfsItem { keyword_data?: DfsKeywordData }
interface DfsResult { items?: DfsItem[] }
interface DfsTask { result?: DfsResult[]; status_code?: number; status_message?: string }
interface DfsResponse { tasks?: DfsTask[]; status_code?: number; status_message?: string }

// Growth from real monthly history: oldest third of the window vs newest third.
// CONFIRMED VIA LIVE CALL (2026-06-24): DataForSEO returns monthly_searches
// most-recent-first (e.g. 2026-05, 2026-04, ... 2025-06) — NOT chronological.
// Sorting explicitly here rather than trusting array order, since that
// ordering isn't documented and a silent flip would invert every growth
// number without erroring.
function computeGrowthPct(months: DfsMonthlySearch[]): number | null {
  const valid = months.filter(
    (m): m is Required<DfsMonthlySearch> =>
      typeof m.search_volume === 'number' && typeof m.year === 'number' && typeof m.month === 'number',
  )
  if (valid.length < 6) return null

  const sorted  = [...valid].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
  const volumes = sorted.map(m => m.search_volume)

  const chunk    = Math.max(2, Math.floor(volumes.length / 3))
  const oldChunk = volumes.slice(0, chunk)
  const newChunk = volumes.slice(-chunk)
  const oldAvg   = oldChunk.reduce((a, b) => a + b, 0) / oldChunk.length
  const newAvg   = newChunk.reduce((a, b) => a + b, 0) / newChunk.length
  if (oldAvg <= 0) return null

  return Math.round(((newAvg - oldAvg) / oldAvg) * 100)
}

const VALID_INTENTS = new Set(['commercial', 'transactional', 'informational', 'navigational'])

// Real chronological history, for the seasonality/forecast/trend-chart layer
// added 2026-06-26 — same real field already fetched to compute growth_pct,
// previously discarded immediately after. Reuses the exact sort already
// proven correct in computeGrowthPct (DataForSEO returns most-recent-first).
function toMonthlyHistory(months: DfsMonthlySearch[]): { year: number; month: number; volume: number }[] {
  const valid = months.filter(
    (m): m is Required<DfsMonthlySearch> =>
      typeof m.search_volume === 'number' && typeof m.year === 'number' && typeof m.month === 'number',
  )
  return valid
    .sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
    .map(m => ({ year: m.year, month: m.month, volume: m.search_volume }))
}

function toMetric(data: DfsKeywordData): KeywordMetric | null {
  const keyword = data.keyword?.trim()
  const volume  = data.keyword_info?.search_volume
  if (!keyword || typeof volume !== 'number' || volume <= 0) return null

  // Prefer DataForSEO's own pre-computed yearly trend (a real field from the
  // provider) over our own derivation from monthly_searches; fall back only
  // when they don't supply it.
  const providerYearly = data.keyword_info?.search_volume_trend?.yearly
  const growth = typeof providerYearly === 'number' ? providerYearly : computeGrowthPct(data.keyword_info?.monthly_searches ?? [])

  // Monthly/quarterly trend are the same real DataForSEO field family as
  // yearly above — already in this response, just unused until now.
  const trend30d = data.keyword_info?.search_volume_trend?.monthly
  const trend90d = data.keyword_info?.search_volume_trend?.quarterly

  const realIntent = data.search_intent_info?.main_intent?.toLowerCase()

  return {
    keyword,
    monthly_searches: volume,
    growth_pct:        growth,
    competition:       data.keyword_info?.competition ?? null,
    difficulty:        data.keyword_properties?.keyword_difficulty ?? null,
    cpc:               data.keyword_info?.cpc ?? null,

    growth_pct_30d:  typeof trend30d === 'number' ? trend30d : null,
    growth_pct_90d:  typeof trend90d === 'number' ? trend90d : null,
    monthly_history: toMonthlyHistory(data.keyword_info?.monthly_searches ?? []),
    // Real only if DataForSEO actually supplied it on this response (see the
    // DfsSearchIntentInfo comment above — not present on this endpoint
    // today). build.ts's enrichMetric() fills the computed fallback when
    // this is null, and is careful never to overwrite a real value here.
    search_intent:        realIntent && VALID_INTENTS.has(realIntent) ? (realIntent as KeywordMetric['search_intent']) : null,
    search_intent_source: realIntent && VALID_INTENTS.has(realIntent) ? 'dataforseo' : null,
  }
}

export class DataForSeoKeywordProvider implements KeywordProvider {
  readonly name    = 'dataforseo'
  readonly enabled = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD)

  async fetch(seedKeyword: string): Promise<KeywordIntelligence | null> {
    if (!this.enabled) return null
    const keyword = seedKeyword.trim()
    if (!keyword) return null

    // Try the exact phrase first; only broaden (and spend a second real call)
    // if it genuinely came back empty. Most queries will resolve on the first
    // try, so this doesn't double the cost of every lookup.
    for (const candidate of broadenedCandidates(keyword)) {
      const metrics = await this.fetchOnce(candidate)
      if (metrics && metrics.length >= MIN_USABLE_KEYWORDS) {
        return this.bucket(candidate, metrics)
      }
    }
    return null
  }

  private async fetchOnce(keyword: string): Promise<KeywordMetric[] | null> {
    try {
      const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
      const res = await fetch(ENDPOINT, {
        method:  'POST',
        signal:  AbortSignal.timeout(12_000),
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify([{
          keyword,
          language_code: 'en',
          location_code: US_LOCATION_CODE,
          depth:         2,
          limit:         100,
        }]),
      })

      if (!res.ok) {
        console.error('DataForSEO HTTP error', { status: res.status, keyword })
        return null
      }

      const data: DfsResponse = await res.json()
      const task = data.tasks?.[0]
      // CONFIRMED VIA LIVE CALL: DataForSEO's own success code is 20000, not
      // an HTTP-style "< 400 is fine." The original `status_code >= 400`
      // check was true for the success code itself (20000 >= 400), so every
      // real successful call was being discarded as an error — this is the
      // bug that caused the first live end-to-end test to come back empty.
      if (!task || task.status_code !== 20000) {
        console.error('DataForSEO task error', { keyword, status: task?.status_code, message: task?.status_message })
        return null
      }

      const items = task.result?.[0]?.items ?? []
      const metrics = items
        .map(it => it.keyword_data ? toMetric(it.keyword_data) : null)
        .filter((m): m is KeywordMetric => m !== null)

      if (metrics.length < MIN_USABLE_KEYWORDS) {
        console.log('DataForSEO: too few usable keywords for this candidate', { keyword, count: metrics.length })
        return null
      }
      return metrics
    } catch (e: unknown) {
      console.error('DataForSEO provider error', { keyword, error: e instanceof Error ? e.message : e })
      return null
    }
  }

  private bucket(seedKeyword: string, metrics: KeywordMetric[]): KeywordIntelligence {
    const byVolumeDesc = [...metrics].sort((a, b) => b.monthly_searches - a.monthly_searches)

    const top_buying = byVolumeDesc.slice(0, ITEMS_PER_BUCKET)

    const opportunity = [...metrics]
      .filter(m => m.monthly_searches >= MIN_VOLUME_FOR_OPPORTUNITY && (m.difficulty ?? 100) <= MAX_DIFFICULTY_FOR_OPPORTUNITY)
      .sort((a, b) => b.monthly_searches - a.monthly_searches)
      .slice(0, ITEMS_PER_BUCKET)

    const long_tail = byVolumeDesc
      .filter(m => m.keyword.split(/\s+/).length >= LONG_TAIL_MIN_WORDS)
      .slice(0, ITEMS_PER_BUCKET)

    const fast_growing = [...metrics]
      .filter(m => m.growth_pct !== null && m.growth_pct > 0)
      .sort((a, b) => (b.growth_pct ?? 0) - (a.growth_pct ?? 0))
      .slice(0, ITEMS_PER_BUCKET)

    console.log('DataForSEO keyword intelligence computed', {
      seed_keyword: seedKeyword,
      total_keywords: metrics.length,
      top_buying: top_buying.length,
      opportunity: opportunity.length,
      long_tail: long_tail.length,
      fast_growing: fast_growing.length,
    })

    return {
      seed_keyword: seedKeyword,
      top_buying, opportunity, long_tail, fast_growing,
      provider:   'dataforseo',
      fetched_at: new Date().toISOString(),
    }
  }
}
