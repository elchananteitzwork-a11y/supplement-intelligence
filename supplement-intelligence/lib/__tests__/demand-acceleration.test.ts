// computeDemand acceleration-nuance tests — V2 Blueprint §2 Pillar 1 /
// Roadmap M1.6, Milestone 6, SCORING_ENGINE_VERSION 2.10.0.

import { describe, it, expect } from 'vitest'
import { computeDemand } from '../scoring'
import type { MemoData } from '@/types/index'

function memoWithKeyword(overrides: Record<string, unknown> = {}): MemoData {
  return {
    keyword_intelligence: {
      top_buying: [{
        keyword: 'creatine monohydrate powder',
        monthly_searches: 20_000,
        growth_pct: 5, // deliberately below the ±20 growth_pct bump thresholds, so any
                       // score delta observed below is attributable ONLY to search_direction
        ...overrides,
      }],
      opportunity: [],
    },
  } as unknown as MemoData
}

describe('computeDemand — search_direction nuance', () => {
  it('accelerating adds +0.5 over an otherwise-identical stable fixture', () => {
    const stable       = computeDemand(memoWithKeyword({ search_direction: 'stable' }))
    const accelerating = computeDemand(memoWithKeyword({ search_direction: 'accelerating' }))
    expect(accelerating.rawScore).toBeCloseTo((stable.rawScore ?? 0) + 0.5, 5)
  })

  it('declining subtracts 0.5 from an otherwise-identical stable fixture', () => {
    const stable    = computeDemand(memoWithKeyword({ search_direction: 'stable' }))
    const declining = computeDemand(memoWithKeyword({ search_direction: 'declining' }))
    expect(declining.rawScore).toBeCloseTo((stable.rawScore ?? 0) - 0.5, 5)
  })

  it('decelerating applies no adjustment (same score as stable)', () => {
    const stable       = computeDemand(memoWithKeyword({ search_direction: 'stable' }))
    const decelerating = computeDemand(memoWithKeyword({ search_direction: 'decelerating' }))
    expect(decelerating.rawScore).toBe(stable.rawScore)
  })

  it('absent search_direction (null) applies no adjustment and never crashes', () => {
    const stable = computeDemand(memoWithKeyword({ search_direction: 'stable' }))
    const absent = computeDemand(memoWithKeyword({ search_direction: null }))
    expect(absent.rawScore).toBe(stable.rawScore)
  })

  it('the accelerating bonus is clamped at 10, never exceeding it', () => {
    // A huge monthly_searches value already saturates searchVolumeToScore
    // near 10; the growth_pct AND acceleration bumps together must not
    // push the final score past 10.
    const result = computeDemand(memoWithKeyword({
      monthly_searches: 500_000, growth_pct: 50, search_direction: 'accelerating',
    }))
    expect(result.rawScore).toBeLessThanOrEqual(10)
  })

  it('the declining penalty is clamped at 0, never dropping below it', () => {
    const result = computeDemand(memoWithKeyword({
      monthly_searches: 501, growth_pct: -50, search_direction: 'declining',
    }))
    expect(result.rawScore).toBeGreaterThanOrEqual(0)
  })
})

describe('computeDemand — sourceLabel transparency', () => {
  it('includes the direction and recent growth rate in sourceLabel when present', () => {
    const result = computeDemand(memoWithKeyword({ search_direction: 'accelerating', recent_growth_pct: 52 }))
    expect(result.sourceLabel).toContain('search accelerating')
    expect(result.sourceLabel).toContain('+52%')
  })

  it('omits any direction note when search_direction is absent', () => {
    const result = computeDemand(memoWithKeyword({ search_direction: null, recent_growth_pct: null }))
    expect(result.sourceLabel).not.toContain('search ')
  })

  it('formats a negative recent growth rate without a double-negative or stray plus sign', () => {
    const result = computeDemand(memoWithKeyword({ search_direction: 'declining', recent_growth_pct: -30 }))
    expect(result.sourceLabel).toContain('search declining')
    expect(result.sourceLabel).toContain('-30%')
    expect(result.sourceLabel).not.toContain('+-30')
  })
})
