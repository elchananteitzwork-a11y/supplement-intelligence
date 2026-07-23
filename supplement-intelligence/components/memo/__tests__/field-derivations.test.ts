// Field-level tests — Phase 3 Investor Report integration.
//
// Covers every new value surfaced from the Phase 2 (M2.2–M2.5, M2.8)
// intelligence layer: each derivation function is a pure function of real
// backend types, so these are tested directly (no component rendering —
// this codebase has no React component-testing toolchain installed, and
// installing one for this alone would be a bigger footprint than the
// milestone calls for; the derivation logic — the actual "field" — is
// fully covered here, and MemoDisplay/CurrentSignal/etc. just render
// whatever these functions return).

import { describe, it, expect } from 'vitest'
import {
  deriveLifecycleDisplay, formatGapVelocity, deriveKillCriteriaItems,
  deriveConfidenceDisplay, deriveV2VerdictDisplay, deriveVerdictCrossCheck,
  deriveSupplyVelocityDisplay, deriveScienceDisplay, LIFECYCLE_STAGES,
} from '../field-derivations'
import type { MemoData } from '@/types/index'
import type { LifecycleClassification, GapVelocity } from '@/lib/lifecycle'
import type { KillCriterion } from '@/lib/kill-criteria'
import type { ConfidenceAssessment } from '@/lib/confidence'
import type { OpportunityQuality, MarketVerdictResult } from '@/lib/verdict-matrix'
import type { SupplyVelocitySignal, ScienceSignal } from '@/lib/signal-engine/types'

function memo(overrides: Partial<MemoData> = {}): MemoData {
  return { ...overrides } as MemoData
}

describe('deriveLifecycleDisplay', () => {
  it('returns null (honest unavailable) when the analysis predates the lifecycle classifier', () => {
    expect(deriveLifecycleDisplay(memo())).toBeNull()
  })

  it('returns the real stage index and full six-stage progression', () => {
    const classification: LifecycleClassification = {
      stage: 'Window Open', version: 'heuristic-v1',
      inputs: {
        search_momentum: 'Accelerating', amazon_demand_momentum: 'Accelerating', amazon_demand_level: 'Medium',
        social_level: 'Medium', supply_entry_velocity: 'Stable', supply_young_listing_pct_24m: 0.2,
      },
      unmeasured_dimensions: ['science'],
    }
    const display = deriveLifecycleDisplay(memo({ lifecycle_classification: classification }))
    expect(display).not.toBeNull()
    expect(display!.stages).toEqual(LIFECYCLE_STAGES)
    expect(display!.currentIndex).toBe(LIFECYCLE_STAGES.indexOf('Window Open'))
    expect(display!.stage).toBe('Window Open')
    expect(display!.unmeasuredScience).toBe(true)
  })

  it('reports unmeasuredScience as false once a real science signal was contributed', () => {
    const classification: LifecycleClassification = {
      stage: 'Saturated', version: 'heuristic-v1',
      inputs: {
        search_momentum: 'Stable', amazon_demand_momentum: 'Stable', amazon_demand_level: 'High',
        social_level: 'Medium', supply_entry_velocity: 'Stable', supply_young_listing_pct_24m: 0.1,
      },
      unmeasured_dimensions: [],
    }
    const display = deriveLifecycleDisplay(memo({ lifecycle_classification: classification }))
    expect(display!.unmeasuredScience).toBe(false)
  })
})

describe('formatGapVelocity', () => {
  it('returns null (never fabricated) when the value is missing', () => {
    expect(formatGapVelocity(undefined)).toBeNull()
    expect(formatGapVelocity({ value: null, demand_acceleration_pct: 10, supply_acceleration_normalized_pct: null, version: 'heuristic-v1' })).toBeNull()
  })

  it('formats a positive real value with an explicit sign and real underlying terms', () => {
    const gv: GapVelocity = { value: 12.4, demand_acceleration_pct: 20, supply_acceleration_normalized_pct: 7.6, version: 'heuristic-v1' }
    const display = formatGapVelocity(gv)
    expect(display).toEqual({ value: 12.4, display: '+12.4 pts', demandPct: 20, supplyPct: 7.6 })
  })

  it('formats a negative real value without a double sign', () => {
    const gv: GapVelocity = { value: -5.2, demand_acceleration_pct: -5.2, supply_acceleration_normalized_pct: 0, version: 'heuristic-v1' }
    expect(formatGapVelocity(gv)!.display).toBe('-5.2 pts')
  })
})

