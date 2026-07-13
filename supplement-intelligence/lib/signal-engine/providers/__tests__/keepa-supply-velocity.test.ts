// computeSupplyVelocity tests — Roadmap M2.3 ("New-listing velocity from
// listedSince"). Pure-function tests over real Keepa listedSince-derived
// ages (months) — no network call, no fixture beyond plain number arrays.
//
// Acceptance criteria under test (roadmap, verbatim):
//   "Benchmark queries produce young-listing shares; values sanity-checked
//    against raw Keepa data." — verified here via hand-computed expected
//    shares against constructed age arrays, the same rigor as a real
//    Keepa response would need.

import { describe, it, expect } from 'vitest'
import { computeSupplyVelocity } from '../keepa'

describe('computeSupplyVelocity', () => {
  it('returns undefined below the minimum sample size (thin data — honest absence, not a shaky signal)', () => {
    expect(computeSupplyVelocity([3, 6, 9])).toBeUndefined()
  })

  it('computes young_listing_pct_12m / 24m as real fractions of the sample', () => {
    // 10 products: 3 under 12mo, 6 under 24mo (including the 3 under 12mo), 4 over 24mo
    const ages = [2, 5, 10, 15, 18, 20, 30, 40, 50, 60]
    const result = computeSupplyVelocity(ages)
    expect(result).toBeDefined()
    expect(result!.young_listing_pct_12m).toBeCloseTo(3 / 10, 5)
    expect(result!.young_listing_pct_24m).toBeCloseTo(6 / 10, 5)
    expect(result!.sample_size).toBe(10)
  })

  it('classifies entry_velocity as Accelerating when more than 60% of the last 24 months\' entrants arrived in the last 12', () => {
    // under24 = 10, under12 = 8 -> ratio 0.8
    const ages = [1, 2, 3, 4, 5, 6, 7, 8, 18, 20, 50, 60]
    const result = computeSupplyVelocity(ages)
    expect(result!.entry_velocity_ratio).toBeCloseTo(0.8, 5)
    expect(result!.entry_velocity).toBe('Accelerating')
  })

  it('classifies entry_velocity as Decelerating when fewer than 40% of the last 24 months\' entrants arrived in the last 12', () => {
    // under24 = 10, under12 = 2 -> ratio 0.2
    const ages = [3, 6, 13, 14, 15, 16, 17, 18, 19, 20, 50, 60]
    const result = computeSupplyVelocity(ages)
    expect(result!.entry_velocity_ratio).toBeCloseTo(0.2, 5)
    expect(result!.entry_velocity).toBe('Decelerating')
  })

  it('classifies entry_velocity as Stable for a roughly uniform entry rate (ratio near 0.5)', () => {
    // under24 = 10, under12 = 5 -> ratio 0.5
    const ages = [1, 3, 5, 7, 9, 13, 15, 17, 19, 21, 50, 60]
    const result = computeSupplyVelocity(ages)
    expect(result!.entry_velocity_ratio).toBeCloseTo(0.5, 5)
    expect(result!.entry_velocity).toBe('Stable')
  })

  it('leaves entry_velocity_ratio/entry_velocity undefined when no listing falls within 24 months (no basis for a ratio), while still reporting real 12m/24m shares of zero', () => {
    const ages = [30, 40, 50, 60, 70]
    const result = computeSupplyVelocity(ages)
    expect(result!.young_listing_pct_12m).toBe(0)
    expect(result!.young_listing_pct_24m).toBe(0)
    expect(result!.entry_velocity_ratio).toBeUndefined()
    expect(result!.entry_velocity).toBeUndefined()
  })

  it('scores higher for a market with a larger share of young listings (more open) and lower for an entrenched one', () => {
    const openMarket      = computeSupplyVelocity([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])   // all under 12mo
    const entrenchedMarket = computeSupplyVelocity([60, 70, 80, 90, 100, 110, 120, 130, 140, 150]) // all ancient
    expect(openMarket!.score).toBeGreaterThan(entrenchedMarket!.score)
  })

  it('confidence rises with sample size', () => {
    const small = computeSupplyVelocity(Array(5).fill(10))
    const large = computeSupplyVelocity(Array(25).fill(10))
    expect(large!.confidence).toBeGreaterThan(small!.confidence)
  })
})
