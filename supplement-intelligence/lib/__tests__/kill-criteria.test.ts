// Kill criteria tests — Roadmap M2.8.
//
// Acceptance criterion under test (verbatim): "Kill criteria are
// machine-evaluable (each maps to a signal + threshold, not prose)."

import { describe, it, expect } from 'vitest'
import { computeKillCriteria, evaluateKillCriterion } from '../kill-criteria'
import type { LifecycleClassification, GapVelocity } from '@/lib/lifecycle'

function classification(overrides: Partial<LifecycleClassification['inputs']> = {}, stage: LifecycleClassification['stage'] = 'Window Open'): LifecycleClassification {
  return {
    stage,
    version: 'heuristic-v1',
    inputs: {
      search_momentum: 'Accelerating', amazon_demand_momentum: 'Accelerating',
      amazon_demand_level: 'Medium', social_level: 'Medium',
      supply_entry_velocity: 'Stable', supply_young_listing_pct_24m: 0.3,
      ...overrides,
    },
    unmeasured_dimensions: ['science'],
  }
}

function gapVelocity(value: number | null): GapVelocity {
  return { value, demand_acceleration_pct: value, supply_acceleration_normalized_pct: 0, version: 'heuristic-v1' }
}

describe('computeKillCriteria', () => {
  it('produces up to 4 criteria, each mapping to a real signal + threshold (never prose)', () => {
    const criteria = computeKillCriteria(classification(), gapVelocity(10))
    expect(criteria.length).toBe(4)
    for (const c of criteria) {
      expect(c.metric).toBeTruthy()
      expect(c.comparator).toBeTruthy()
      expect(c.threshold).toBeDefined()
      expect(typeof c.label).toBe('string')
    }
    expect(criteria.map(c => c.key)).toEqual([
      'gap_velocity_negative', 'search_decelerating', 'supply_velocity_surge', 'lifecycle_stage_advanced',
    ])
  })

  it('omits (never fabricates) a criterion whose real underlying input is missing', () => {
    const criteria = computeKillCriteria(
      classification({ search_momentum: 'Unknown', supply_young_listing_pct_24m: null }),
      gapVelocity(null),
    )
    // Only the always-includable lifecycle-stage criterion should remain.
    expect(criteria).toHaveLength(1)
    expect(criteria[0].key).toBe('lifecycle_stage_advanced')
  })

  it('reuses the exact Contested-stage threshold (0.4) from lib/lifecycle.ts, not a new invented one', () => {
    const criteria = computeKillCriteria(classification(), gapVelocity(5))
    const supplyCriterion = criteria.find(c => c.key === 'supply_velocity_surge')
    expect(supplyCriterion?.threshold).toBe(0.4)
  })

  it('records the real value at generation time for audit', () => {
    const criteria = computeKillCriteria(classification({ supply_young_listing_pct_24m: 0.55 }), gapVelocity(-3))
    expect(criteria.find(c => c.key === 'gap_velocity_negative')?.valueAtGeneration).toBe(-3)
    expect(criteria.find(c => c.key === 'supply_velocity_surge')?.valueAtGeneration).toBe(0.55)
  })
})

describe('evaluateKillCriterion', () => {
  const criteria = computeKillCriteria(classification(), gapVelocity(10))
  const gapCriterion    = criteria.find(c => c.key === 'gap_velocity_negative')!
  const searchCriterion = criteria.find(c => c.key === 'search_decelerating')!
  const supplyCriterion = criteria.find(c => c.key === 'supply_velocity_surge')!
  const stageCriterion  = criteria.find(c => c.key === 'lifecycle_stage_advanced')!

  it('gap_velocity: triggers only when the fresh value is really below the threshold', () => {
    expect(evaluateKillCriterion(gapCriterion, { gap_velocity: -1 })).toBe(true)
    expect(evaluateKillCriterion(gapCriterion, { gap_velocity: 5 })).toBe(false)
  })

  it('search_momentum: triggers only on a real exact match', () => {
    expect(evaluateKillCriterion(searchCriterion, { search_momentum: 'Decelerating' })).toBe(true)
    expect(evaluateKillCriterion(searchCriterion, { search_momentum: 'Stable' })).toBe(false)
  })

  it('supply_young_listing_pct_24m: triggers only when really above the threshold', () => {
    expect(evaluateKillCriterion(supplyCriterion, { supply_young_listing_pct_24m: 0.6 })).toBe(true)
    expect(evaluateKillCriterion(supplyCriterion, { supply_young_listing_pct_24m: 0.2 })).toBe(false)
  })

  it('lifecycle_stage: triggers only when the fresh stage is really in the threshold set', () => {
    expect(evaluateKillCriterion(stageCriterion, { lifecycle_stage: 'Saturated' })).toBe(true)
    expect(evaluateKillCriterion(stageCriterion, { lifecycle_stage: 'Declining' })).toBe(true)
    expect(evaluateKillCriterion(stageCriterion, { lifecycle_stage: 'Window Open' })).toBe(false)
  })

  it('never triggers (false, not a guess) when the fresh re-check has no value for this criterion\'s metric', () => {
    expect(evaluateKillCriterion(gapCriterion, {})).toBe(false)
    expect(evaluateKillCriterion(searchCriterion, {})).toBe(false)
    expect(evaluateKillCriterion(supplyCriterion, {})).toBe(false)
    expect(evaluateKillCriterion(stageCriterion, {})).toBe(false)
  })
})