describe('deriveKillCriteriaItems', () => {
  it('returns null (honest unavailable, never an empty fabricated list) when absent', () => {
    expect(deriveKillCriteriaItems(undefined)).toBeNull()
    expect(deriveKillCriteriaItems([])).toBeNull()
  })

  it('maps each real criterion to a display string including its real generation-time value', () => {
    const criteria: KillCriterion[] = [
      { key: 'gap_velocity_negative', label: 'Gap velocity turns negative', metric: 'gap_velocity', comparator: 'lt', threshold: 0, valueAtGeneration: 12.4 },
      { key: 'lifecycle_stage_advanced', label: 'Lifecycle stage advances', metric: 'lifecycle_stage', comparator: 'in', threshold: ['Saturated', 'Declining'], valueAtGeneration: 'Window Open' },
    ]
    const items = deriveKillCriteriaItems(criteria)
    expect(items).toEqual([
      'Gap velocity turns negative — currently 12.4',
      'Lifecycle stage advances — currently Window Open',
    ])
  })

  it('shows "unknown" (never a guessed number) when a criterion\'s value at generation was never recorded', () => {
    const criteria: KillCriterion[] = [
      { key: 'x', label: 'X', metric: 'gap_velocity', comparator: 'lt', threshold: 0, valueAtGeneration: null },
    ]
    expect(deriveKillCriteriaItems(criteria)).toEqual(['X — currently unknown'])
  })
})

function confidenceAssessment(overrides: Partial<ConfidenceAssessment> = {}): ConfidenceAssessment {
  return {
    confidenceModelVersion: '1.1.0',
    dimensions: [],
    overallConfidence: 0.6,
    weakestDimension: 'demand',
    distinctConfirmingChannels: 2,
    ...overrides,
  }
}

describe('deriveConfidenceDisplay', () => {
  it('buckets a real overallConfidence >= 50% as High', () => {
    expect(deriveConfidenceDisplay(confidenceAssessment({ overallConfidence: 0.6 })).level).toBe('High')
  })

  it('buckets a real overallConfidence in [25%, 50%) as Medium', () => {
    expect(deriveConfidenceDisplay(confidenceAssessment({ overallConfidence: 0.3 })).level).toBe('Medium')
  })

  it('buckets a real overallConfidence < 25% as Low', () => {
    expect(deriveConfidenceDisplay(confidenceAssessment({ overallConfidence: 0.1 })).level).toBe('Low')
  })

  it('reports Low with an honest note (never a guessed percentage) when overallConfidence is null', () => {
    const result = deriveConfidenceDisplay(confidenceAssessment({ overallConfidence: null }))
    expect(result.level).toBe('Low')
    expect(result.note).toMatch(/no real/i)
  })

  it('includes the real weakest dimension name in the note when present', () => {
    expect(deriveConfidenceDisplay(confidenceAssessment({ overallConfidence: 0.6, weakestDimension: 'profitability' })).note).toContain('profitability')
  })
})

describe('deriveV2VerdictDisplay', () => {
  it('returns null (honest unavailable) when either half is missing (legacy pre-M2.4 memo)', () => {
    expect(deriveV2VerdictDisplay(undefined, undefined)).toBeNull()
  })

  it('surfaces the real quality score/tier and market verdict together', () => {
    const quality: OpportunityQuality = { score: 62, tier: 'Mid', pillars: [], version: 'heuristic-v1' }
    const verdict: MarketVerdictResult = { verdict: 'INVESTIGATE', qualityTier: 'Mid', lifecycleStage: 'Window Open', buildNowGate: null, version: 'heuristic-v1' }
    expect(deriveV2VerdictDisplay(quality, verdict)).toEqual({
      verdict: 'INVESTIGATE', qualityScore: 62, qualityTier: 'Mid', lifecycleStage: 'Window Open',
    })
  })
})

