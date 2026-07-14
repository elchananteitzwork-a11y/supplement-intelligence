import type {
  SignalProvider,
  SignalContext,
  ProviderSignals,
  DemandSignal,
  GrowthSignal,
  SeasonalitySignal,
} from '../types'
import { coefficientOfVariation, cvToPattern, cvToStability, detectPeakAndLowMonths, MONTH_NAMES, avg } from '@/lib/stats'
import { broadenTrendsQuery } from './trends-query-broadening'

// ── DataForSEO Google Trends (Explore, live) — Roadmap M2.14 ────────────────
//
// docs/MASTER_EXECUTION_PLAN.md's M2.14 R&D document. A real, documented
// DataForSEO endpoint (confirmed via their public API reference, not
// assumed): POST /v3/keywords_data/google_trends/explore/live, same real
// HTTP Basic auth (DATAFORSEO_LOGIN/PASSWORD) already live in production
// for lib/keyword-engine/dataforseo.ts. Requests both google_trends_graph
// (interest-over-time) and google_trends_map (regional breakdown) in ONE
// call — same cost-consciousness discipline as every other provider here.
//
// DELIBERATELY DISABLED BY DEFAULT — the one deliberate exception to this
// codebase's usual "on by default, _DISABLED to turn off" convention.
// Real per-call cost is not published (DataForSEO's pricing page defers to
// an account dashboard); this codebase's own established convention is to
// confirm real cost via a real live call (see dataforseo.ts's own "CONFIRMED
// VIA LIVE CALL... cost $0.0109/call"), not to guess it — so this provider
// stays opt-in until that confirmation happens during live validation.
// google-trends.ts (the current, free, live provider) is completely
// unchanged and untouched by this file's existence.

const ENDPOINT = 'https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live'
const US_LOCATION_CODE = 2840

// ── Raw response shapes ──────────────────────────────────────────────────
// Field names confirmed against DataForSEO's own public API reference for
// this exact endpoint (docs.dataforseo.com), not guessed — the "data"
// array's inner shape isn't hand-testable from static docs alone, so this
// parsing is defensive: an unexpected real shape degrades to null/absent,
// never a fabricated value, matching every other provider in this codebase.

interface GraphDataPoint {
  timestamp?:     number
  missing_data?:  boolean
  values?:        number[]
}

interface MapDataPoint {
  geo_id?:   string
  geo_name?: string
  values?:   number[]
}

interface TrendsItem {
  type?: 'google_trends_graph' | 'google_trends_map' | string
  data?: unknown[]
}

interface DfsTrendsResponse {
  tasks?: Array<{
    status_code?: number
    status_message?: string
    cost?: number
    result?: Array<{ items?: TrendsItem[] }>
  }>
}

// ── Score/classification helpers ─────────────────────────────────────────
// Deliberately self-contained rather than importing google-trends.ts's own
// threshold functions — short (5-10 lines each), and this data source's
// real scale characteristics may calibrate differently once real outcome
// data exists (Roadmap M3.2), so keeping them separate avoids coupling two
// providers' tuning together prematurely. Only the genuinely source-
// agnostic query-broadening logic was extracted (trends-query-broadening.ts).

function interestToDemandScore(interest: number): number {
  if (interest >= 70) return 9
  if (interest >= 50) return 8
  if (interest >= 30) return 6
  if (interest >= 15) return 4
  return 2
}

function interestToSignal(interest: number): DemandSignal['signal'] {
  if (interest >= 50) return 'Strong'
  if (interest >= 25) return 'Moderate'
  return 'Weak'
}

function growthToScore(pct: number): number {
  if (pct > 100) return 9
  if (pct > 50)  return 8
  if (pct > 25)  return 7
  if (pct > 10)  return 6
  if (pct > -10) return 5
  if (pct > -25) return 4
  if (pct > -50) return 3
  return 2
}

function growthToTrendStr(pct: number): string {
  if (Math.abs(pct) <= 5) return 'Stable'
  return pct > 0 ? `+${Math.round(pct)}% (recent trend)` : `${Math.round(pct)}% (recent trend)`
}

function detectPeakMonths(points: { timestamp: number; value: number }[]): string[] {
  const monthPoints = points.map(pt => ({
    month: new Date(pt.timestamp * 1000).getUTCMonth(),
    value: pt.value,
  }))
  return detectPeakAndLowMonths(monthPoints).peakMonths.slice(0, 2).map(m => MONTH_NAMES[m])
}

export class DataForSeoTrendsProvider implements SignalProvider {
  readonly name = 'dataforseo-trends'
  // Opt-in, not opt-out — see file header for why this is the deliberate
  // exception to this codebase's usual escape-hatch polarity.
  readonly enabled = process.env.DATAFORSEO_TRENDS_ENABLED === 'true'
    && !!process.env.DATAFORSEO_LOGIN && !!process.env.DATAFORSEO_PASSWORD

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    const category = ctx.query
    const candidates = broadenTrendsQuery(category)
    if (!candidates.length) return null

    // Sequential, not parallel — same rate-consciousness principle as
    // every other multi-candidate broadening loop in this codebase
    // (google-trends.ts, dataforseo.ts's own related-keyword broadening).
    for (const keyword of candidates) {
      const result = await this.fetchOnce(keyword)
      if (!result) continue

      if (keyword !== candidates[0]) {
        console.log('DataForSEO Trends: broadened query succeeded', { category, original: candidates[0], usedKeyword: keyword })
      }
      return result
    }

