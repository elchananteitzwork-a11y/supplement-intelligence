// Search Acceleration tests — V2 Blueprint §2 Pillar 1 / Roadmap M1.6.
//
// Acceptance criterion under test (roadmap, verbatim): "Directional read is
// deterministic and unit-tested against fixture series (rising, flat,
// declining, seasonal-noisy)."

import { describe, it, expect } from 'vitest'
import { computeSearchAcceleration } from '../acceleration'
import type { KeywordMonthlyPoint } from '../types'

// Builds a 12-month chronological series starting Jan 2025, oldest first.
function series(volumes: number[]): KeywordMonthlyPoint[] {
  return volumes.map((volume, i) => ({
    year:  2025 + Math.floor(i / 12),
    month: (i % 12) + 1,
    volume,
  }))
}

describe('computeSearchAcceleration — honest nulls', () => {
  it('returns null with fewer than 9 months of history', () => {
    expect(computeSearchAcceleration(series([100, 110, 120, 130, 140, 150, 160, 170]))).toBeNull()
  })

  it('returns null when history is undefined', () => {
    expect(computeSearchAcceleration(undefined)).toBeNull()
  })

  it('returns null when the oldest window averages to zero (division-by-zero guard)', () => {
    expect(computeSearchAcceleration(series([0, 0, 0, 100, 200, 300, 400, 500, 600]))).toBeNull()
  })
})

describe('computeSearchAcceleration — fixture: RISING (growth speeding up)', () => {
  it('classifies as accelerating when the recent growth rate is faster than the early growth rate', () => {
    // oldest window ~100, middle window ~150 (+50%), newest window ~400 (+167%)
    // growth rate itself is increasing -> accelerating
    const result = computeSearchAcceleration(series([95, 100, 105, 145, 150, 155, 350, 400, 450]))
    expect(result).not.toBeNull()
    expect(result!.direction).toBe('accelerating')
    expect(result!.recent_growth_pct).toBeGreaterThan(result!.early_growth_pct)
    expect(result!.acceleration_pct).toBeGreaterThan(0)
    expect(result!.sample_size).toBe(9)
  })
})

describe('computeSearchAcceleration — fixture: FLAT', () => {
  it('classifies as stable when volume barely moves across all three windows', () => {
    const result = computeSearchAcceleration(series([1000, 1010, 990, 1005, 995, 1010, 1000, 990, 1005]))
    expect(result).not.toBeNull()
    expect(result!.direction).toBe('stable')
    expect(Math.abs(result!.acceleration_pct)).toBeLessThanOrEqual(10)
  })
})

describe('computeSearchAcceleration — fixture: DECLINING', () => {
  it('classifies as declining when the most recent window is meaningfully below the middle window', () => {
    // oldest ~1000, middle ~900 (-10%), newest ~500 (-44% from middle)
    const result = computeSearchAcceleration(series([1000, 1000, 1000, 900, 900, 900, 500, 500, 500]))
    expect(result).not.toBeNull()
    expect(result!.direction).toBe('declining')
    expect(result!.recent_growth_pct).toBeLessThan(-5)
  })

  it('declining always wins even if the deceleration itself is mild (recent-window floor takes priority)', () => {
    // A steep, consistent decline where growth1 and growth2 are similar
    // (small |acceleration|) but recent_growth_pct is still clearly below
    // the decline threshold -> must classify as declining, not stable.
    const result = computeSearchAcceleration(series([1000, 1000, 1000, 700, 700, 700, 490, 490, 490]))
    expect(result).not.toBeNull()
    expect(result!.direction).toBe('declining')
  })
})

describe('computeSearchAcceleration — fixture: SEASONAL-NOISY', () => {
  it('a noisy-but-flat underlying trend still classifies as stable — window averaging absorbs single-month spikes', () => {
    // Same ~1000 baseline in every window, but individual months swing
    // wildly within each window (seasonal spikes/dips) — the windowed
    // averages should still land close together.
    const result = computeSearchAcceleration(series([
      600, 1400, 1000,   // oldest window, avg ~1000, high variance
      1500, 500, 1000,   // middle window, avg ~1000, high variance
      1100, 900, 1000,   // newest window, avg ~1000, low variance
    ]))
    expect(result).not.toBeNull()
    expect(result!.direction).toBe('stable')
  })

  it('a noisy series with a genuine underlying rise still surfaces the real trend through the noise', () => {
    const result = computeSearchAcceleration(series([
      400, 800, 300,      // oldest window, avg 500
      900, 1300, 800,     // middle window, avg 1000 (+100%)
      2200, 1800, 2600,   // newest window, avg 2200 (+120%)
    ]))
    expect(result).not.toBeNull()
    expect(result!.recent_growth_pct).toBeGreaterThan(0)
    expect(result!.early_growth_pct).toBeGreaterThan(0)
  })
})

describe('computeSearchAcceleration — determinism', () => {
  it('produces byte-identical output for the same input across repeated calls', () => {
    const input = series([100, 120, 110, 150, 160, 170, 300, 320, 310])
    const a = computeSearchAcceleration(input)
    const b = computeSearchAcceleration(input)
    expect(a).toEqual(b)
  })

  it('sorts defensively — output is identical whether input arrives chronological or shuffled', () => {
    const chronological = series([100, 120, 110, 150, 160, 170, 300, 320, 310])
    const shuffled = [...chronological].reverse()
    expect(computeSearchAcceleration(shuffled)).toEqual(computeSearchAcceleration(chronological))
  })
})
