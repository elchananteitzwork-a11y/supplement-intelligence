// ── Search Acceleration — slope + second derivative from real monthly history ──
//
// V2 Blueprint §2 Pillar 1 / §4 stage 3 / Roadmap M1.6, Milestone 6.
// SCORING_ENGINE_VERSION 2.10.0.
//
// Deterministic arithmetic over KeywordMetric.monthly_history — the SAME
// real DataForSEO field already fetched (see dataforseo.ts toMetric —
// "zero new provider cost"), previously used only for growth_pct (a single
// oldest-third-vs-newest-third comparison, computeGrowthPct in
// dataforseo.ts). This module adds a middle window so growth can be
// compared across TWO periods — the difference between them is the second
// derivative (acceleration): is search interest speeding up, holding
// steady, or slowing down, not just "is it bigger than before."
//
// Nothing here is model output. No new API call, no new cost.

import type { KeywordMonthlyPoint } from './types'

export type SearchDirection = 'accelerating' | 'stable' | 'decelerating' | 'declining'

export interface SearchAcceleration {
  early_growth_pct:  number   // oldest-third → middle-third change, %
  recent_growth_pct: number   // middle-third → newest-third change, % ("slope")
  acceleration_pct:  number   // recent_growth_pct − early_growth_pct (the 2nd derivative)
  direction:         SearchDirection
  sample_size:       number   // real monthly data points used
}

// Disclosed judgment-call thresholds, same convention as every other
// calibration constant in this codebase (e.g. lib/scoring.ts's
// feeBurdenToScore 45% denominator) — calibrate against real Verdict
// Ledger outcomes once available (Roadmap M3.2).
const MIN_MONTHS = 9              // need 3 usable windows of ≥3 months each
const ACCELERATION_THRESHOLD = 10 // percentage-point swing in growth rate to call it accelerating/decelerating
const DECLINE_THRESHOLD = -5      // recent-window growth rate below this = declining, regardless of acceleration

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

// Three consecutive, non-overlapping windows over chronological (oldest-
// first) volumes — same three-way split spirit as computeGrowthPct's
// oldest-third/newest-third, extended with a middle window. The final
// window absorbs any remainder (mirrors computeGrowthPct's `slice(-chunk)`
// recency bias) rather than discarding trailing months.
function threeWindows(volumes: number[]): [number[], number[], number[]] {
  const size = Math.floor(volumes.length / 3)
  return [
    volumes.slice(0, size),
    volumes.slice(size, size * 2),
    volumes.slice(size * 2),
  ]
}

function classifyDirection(recentGrowthPct: number, accelerationPct: number): SearchDirection {
  if (recentGrowthPct < DECLINE_THRESHOLD) return 'declining'
  if (accelerationPct > ACCELERATION_THRESHOLD) return 'accelerating'
  if (accelerationPct < -ACCELERATION_THRESHOLD) return 'decelerating'
  return 'stable'
}

// Null when there isn't enough real history to trust the computation —
// never a fabricated or estimated value. Same honest-null contract as
// every other real-data function in this codebase.
export function computeSearchAcceleration(history: KeywordMonthlyPoint[] | undefined): SearchAcceleration | null {
  if (!history || history.length < MIN_MONTHS) return null

  // dataforseo.ts's toMonthlyHistory already sorts chronologically
  // (oldest-first) before this is ever populated — re-sort defensively
  // here too so this function is correct even if called with unsorted
  // input from a future caller.
  const sorted  = [...history].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
  const volumes = sorted.map(p => p.volume)

  const [oldest, middle, newest] = threeWindows(volumes)
  if (oldest.length < 2 || middle.length < 2 || newest.length < 2) return null

  const oldAvg = avg(oldest)
  const midAvg = avg(middle)
  const newAvg = avg(newest)
  if (oldAvg <= 0 || midAvg <= 0) return null

  const earlyGrowthPct  = Math.round(((midAvg - oldAvg) / oldAvg) * 100 * 10) / 10
  const recentGrowthPct = Math.round(((newAvg - midAvg) / midAvg) * 100 * 10) / 10
  const accelerationPct = Math.round((recentGrowthPct - earlyGrowthPct) * 10) / 10

  return {
    early_growth_pct:  earlyGrowthPct,
    recent_growth_pct: recentGrowthPct,
    acceleration_pct:  accelerationPct,
    direction:         classifyDirection(recentGrowthPct, accelerationPct),
    sample_size:       volumes.length,
  }
}