    console.log('DataForSEO Trends: all candidates insufficient', { category, candidates })
    return null
  }

  private async fetchOnce(keyword: string): Promise<ProviderSignals | null> {
    let res: Response
    try {
      const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
      res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(12_000),
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify([{
          keywords:      [keyword],
          location_code: US_LOCATION_CODE,
          time_range:    'past_12_months',
          item_types:    ['google_trends_graph', 'google_trends_map'],
        }]),
      })
    } catch (e: unknown) {
      console.warn('DataForSEO Trends: request failed', { keyword, error: e instanceof Error ? e.message : e })
      return null
    }

    if (!res.ok) {
      console.error('DataForSEO Trends: HTTP error', { keyword, status: res.status })
      return null
    }

    let body: DfsTrendsResponse
    try { body = await res.json() as DfsTrendsResponse } catch { return null }

    const task = body.tasks?.[0]
    if (!task || task.status_code !== 20000) {
      console.error('DataForSEO Trends: task error', { keyword, status: task?.status_code, message: task?.status_message })
      return null
    }

    // Real cost, logged explicitly for this milestone's live-validation
    // step — the same mechanism dataforseo.ts's own $0.0109/call figure
    // was originally confirmed with.
    console.log('DataForSEO Trends: real call cost', { keyword, cost: task.cost })

    const items = task.result?.[0]?.items ?? []
    const graphItem = items.find(it => it.type === 'google_trends_graph')
    const mapItem   = items.find(it => it.type === 'google_trends_map')

    const graphPoints = this.parseGraphPoints(graphItem?.data)
    if (graphPoints.length < 8) {
      console.log('DataForSEO Trends: insufficient data', { keyword, pts: graphPoints.length })
      return null
    }

    const topRegions = this.parseTopRegions(mapItem?.data)
    return this.computeSignals(keyword, graphPoints, topRegions)
  }

  // Defensive: an unexpected real shape (a field renamed, a type this
  // codebase hasn't seen yet) degrades to an empty array — never a
  // fabricated point — which the caller already treats as "insufficient
  // data," the same honest-absence path a real API failure takes.
  private parseGraphPoints(data: unknown[] | undefined): { timestamp: number; value: number }[] {
    if (!Array.isArray(data)) return []
    return data
      .map(d => d as GraphDataPoint)
      .filter(d => !d.missing_data && typeof d.timestamp === 'number' && Array.isArray(d.values) && typeof d.values[0] === 'number' && d.values[0] > 0)
      .map(d => ({ timestamp: d.timestamp as number, value: (d.values as number[])[0] }))
  }

  private parseTopRegions(data: unknown[] | undefined): string[] | undefined {
    if (!Array.isArray(data)) return undefined
    const regions = data
      .map(d => d as MapDataPoint)
      .filter(d => typeof d.geo_name === 'string' && Array.isArray(d.values) && typeof d.values[0] === 'number' && d.values[0] > 0)
      .sort((a, b) => (b.values as number[])[0] - (a.values as number[])[0])
      .slice(0, 3)
      .map(d => d.geo_name as string)
    return regions.length ? regions : undefined
  }

  private computeSignals(
    keyword:     string,
    points:      { timestamp: number; value: number }[],
    topRegions?: string[],
  ): ProviderSignals {
    const values  = points.map(p => p.value)
    const meanVal = avg(values)

    const chunkSize = Math.min(12, Math.floor(values.length / 4))
    const oldChunk  = values.slice(0, chunkSize)
    const newChunk  = values.slice(-chunkSize)
    const oldAvg    = avg(oldChunk)
    const newAvg    = avg(newChunk)
    const growthPct = oldAvg > 0 ? ((newAvg - oldAvg) / oldAvg) * 100 : 0

    const last4  = avg(values.slice(-4))
    const prev12 = avg(values.slice(-16, -4))
    const momPct = (prev12 !== null && prev12 > 0) ? ((last4 - prev12) / prev12) * 100 : null
    const momentum: GrowthSignal['momentum'] =
      momPct === null ? 'Stable' :
      momPct > 10    ? 'Accelerating' :
      momPct < -10   ? 'Decelerating' : 'Stable'

    const cv = coefficientOfVariation(values)
    const peakMonths = cvToPattern(cv) !== 'Perennial' ? detectPeakMonths(points) : []

    const confidence = Math.min(0.88, 0.55 + (values.length / 54) * 0.2 + (meanVal / 100) * 0.13)

    const demand: DemandSignal = {
      score:       interestToDemandScore(meanVal),
      confidence,
      trend:       growthToTrendStr(growthPct),
      signal:      interestToSignal(meanVal),
      top_regions: topRegions,
    }

    const growth: GrowthSignal = {
      score:      growthToScore(growthPct),
      confidence,
      yoy_change: growthToTrendStr(growthPct),
      momentum,
    }

    const seasonality: SeasonalitySignal = {
      score:       cvToStability(cv),
      confidence:  Math.min(0.85, confidence),
      pattern:     cvToPattern(cv),
      peak_months: peakMonths.length ? peakMonths : undefined,
    }

    const overallConf = Math.round(confidence * 100) / 100

    console.log('DataForSEO Trends signals computed', {
      keyword,
      pts:         values.length,
      avgInterest: Math.round(meanVal),
      growthPct:   Math.round(growthPct) + '%',
      topRegions:  topRegions ?? 'none',
      momentum,
      confidence:  Math.round(overallConf * 100) + '%',
    })

    return {
      demand,
      growth,
      seasonality,
      provider:   'dataforseo-trends',
      fetched_at: new Date().toISOString(),
      confidence: overallConf,
    }
  }
}
