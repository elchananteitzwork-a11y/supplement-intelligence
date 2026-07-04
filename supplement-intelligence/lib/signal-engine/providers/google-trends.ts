import type {
  SignalProvider,
  SignalContext,
  ProviderSignals,
  DemandSignal,
  GrowthSignal,
  SeasonalitySignal,
} from '../types'
import { coefficientOfVariation, cvToPattern, cvToStability, detectPeakAndLowMonths, MONTH_NAMES, avg } from '@/lib/stats'

// ── Google Trends (unofficial public API) ─────────────────────────
// Uses the `google-trends-api` npm package which wraps the same endpoints
// that trends.google.com calls in the browser. No API key required.
// Call frequency: once per week per category (bounded by discovery cache).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require('google-trends-api') as {
  interestOverTime: (opts: {
    keyword:    string
    startTime?: Date
    geo?:       string
    category?:  number
  }) => Promise<string>
  // CONFIRMED VIA LIVE CALL 2026-06-27: same free, unofficial provider,
  // a second real endpoint it exposes — real US state-level relative
  // interest, not previously called anywhere in this codebase.
  interestByRegion: (opts: {
    keyword:     string
    geo?:        string
    resolution?: 'COUNTRY' | 'REGION' | 'CITY' | 'DMA'
  }) => Promise<string>
}

// ── Raw response shapes ───────────────────────────────────────────

interface TimelinePoint {
  time:             string
  formattedTime:    string
  value:            number[]
  hasData:          boolean[]
  isPartial?:       boolean
}

interface RegionPoint {
  geoCode:  string
  geoName:  string
  value:    number[]
  hasData:  boolean[]
}

// ── Helpers ───────────────────────────────────────────────────────