describe('deriveVerdictCrossCheck', () => {
  const quality = (score: number, tier: OpportunityQuality['tier']): OpportunityQuality =>
    ({ score, tier, pillars: [], version: 'heuristic-v1' })
  const verdict = (v: MarketVerdictResult['verdict']): MarketVerdictResult =>
    ({ verdict: v, qualityTier: 'Mid', lifecycleStage: 'Window Open', buildNowGate: null, version: 'heuristic-v1' })

  it('returns null (renders nothing) when V2 was never computed', () => {
    expect(deriveVerdictCrossCheck('VALIDATE_FURTHER', undefined, undefined)).toBeNull()
  })

  it('returns null on agreement — overlapping/adjacent readings are never flagged', () => {
    expect(deriveVerdictCrossCheck('BUILD_NOW', quality(78, 'High'), verdict('BUILD_NOW'))).toBeNull()
    expect(deriveVerdictCrossCheck('BUILD_NOW', quality(78, 'High'), verdict('BUILD_IF_DIFFERENTIATED'))).toBeNull()
    expect(deriveVerdictCrossCheck('VALIDATE_FURTHER', quality(58, 'Mid'), verdict('BUILD_IF_DIFFERENTIATED'))).toBeNull()
    expect(deriveVerdictCrossCheck('VALIDATE_FURTHER', quality(58, 'Mid'), verdict('WATCH_CLOSELY'))).toBeNull()
    expect(deriveVerdictCrossCheck('VALIDATE_FURTHER', quality(58, 'Mid'), verdict('INVESTIGATE'))).toBeNull()
    expect(deriveVerdictCrossCheck('SKIP', quality(22, 'Low'), verdict('AVOID'))).toBeNull()
    expect(deriveVerdictCrossCheck('SKIP', quality(22, 'Low'), verdict('PASS'))).toBeNull()
  })

  it('never compares CATEGORY_CREATION_CANDIDATE — the V2 matrix has no such concept', () => {
    expect(deriveVerdictCrossCheck('CATEGORY_CREATION_CANDIDATE', quality(70, 'High'), verdict('AVOID'))).toBeNull()
  })

  it('flags a real cautious gap with the exact V2 label and score', () => {
    expect(deriveVerdictCrossCheck('BUILD_NOW', quality(48, 'Mid'), verdict('WATCH_CLOSELY'))).toEqual({
      qualityScore: 48, qualityTier: 'Mid', v2Label: 'Watch Closely', direction: 'more cautious',
    })
    expect(deriveVerdictCrossCheck('VALIDATE_FURTHER', quality(30, 'Low'), verdict('AVOID'))).toEqual({
      qualityScore: 30, qualityTier: 'Low', v2Label: 'Avoid', direction: 'more cautious',
    })
  })

  it('flags a real optimistic gap in the other direction', () => {
    expect(deriveVerdictCrossCheck('SKIP', quality(74, 'High'), verdict('BUILD_NOW'))).toEqual({
      qualityScore: 74, qualityTier: 'High', v2Label: 'Build Now', direction: 'more optimistic',
    })
    expect(deriveVerdictCrossCheck('VALIDATE_FURTHER', quality(81, 'High'), verdict('BUILD_NOW'))).toEqual({
      qualityScore: 81, qualityTier: 'High', v2Label: 'Build Now', direction: 'more optimistic',
    })
  })
})

describe('deriveSupplyVelocityDisplay', () => {
  it('returns null (honest unavailable) when the signal was never contributed', () => {
    expect(deriveSupplyVelocityDisplay(undefined)).toBeNull()
  })

  it('returns null when the signal exists but neither share was computed', () => {
    const signal: SupplyVelocitySignal = { score: 0, confidence: 0.4 }
    expect(deriveSupplyVelocityDisplay(signal)).toBeNull()
  })

  it('surfaces the real young-listing shares and entry-velocity classification', () => {
    const signal: SupplyVelocitySignal = {
      score: 6, confidence: 0.75, young_listing_pct_12m: 0.3, young_listing_pct_24m: 0.5,
      entry_velocity_ratio: 0.6, entry_velocity: 'Accelerating', sample_size: 22,
    }
    expect(deriveSupplyVelocityDisplay(signal)).toEqual({
      youngListingPct12m: 0.3, youngListingPct24m: 0.5, entryVelocity: 'Accelerating',
    })
  })
})

describe('deriveScienceDisplay', () => {
  it('returns null (the common, honest case for untracked ingredients) when the signal is absent', () => {
    expect(deriveScienceDisplay(undefined)).toBeNull()
  })

  it('surfaces the real publication trend/velocity and trial registration count', () => {
    const signal: ScienceSignal = {
      score: 8, confidence: 0.75, ingredient: 'berberine',
      publication_counts_by_year: { '2023': 683, '2024': 796 },
      publication_velocity_pct: 16.5, publication_trend: 'Accelerating',
      trial_registrations_count: 133, as_of: '2026-07-13T08:00:00.000Z',
    }
    expect(deriveScienceDisplay(signal)).toEqual({
      ingredient: 'berberine', publicationTrend: 'Accelerating', publicationVelocityPct: 16.5, trialRegistrationsCount: 133,
    })
  })
})
