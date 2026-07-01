import type { KeywordProvider, KeywordIntelligence, KeywordMetric } from './types'
import { checkKeywordRelevance } from './relevance-guard'
import { cacheGet, cacheSet } from '../provider-cache'

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

// ROOT CAUSE (found 2026-06-28, "Monthly Search Volume often shows no data"
// investigation): this function only stripped a fixed set of generic
// PRODUCT-TYPE words from the end of the query — it had no handling for the
// extremely common "for <audience>" / "with <use case>" clause, even though
// that exact pattern (app/api/generate/route.ts's own broadenQuery,
// independently built for the Category-Creation-Candidate path) already
// exists elsewhere in this codebase for the identical reason. CONFIRMED VIA
// LIVE CALL 2026-06-28: "joint supplement for aging dogs" -> 0 real items;
// "joint supplement for dogs" -> 36 items incl. 33,100/mo real volume;
// "joint supplement" -> 32 items incl. 14,800/mo. The data was never
// missing — the retry logic never tried the query that would have found it.
function broadenedCandidates(seedKeyword: string): string[] {
  const words = seedKeyword.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const candidates: string[] = [seedKeyword]

  const clauseIdx = words.findIndex(w => w === 'for' || w === 'with')
  if (clauseIdx > 0) {
    candidates.push(words.slice(0, clauseIdx).join(' '))
  }

  const trimmed = [...words]
  while (trimmed.length > 1 && GENERIC_TAIL.has(trimmed[trimmed.length - 1])) {
    trimmed.pop()
    candidates.push(trimmed.join(' '))
  }

  // Found during the multi-query production validation sweep (2026-06-28):
  // a SECOND, distinct failure pattern — multi-word descriptive phrases with
  // no "for"/"with" clause and no GENERIC_TAIL trailing word still often
  // have zero data on the exact phrase. CONFIRMED VIA LIVE CALL: "Post-
  // Workout Tendon Recovery" -> 0 items; "Tendon Recovery" (same phrase
  // minus its leading qualifier word) -> 31 items. Unlike the trailing
  // GENERIC_TAIL list (a small, known vocabulary of product-type words),
  // there's no equivalent small vocabulary of LEADING qualifier words to
  // check against — they're highly varied ("Post-Workout", "Overnight",
  // "Plant-Based", etc.) — so this tries dropping just the first word
  // unconditionally, once, rather than building another fixed word list.
  // Bounded to one extra attempt and only when >=3 words remain, so a
  // 2-word phrase is never diluted to a single, overly generic word.
  if (words.length >= 3) {
    candidates.push(words.slice(1).join(' '))
  }
  // A 4+-word phrase can need TWO leading words dropped, not just one —
  // CONFIRMED VIA LIVE CALL: "Cartilage Regeneration Collagen Peptides" -> 0
  // items; "Regeneration Collagen Peptides" (1 dropped) -> still 0;
  // "Collagen Peptides" (2 dropped) -> 59 items with real volume. Same
  // one-extra-attempt, no-fixed-vocabulary reasoning as above, one step
  // further — still bounded (only fires on long phrases, only ever 2 words
  // dropped, never collapses below 2 remaining words). Deliberately NOT
  // extended further than this: a separate confirmed case ("Morning
  // Stiffness Relief Rapid-Release") has zero real data at the 1-word- and
  // 2-word-dropped levels too — that's a genuine absence, not a bug, and
  // is correctly left to resolve to "No data available" rather than forcing
  // ever-more-aggressive stripping to manufacture a result.
  if (words.length >= 4) {
    candidates.push(words.slice(2).join(' '))
  }

  return candidates
}

