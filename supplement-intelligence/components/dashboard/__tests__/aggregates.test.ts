import { describe, it, expect } from 'vitest'
import {
  computeV2BuildRate, computeAvgQuality, computeLifecycleCoverage, computeAvgConfidence,
  type DashboardCardIntelligence,
} from '../aggregates'
import type { V2VerdictDisplay, LifecycleDisplay } from '@/components/memo/field-derivations'

function v2(verdict: V2VerdictDisplay['verdict'], qualityScore: number, qualityTier: V2VerdictDisplay['qualityTier'] = 'Mid'): V2VerdictDisplay {
  return { verdict, qualityScore, qualityTier, lifecycleStage: 'Window Open' }
}

function lifecycle(stage: LifecycleDisplay['stage'] = 'Window Open'): LifecycleDisplay {
  return { stages: ['Latent', 'Emerging', 'Window Open', 'Contested', 'Saturated', 'Declining'], currentIndex: 2, stage, unmeasuredScience: false }
}

function card(overrides: Partial<DashboardCardIntelligence> = {}): DashboardCardIntelligence {
  return { lifecycle: null, v2Verdict: null, confidencePct: null, ...overrides }
}

describe('computeV2BuildRate', () => {
  it('returns null (honest unavailable, never a fabricated 0%) when no analysis has real M2.4 data', () => {
    expect(computeV2BuildRate([card(), card()])).toBeNull()
  })

  it('computes the real rate over only the analyses that actually have M2.4 data — never divided by the full total', () => {
    const cards = [
      card({ v2Verdict: v2('BUILD_NOW', 80) }),
      card({ v2Verdict: v2('AVOID', 20) }),
      card(), // no real M2.4 data — must not count in the denominator
    ]
    const result = computeV2BuildRate(cards)
    expect(result).toEqual({ ratePct: 50, buildNowCount: 1, scoredCount: 2 })
  })
})

describe('computeAvgQuality', () => {
  it('returns null when no analysis has a real opportunity_quality score', () => {
    expect(computeAvgQuality([card(), card()])).toBeNull()
  })

  it('averages only the real quality scores', () => {
    const cards = [card({ v2Verdict: v2('BUILD_NOW', 80) }), card({ v2Verdict: v2('WATCH', 40) }), card()]
    expect(computeAvgQuality(cards)).toEqual({ avgScore: 60, scoredCount: 2 })
  })
})

describe('computeLifecycleCoverage', () => {
  it('reports real coverage counts, honest even when zero are classified', () => {
    expect(computeLifecycleCoverage([card(), card()])).toEqual({ classifiedCount: 0, totalCount: 2 })
  })

  it('counts only the analyses with a real lifecycle_classification', () => {
    const cards = [card({ lifecycle: lifecycle() }), card(), card({ lifecycle: lifecycle('Saturated') })]
    expect(computeLifecycleCoverage(cards)).toEqual({ classifiedCount: 2, totalCount: 3 })
  })
})

describe('computeAvgConfidence', () => {
  it('returns null when no analysis has a real confidence reading', () => {
    expect(computeAvgConfidence([card(), card()])).toBeNull()
  })

  it('averages only the real confidence percentages', () => {
    const cards = [card({ confidencePct: 80 }), card({ confidencePct: 40 }), card()]
    expect(computeAvgConfidence(cards)).toEqual({ avgPct: 60, scoredCount: 2 })
  })
})