// AUDIT FIX (2026-07-01): The old single-keyword strategy failed for
// specific product names ("Collagen Peptide Gummies for Skin" → < 8 data
// points → returns null). Google Trends works at the ingredient/benefit
// level, not the SKU level. Now generates progressive fallbacks so the
// provider finds signal even for long, specific queries.
//
// Broadening strategy (same principle as DataForSEO already uses):
//   1. Exact query with "supplement(s)" stripped
//   2. Strip "for/with/of X" clause at end
//   3. Keep only the first 2 meaningful words
//   4. Keep only the first meaningful word (key ingredient)
function toSearchKeyword(category: string): string {
  return category
    .toLowerCase()
    .replace(/\bsupplements?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const GT_PREP_WORDS  = new Set(['for', 'with', 'of', 'to', 'and', 'plus', 'by'])
const GT_STOP_WORDS  = new Set(['supplement', 'supplements', 'support', 'relief', 'formula',
  'complex', 'blend', 'mix', 'care', 'health', 'boost', 'aid'])

function broadenGoogleTrendsQuery(original: string): string[] {
  const base = toSearchKeyword(original) // strips "supplement(s)"
  if (!base) return []

  const candidates: string[] = [base]
  const words = base.split(/\s+/).filter(Boolean)

  // Strip "for/with/of X" clause at the end
  const prepIdx = words.findIndex(w => GT_PREP_WORDS.has(w))
  if (prepIdx > 0) {
    candidates.push(words.slice(0, prepIdx).join(' '))
  }

  // First 2 meaningful words
  const meaningful = words.filter(w => !GT_PREP_WORDS.has(w) && !GT_STOP_WORDS.has(w))
  if (meaningful.length >= 2) {
    candidates.push(meaningful.slice(0, 2).join(' '))
  }

  // First meaningful word only (broadest — key ingredient/benefit)
  if (meaningful.length >= 1 && meaningful[0].length >= 4) {
    candidates.push(meaningful[0])
  }

  // Deduplicate preserving order, keep non-empty
  const seen = new Set<string>()
  return candidates.filter(c => c.length >= 3 && !seen.has(c) && seen.add(c) !== undefined)
}

// Demand score from relative interest (0–100 scale → 0–10)
function interestToDemandScore(interest: number): number {
  if (interest >= 70) return 9
  if (interest >= 50) return 8
  if (interest >= 30) return 6
  if (interest >= 15) return 4
  return 2
}

// Demand signal label from relative interest
function interestToSignal(interest: number): DemandSignal['signal'] {
  if (interest >= 50) return 'Strong'
  if (interest >= 25) return 'Moderate'
  return 'Weak'
}

// REMOVED: interestToVolumeStr used to map Google Trends' relative 0–100
// interest index onto a fake absolute "searches/mo" bucket. The Trends API
// fundamentally does not expose absolute search volume — that bucket was a
// guess, not a measurement. demand.search_volume is intentionally left
// unset by this provider now; only DataForSEO can give a real number for
// that field. Trend direction/growth below stays, because it's a real
// period-over-period computation on real (if relative) data, not a guess.

// Growth score from YoY % change
function growthToScore(pct: number): number {
  if (pct > 100) return 9
  if (pct > 50)  return 8
  if (pct > 25)  return 7
  if (pct > 10)  return 6
  if (pct > -10) return 5   // stable
  if (pct > -25) return 4
  if (pct > -50) return 3
  return 2
}

// Trend label: compares first 12 weeks to last 12 weeks of the available
// Google Trends window (~52 weeks) — recent momentum, not calendar-year YoY.
// Labeled "trend" rather than "YoY" to avoid implying two separate calendar years.
function growthToTrendStr(pct: number): string {
  if (Math.abs(pct) <= 5) return 'Stable'
  return pct > 0 ? `+${Math.round(pct)}% (recent trend)` : `${Math.round(pct)}% (recent trend)`
}

// Detect peak months by grouping weekly data points into calendar months
// and returning the 1–2 months with above-average interest. Wraps the
// shared lib/stats.ts helper (real timestamp → real month index conversion
// stays here, since that's specific to this provider's weekly time format).
function detectPeakMonths(points: TimelinePoint[]): string[] {
  const monthPoints = points.map(pt => ({
    month: new Date(Number(pt.time) * 1000).getUTCMonth(),
    value: pt.value[0],
  }))
  return detectPeakAndLowMonths(monthPoints).peakMonths.slice(0, 2).map(m => MONTH_NAMES[m])
}

// ── Core provider class ───────────────────────────────────────────

export class GoogleTrendsProvider implements SignalProvider {
  readonly name    = 'google-trends'
  // No API key required — uses the same public endpoints as trends.google.com.
  // Disabled when GOOGLE_TRENDS_DISABLED=true (escape hatch if rate-limited).
  readonly enabled = process.env.GOOGLE_TRENDS_DISABLED !== 'true'

  // Best-effort, additive — a failure here (rate limit, parse error) never
  // blocks the main interestOverTime signal, since this only adds a single
  // extra field (top_regions) rather than gating the whole provider.
  private async fetchTopRegions(keyword: string): Promise<string[] | undefined> {
    try {
      const raw = await googleTrends.interestByRegion({ keyword, geo: 'US', resolution: 'REGION' })
      const parsed: { default: { geoMapData: RegionPoint[] } } = JSON.parse(raw)
      const regions = (parsed.default.geoMapData ?? [])
        .filter(r => r.hasData?.[0] && r.value[0] > 0)
        .sort((a, b) => b.value[0] - a.value[0])
        .slice(0, 3)
        .map(r => r.geoName)
      return regions.length ? regions : undefined
    } catch {
      return undefined
    }
  }

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    const category = ctx.query
    const candidates = broadenGoogleTrendsQuery(category)
    if (!candidates.length) return null

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)

    // Try each candidate in order (most specific → broadest) until one
    // returns ≥8 data points. Sequential to avoid rate-limiting GT.
    for (const keyword of candidates) {
      try {
        const [raw, topRegions] = await Promise.all([
          googleTrends.interestOverTime({ keyword, startTime: oneYearAgo, geo: 'US' }),
          this.fetchTopRegions(keyword),
        ])

        const parsed: { default: { timelineData: TimelinePoint[] } } = JSON.parse(raw)
        const all   = parsed.default.timelineData ?? []
        // Exclude partial (current week) and zero-data points
        const valid = all.filter(pt => pt.hasData?.[0] && pt.value[0] > 0 && !pt.isPartial)

        if (valid.length < 8) {
          console.log('Google Trends: insufficient data', { category, keyword, pts: valid.length })
          continue // try broader candidate
        }

        if (keyword !== candidates[0]) {
          console.log('Google Trends: broadened query succeeded', { category, original: candidates[0], usedKeyword: keyword })
        }
        return this.computeSignals(category, keyword, valid, topRegions)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        // Google Trends returns a 302→/sorry page when rate-limited.
        // The provider returns null so the engine falls back to Keepa-only.
        // In production (Vercel serverless), each invocation has a different IP
        // so rate limits from local testing sessions do not affect live calls.
        const isRateLimit = msg.includes('302') || msg.includes('sorry') || msg.includes('429')
        if (isRateLimit) {
          console.warn('Google Trends rate-limited — falling back to Keepa-only', { category, keyword })
          return null  // rate-limited: stop trying, don't burn more requests
        }
        console.error('Google Trends provider error', { category, keyword, error: msg.slice(0, 120) })
        continue
      }
    }

    console.log('Google Trends: all candidates insufficient', { category, candidates })
    return null
  }

  private computeSignals(
    category:    string,
    keyword:     string,
    points:      TimelinePoint[],
    topRegions?: string[],
  ): ProviderSignals {
    const values   = points.map(pt => pt.value[0])
    const meanVal  = avg(values)

    // ── YoY growth: first 12 weeks vs last 12 weeks ──
    const chunkSize = Math.min(12, Math.floor(values.length / 4))
    const oldChunk  = values.slice(0, chunkSize)
    const newChunk  = values.slice(-chunkSize)
    const oldAvg    = avg(oldChunk)
    const newAvg    = avg(newChunk)
    const growthPct = oldAvg > 0 ? ((newAvg - oldAvg) / oldAvg) * 100 : 0

    // ── Momentum: last 4 weeks vs weeks 5–16 ──
    const last4     = avg(values.slice(-4))
    const prev12    = avg(values.slice(-16, -4))
    const momPct    = (prev12 !== null && prev12 > 0) ? ((last4 - prev12) / prev12) * 100 : null
    const momentum: GrowthSignal['momentum'] =
      momPct === null ? 'Stable' :
      momPct > 10    ? 'Accelerating' :
      momPct < -10   ? 'Decelerating' : 'Stable'

    // ── Seasonality: coefficient of variation (shared helper, see lib/stats.ts) ──
    const cv       = coefficientOfVariation(values)
    const peakMonths = cvToPattern(cv) !== 'Perennial' ? detectPeakMonths(points) : []

    // ── Confidence: more points + higher avg = more reliable ──
    const confidence = Math.min(0.88, 0.55 + (values.length / 54) * 0.2 + (meanVal / 100) * 0.13)

    const demand: DemandSignal = {
      score:      interestToDemandScore(meanVal),
      confidence,
      trend:      growthToTrendStr(growthPct),
      signal:     interestToSignal(meanVal),
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

    console.log('Google Trends signals computed', {
      category,
      keyword,
      pts:        values.length,
      avgInterest: Math.round(meanVal),
      growthPct:  Math.round(growthPct) + '%',
      topRegions: topRegions ?? 'none',
      cv:         Math.round(cv) + '%',
      pattern:    cvToPattern(cv),
      momentum,
      confidence: Math.round(overallConf * 100) + '%',
    })

    return {
      demand,
      growth,
      seasonality,
      provider:   'google-trends',
      fetched_at: new Date().toISOString(),
      confidence: overallConf,
    }
  }
}
