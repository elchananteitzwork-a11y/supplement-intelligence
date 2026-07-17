import { describe, it, expect } from 'vitest'
import { detectDivergence, DIVERGENCE_THRESHOLD_PCT } from '../divergence'
import type { AccelerationResult } from '../acceleration'

function accel(priorValue: number, latestValue: number, changePct: number): AccelerationResult {
  return { priorValue, latestValue, changePct, isAccelerating: changePct > 25 }
}

describe('lib/pattern-detection/divergence', () => {
  it('returns null (never a fabricated comparison) with fewer than 2 real readings', () => {
    expect(detectDivergence([])).toBeNull()
    expect(detectDivergence([{ source: 'science', metric: 'publication_velocity_pct', accel: accel(10, 20, 100) }])).toBeNull()
  })

  it(`flags a real divergence when signs disagree by more than the disclosed ${DIVERGENCE_THRESHOLD_PCT}pt threshold`, () => {
    const result = detectDivergence([
      { source: 'science', metric: 'publication_velocity_pct', accel: accel(10, 20, 100) },   // +100%
      { source: 'search_intent', metric: 'search_volume', accel: accel(1000, 700, -30) },       // -30%
    ])
    expect(result).toHaveLength(1)
    expect(result![0]).toEqual({
      sourceA: 'science', metricA: 'publication_velocity_pct',
      priorValueA: 10, latestValueA: 20, changePctA: 100,
      sourceB: 'search_intent', metricB: 'search_volume',
      priorValueB: 1000, latestValueB: 700, changePctB: -30,
      divergencePct: 130,
    })
  })

  it('returns [] (a real comparison, not a missing one) when both series move in the same direction', () => {
    const result = detectDivergence([
      { source: 'science', metric: 'publication_velocity_pct', accel: accel(10, 20, 100) },
      { source: 'search_intent', metric: 'search_volume', accel: accel(1000, 1500, 50) },
    ])
    expect(result).toEqual([])
  })

  it('returns [] when signs disagree but the magnitude does not cross the disclosed threshold', () => {
    const result = detectDivergence([
      { source: 'science', metric: 'publication_velocity_pct', accel: accel(100, 110, 10) },
      { source: 'search_intent', metric: 'search_volume', accel: accel(100, 90, -10) },
    ])
    // divergencePct = 20, below DIVERGENCE_THRESHOLD_PCT (50)
    expect(result).toEqual([])
  })

  it('does not treat a flat (zero) reading as disagreeing with a signed reading', () => {
    const result = detectDivergence([
      { source: 'science', metric: 'publication_velocity_pct', accel: accel(100, 100, 0) },
      { source: 'search_intent', metric: 'search_volume', accel: accel(100, 200, 100) },
    ])
    expect(result).toEqual([])
  })

  it('evaluates every real pair when 3+ series are supplied', () => {
    const result = detectDivergence([
      { source: 'science', metric: 'publication_velocity_pct', accel: accel(10, 30, 200) },     // +200%, diverges from series B below
      { source: 'search_intent', metric: 'search_volume', accel: accel(1000, 600, -40) },        // -40%
      { source: 'amazon_market', metric: 'review_velocity', accel: accel(100, 105, 5) },          // +5%: same sign as A (no pair), and too close to B's magnitude to cross threshold
    ])
    expect(result).toHaveLength(1)
    expect(result![0].sourceA).toBe('science')
    expect(result![0].sourceB).toBe('search_intent')
  })
})
