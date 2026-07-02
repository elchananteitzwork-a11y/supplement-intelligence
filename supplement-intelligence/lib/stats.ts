// ── Shared, generic statistics helpers ──────────────────────────────────
// Pure arithmetic over real time-series data — no provider knowledge, no
// category knowledge, no AI. Extracted from lib/signal-engine/providers/
// google-trends.ts (which had its own copy of the coefficient-of-variation
// seasonality math) so the keyword engine can reuse the exact same,
// already-proven method on DataForSEO's real per-keyword monthly history
// instead of re-deriving it. google-trends.ts now calls this too — same
// behavior, one implementation.

export interface MonthlyPoint { month: number /* 0-11 */; value: number }

export interface SeasonalityStats {
  cv:          number   // coefficient of variation, %
  pattern:     'Perennial' | 'Seasonal' | 'Event-driven'
  peakMonths:  number[] // 0-11, sorted by strength desc
  lowMonths:   number[] // 0-11, sorted by weakness desc (lowest first)
  stability:   number   // 0-10, higher = more stable/perennial
}

export function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

export function coefficientOfVariation(values: number[]): number {
  const meanVal = avg(values)
  if (meanVal <= 0) return 100
  const variance = values.reduce((s, v) => s + Math.pow(v - meanVal, 2), 0) / values.length
  return (Math.sqrt(variance) / meanVal) * 100
}

export function cvToPattern(cv: number): SeasonalityStats['pattern'] {
  if (cv < 30) return 'Perennial'
  if (cv < 55) return 'Seasonal'
  return 'Event-driven'
}

// Higher score = more perennial / stable demand (good for subscription fit).
export function cvToStability(cv: number): number {
  if (cv < 15) return 9
  if (cv < 25) return 8
  if (cv < 35) return 7
  if (cv < 50) return 5
  if (cv < 65) return 3
  return 1
}

// Groups arbitrary-granularity points into calendar months, then returns
// the months ≥20% above average (peaks) and ≤20% below average (lows).
// Generic over any 0-11 month index — caller supplies real timestamps.
export function detectPeakAndLowMonths(points: MonthlyPoint[]): { peakMonths: number[]; lowMonths: number[] } {
  const byMonth: Record<number, number[]> = {}
  for (const pt of points) {
    if (!byMonth[pt.month]) byMonth[pt.month] = []
    byMonth[pt.month].push(pt.value)
  }
  const monthlyAvg = Object.entries(byMonth).map(([m, vals]) => ({ month: Number(m), avg: avg(vals) }))
  if (!monthlyAvg.length) return { peakMonths: [], lowMonths: [] }

  const overallAvg = avg(monthlyAvg.map(x => x.avg))
  const peakMonths = monthlyAvg
    .filter(x => x.avg > overallAvg * 1.2)
    .sort((a, b) => b.avg - a.avg)
    .map(x => x.month)
  const lowMonths = monthlyAvg
    .filter(x => x.avg < overallAvg * 0.8)
    .sort((a, b) => a.avg - b.avg)
    .map(x => x.month)

  return { peakMonths, lowMonths }
}

export function computeSeasonality(points: MonthlyPoint[]): SeasonalityStats {
  const values = points.map(p => p.value)
  const cv      = coefficientOfVariation(values)
  const pattern = cvToPattern(cv)
  const { peakMonths, lowMonths } = detectPeakAndLowMonths(points)

  return { cv, pattern, peakMonths, lowMonths, stability: cvToStability(cv) }
}

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
