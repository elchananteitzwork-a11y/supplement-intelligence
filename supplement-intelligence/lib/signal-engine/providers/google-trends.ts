import type {
  SignalProvider,
  ProviderSignals,
  DemandSignal,
  GrowthSignal,
  SeasonalitySignal,
} from '../types'

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
}

// ── Raw response shapes ───────────────────────────────────────────

interface TimelinePoint {
  time:             string
  formattedTime:    string
  value:            number[]
  hasData:          boolean[]
  isPartial?:       boolean
}

// ── Helpers ───────────────────────────────────────────────────────

// Strip "supplement(s)" so "Gut Health Supplement" → "gut health" for
// broader search signal. Specific medical terms (PCOS, GLP-1, etc.) are kept.
function toSearchKeyword(category: string): string {
  return category
    .toLowerCase()
    .replace(/\bsupplements?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
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

// YoY trend label
function growthToTrendStr(pct: number): string {
  if (Math.abs(pct) <= 5) return 'Stable'
  return pct > 0 ? `+${Math.round(pct)}% YoY` : `${Math.round(pct)}% YoY`
}

// Seasonality score: high score = perennial (great for subscription).
// CV (coefficient of variation) measures relative volatility.
function cvToSeasonalityScore(cv: number): number {
  if (cv < 15) return 9
  if (cv < 25) return 8
  if (cv < 35) return 7
  if (cv < 50) return 5
  if (cv < 65) return 3
  return 1
}

function cvToPattern(cv: number): SeasonalitySignal['pattern'] {
  if (cv < 30) return 'Perennial'
  if (cv < 55) return 'Seasonal'
  return 'Event-driven'
}

// Detect peak months by grouping weekly data points into calendar months
// and returning the 1–2 months with above-average interest.
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function detectPeakMonths(points: TimelinePoint[]): string[] {
  const monthly: Record<number, number[]> = {}
  for (const pt of points) {
    const d = new Date(Number(pt.time) * 1000)
    const m = d.getUTCMonth()
    if (!monthly[m]) monthly[m] = []
    monthly[m].push(pt.value[0])
  }
  const monthlyAvg = Object.entries(monthly).map(([m, vals]) => ({
    month: Number(m),
    avg:   vals.reduce((a, b) => a + b, 0) / vals.length,
  }))
  if (!monthlyAvg.length) return []
  const overallAvg = monthlyAvg.reduce((s, x) => s + x.avg, 0) / monthlyAvg.length
  return monthlyAvg
    .filter(x => x.avg > overallAvg * 1.2)  // 20% above average = peak
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 2)
    .map(x => MONTH_NAMES[x.month])
}

// ── Core provider class ───────────────────────────────────────────

export class GoogleTrendsProvider implements SignalProvider {
  readonly name    = 'google-trends'
  // No API key required — uses the same public endpoints as trends.google.com.
  // Disabled when GOOGLE_TRENDS_DISABLED=true (escape hatch if rate-limited).
  readonly enabled = process.env.GOOGLE_TRENDS_DISABLED !== 'true'

  async fetch(category: string): Promise<ProviderSignals | null> {
    const keyword = toSearchKeyword(category)
    if (!keyword) return null

    try {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
      const raw = await googleTrends.interestOverTime({
        keyword,
        startTime: oneYearAgo,
        geo:       'US',
      })

      const parsed: { default: { timelineData: TimelinePoint[] } } = JSON.parse(raw)
      const all    = parsed.default.timelineData ?? []
      // Exclude partial (current week) and zero-data points
      const valid  = all.filter(pt => pt.hasData?.[0] && pt.value[0] > 0 && !pt.isPartial)

      if (valid.length < 8) {
        console.log('Google Trends: insufficient data', { category, keyword, pts: valid.length })
        return null
      }

      return this.computeSignals(category, keyword, valid)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // Google Trends returns a 302→/sorry page when rate-limited.
      // The provider returns null so the engine falls back to Keepa-only.
      // In production (Vercel serverless), each invocation has a different IP
      // so rate limits from local testing sessions do not affect live calls.
      const isRateLimit = msg.includes('302') || msg.includes('sorry') || msg.includes('429')
      if (isRateLimit) {
        console.warn('Google Trends rate-limited — falling back to Keepa-only', { category, keyword })
      } else {
        console.error('Google Trends provider error', { category, keyword, error: msg.slice(0, 120) })
      }
      return null
    }
  }

  private computeSignals(
    category: string,
    keyword:  string,
    points:   TimelinePoint[],
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
    const momPct    = prev12 > 0 ? ((last4 - prev12) / prev12) * 100 : 0
    const momentum: GrowthSignal['momentum'] =
      momPct > 10  ? 'Accelerating' :
      momPct < -10 ? 'Decelerating' : 'Stable'

    // ── Seasonality: coefficient of variation ──
    const variance = values.reduce((s, v) => s + Math.pow(v - meanVal, 2), 0) / values.length
    const cv       = meanVal > 0 ? (Math.sqrt(variance) / meanVal) * 100 : 100
    const peakMonths = cvToPattern(cv) !== 'Perennial' ? detectPeakMonths(points) : []

    // ── Confidence: more points + higher avg = more reliable ──
    const confidence = Math.min(0.88, 0.55 + (values.length / 54) * 0.2 + (meanVal / 100) * 0.13)

    const demand: DemandSignal = {
      score:      interestToDemandScore(meanVal),
      confidence,
      trend:      growthToTrendStr(growthPct),
      signal:     interestToSignal(meanVal),
    }

    const growth: GrowthSignal = {
      score:      growthToScore(growthPct),
      confidence,
      yoy_change: growthToTrendStr(growthPct),
      momentum,
    }

    const seasonality: SeasonalitySignal = {
      score:       cvToSeasonalityScore(cv),
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