interface DfsMonthlySearch { year?: number; month?: number; search_volume?: number }
interface DfsSearchVolumeTrend { monthly?: number; quarterly?: number; yearly?: number }
interface DfsKeywordInfo {
  search_volume?:        number
  competition?:          number
  competition_level?:    string   // real qualitative label, e.g. "HIGH" — CONFIRMED VIA LIVE CALL 2026-06-27
  cpc?:                  number
  low_top_of_page_bid?:  number   // real Google Ads bid range — CONFIRMED VIA LIVE CALL 2026-06-27
  high_top_of_page_bid?: number
  monthly_searches?:     DfsMonthlySearch[]
  search_volume_trend?:  DfsSearchVolumeTrend   // DataForSEO's own pre-computed trend — preferred over our own derivation below
}
interface DfsKeywordProperties { keyword_difficulty?: number }
// UPDATED 2026-06-27: the 2026-06-26 "docs review" comment below claiming
// search_intent_info is absent from this endpoint was wrong — CONFIRMED VIA
// LIVE CALL 2026-06-27 that it is now present (DataForSEO appears to have
// added it since). Left the defensive optional typing in place either way;
// toMetric() below already reads it correctly when present.
interface DfsSearchIntentInfo { main_intent?: string }
// CONFIRMED VIA LIVE CALL 2026-06-27: both real and present on every item.
interface DfsSerpInfo { serp_item_types?: string[]; se_results_count?: number }
interface DfsBacklinksInfo { referring_domains?: number }
interface DfsKeywordData {
  keyword?:            string
  keyword_info?:       DfsKeywordInfo
  keyword_properties?: DfsKeywordProperties
  search_intent_info?: DfsSearchIntentInfo
  serp_info?:          DfsSerpInfo
  avg_backlinks_info?: DfsBacklinksInfo
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

  const lowBid  = data.keyword_info?.low_top_of_page_bid
  const highBid = data.keyword_info?.high_top_of_page_bid

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

    competition_level:     data.keyword_info?.competition_level ?? null,
    top_of_page_bid_range: typeof lowBid === 'number' && typeof highBid === 'number' ? { low: lowBid, high: highBid } : null,
    serp_features:         data.serp_info?.serp_item_types ?? null,
    serp_results_count:    data.serp_info?.se_results_count ?? null,
    avg_referring_domains: data.avg_backlinks_info?.referring_domains != null ? Math.round(data.avg_backlinks_info.referring_domains) : null,
  }
}

const KEYWORD_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days — keyword volumes stable week-to-week

export class DataForSeoKeywordProvider implements KeywordProvider {
  readonly name    = 'dataforseo'
  readonly enabled = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD)

  async fetch(seedKeyword: string, signal?: AbortSignal): Promise<KeywordIntelligence | null> {
    if (!this.enabled) return null
    const keyword = seedKeyword.trim()
    if (!keyword) return null

    // ── Keyword cache (7-day TTL, eliminates ~$0.011/hit) ────────────────
    const cacheKey = `keywords:v1:${keyword.toLowerCase()}`
    const cached = await cacheGet<KeywordIntelligence>(cacheKey)
    if (cached) {
      console.log('[DataForSEO] keyword cache HIT', { seedKeyword })
      return cached
    }

    // Try the exact phrase first; only broaden (and spend a second real call)
    // if it genuinely came back empty. Most queries will resolve on the first
    // try, so this doesn't double the cost of every lookup.
    // PR review finding (2026-06-28): checking `signal?.aborted` before each
    // candidate (not just inside fetchOnce) means that once the caller's
    // overall deadline has passed, this loop stops proposing NEW candidates
    // instead of starting one more billed call it'll never get to use.
    //
    // Keyword Relevance Guard (2026-06-28 production audit): DataForSEO's
    // related-keyword graph can return a real, high-volume keyword that has
    // nothing to do with the original query as the top hit for a broadened
    // (or even exact) seed — CONFIRMED VIA LIVE CALL: "Senior Dog Mobility
    // Support" surfaced "mobility scooter" (human mobility aids) as its
    // single highest-volume related keyword. Every candidate's metrics are
    // checked against the TRUE original query (not the broadened candidate
    // string) before anything is credited as Monthly Search Volume — this
    // runs even on a direct/unbroadened hit, since the drift is in
    // DataForSEO's related-keyword suggestions, not just in this file's own
    // broadening. The single best (highest-volume) rejected candidate across
    // all attempts is kept for honest "found but not credited" disclosure
    // (lib/provenance.ts), never for scoring.
    let bestRejected: { keyword: string; monthly_searches: number; reason: string } | null = null

    for (const candidate of broadenedCandidates(keyword)) {
      if (signal?.aborted) return null
      const metrics = await this.fetchOnce(candidate, signal)
      if (!metrics || metrics.length < MIN_USABLE_KEYWORDS) continue

      const byVolumeDesc = [...metrics].sort((a, b) => b.monthly_searches - a.monthly_searches)
      const relevant = byVolumeDesc.find(m => checkKeywordRelevance(keyword, m.keyword).allowed)

      if (relevant) {
        const result = this.bucket(candidate, metrics, relevant)
        cacheSet(cacheKey, 'dataforseo', result, KEYWORD_CACHE_TTL_MS).catch(() => {})
        return result
      }

      const top = byVolumeDesc[0]
      if (top && !bestRejected) {
        bestRejected = {
          keyword: top.keyword,
          monthly_searches: top.monthly_searches,
          reason: checkKeywordRelevance(keyword, top.keyword).reason,
        }
      }
    }

    if (bestRejected) {
      console.log('DataForSEO: relevance guard rejected every candidate\'s top keyword', { original: keyword, ...bestRejected })
      return {
        seed_keyword: keyword,
        top_buying: [], opportunity: [], long_tail: [], fast_growing: [],
        provider: 'dataforseo',
        fetched_at: new Date().toISOString(),
        relevance_rejected: bestRejected,
      }
    }
    return null
  }

  private async fetchOnce(keyword: string, externalSignal?: AbortSignal): Promise<KeywordMetric[] | null> {
    if (externalSignal?.aborted) return null

    // Combine the caller's overall-deadline signal with this call's own
    // 12s per-attempt timeout — whichever fires first aborts the request.
    // No `AbortSignal.any` (Node 20.3+ only, and this repo doesn't pin an
    // `engines` field) — wired by hand so this works on any Node version
    // that has native fetch + AbortController.
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onExternalAbort)
    const perCallTimeout = setTimeout(() => controller.abort(), 12_000)

    try {
      const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
      const res = await fetch(ENDPOINT, {
        method:  'POST',
        signal:  controller.signal,
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
      // Distinguish an intentional cancellation (caller's deadline passed,
      // or this call's own 12s attempt timeout) from a genuine provider
      // failure — PR review finding: once timeouts can fire from an
      // external signal too, logging every abort as "provider error" would
      // make DataForSEO look unreliable in production logs when it was
      // simply cancelled on purpose.
      const aborted = e instanceof Error && e.name === 'AbortError'
      if (aborted) {
        console.log('DataForSEO call cancelled (timeout or caller deadline)', { keyword })
      } else {
        console.error('DataForSEO provider error', { keyword, error: e instanceof Error ? e.message : e })
      }
      return null
    } finally {
      clearTimeout(perCallTimeout)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }
  }

  private bucket(seedKeyword: string, metrics: KeywordMetric[], guardedTop: KeywordMetric): KeywordIntelligence {
    const byVolumeDesc = [...metrics].sort((a, b) => b.monthly_searches - a.monthly_searches)

    // Keyword Relevance Guard: top_buying[0] is the one number computeDemand()
    // and the UI treat as THE verified Monthly Search Volume — promote the
    // highest-volume keyword that's actually relevant to the original query
    // into that position if a higher-volume but irrelevant one would
    // otherwise have won by raw volume alone. Positions 1-9 and the other 3
    // buckets are left as natural volume-sorted keyword-research data (a
    // different, already-labeled feature — out of scope for this guard).
    const ordered = guardedTop === byVolumeDesc[0]
      ? byVolumeDesc
      : [guardedTop, ...byVolumeDesc.filter(m => m !== guardedTop)]

    const top_buying = ordered.slice(0, ITEMS_PER_BUCKET)

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
