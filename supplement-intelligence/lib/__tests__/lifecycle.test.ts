// Lifecycle classifier + gap velocity tests — Roadmap M2.2.
//
// Acceptance criteria under test (roadmap, verbatim):
//   "Every analysis emits a stage + gap velocity with the inputs that
//    produced it (auditable)."
//   "Known-answer tests: a saturated fixture (creatine-like) classifies
//    Saturated/Contested; a fabricated emerging fixture classifies
//    Emerging."
//
// Two layers: classifyLifecycleStage/computeGapVelocity unit tests
// (deterministic, no I/O, exercise the signature-table rules directly),
// and computeLifecycle known-answer fixture tests (exercise the full
// orchestration against MemoData/GroundedScore-shaped fixtures).

import { describe, it, expect } from 'vitest'
import { classifyLifecycleStage, computeGapVelocity, computeLifecycle, LIFECYCLE_MODEL_VERSION } from '../lifecycle'
import type { LifecycleClassification } from '../lifecycle'
import type { MemoData } from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'
import type { ConcordanceMatrix } from '../concordance'

function inputs(overrides: Partial<LifecycleClassification['inputs']> = {}): LifecycleClassification['inputs'] {
  return {
    search_momentum:        'Stable',
    amazon_demand_momentum: 'Stable',
    amazon_demand_level:    'Medium',
    social_level:           'Medium',
    supply_entry_velocity:  'Stable',
    supply_young_listing_pct_24m: 0.3,
    ...overrides,
  }
}

describe('classifyLifecycleStage — the signature table', () => {
  it('Declining: both real demand channels falling', () => {
    const stage = classifyLifecycleStage(inputs({
      search_momentum: 'Decelerating', amazon_demand_momentum: 'Decelerating',
    }))
    expect(stage).toBe('Declining')
  })

  it('Saturated: high real demand, nothing accelerating, no new-entrant surge', () => {
    const stage = classifyLifecycleStage(inputs({
      amazon_demand_level: 'High', search_momentum: 'Stable', amazon_demand_momentum: 'Stable', supply_entry_velocity: 'Stable',
    }))
    expect(stage).toBe('Saturated')
  })

  it('Contested: demand AND new-entrant supply both accelerating with a real listings surge', () => {
    const stage = classifyLifecycleStage(inputs({
      amazon_demand_momentum: 'Accelerating', supply_entry_velocity: 'Accelerating', supply_young_listing_pct_24m: 0.6,
    }))
    expect(stage).toBe('Contested')
  })

  it('Window Open: search + Amazon demand both accelerating, supply not yet accelerating', () => {
    const stage = classifyLifecycleStage(inputs({
      search_momentum: 'Accelerating', amazon_demand_momentum: 'Accelerating', supply_entry_velocity: 'Stable', amazon_demand_level: 'Medium',
    }))
    expect(stage).toBe('Window Open')
  })

  it('Emerging: search accelerating, Amazon-side presence still small/absent, supply not accelerating', () => {
    const stage = classifyLifecycleStage(inputs({
      search_momentum: 'Accelerating', amazon_demand_level: 'Absent', amazon_demand_momentum: 'Unknown', supply_entry_velocity: 'Low' as never,
    }))
    expect(stage).toBe('Emerging')
  })

  it('Latent: no real demand signal anywhere, nothing accelerating', () => {
    const stage = classifyLifecycleStage(inputs({
      amazon_demand_level: 'Absent', search_momentum: 'Absent', amazon_demand_momentum: 'Absent', supply_entry_velocity: 'Unknown',
    }))
    expect(stage).toBe('Latent')
  })

  it('falls back to Saturated (conservative) for an ambiguous signature with real, non-absent demand', () => {
    const stage = classifyLifecycleStage(inputs({
      amazon_demand_level: 'Medium', search_momentum: 'Unknown', amazon_demand_momentum: 'Unknown', supply_entry_velocity: 'Unknown',
    }))
    expect(stage).toBe('Saturated')
  })

  it('falls back to Latent (conservative) for an ambiguous signature with no real demand', () => {
    const stage = classifyLifecycleStage(inputs({
      amazon_demand_level: 'Absent', search_momentum: 'Unknown', amazon_demand_momentum: 'Unknown', supply_entry_velocity: 'Unknown',
    }))
    expect(stage).toBe('Latent')
  })
})

describe('computeGapVelocity', () => {
  it('computes value as demand_acceleration_pct minus the normalized supply figure when both are real', () => {
    const gv = computeGapVelocity(20, 0.8) // supply ratio 0.8 -> (0.8-0.5)*200 = 60
    expect(gv.demand_acceleration_pct).toBe(20)
    expect(gv.supply_acceleration_normalized_pct).toBe(60)
    expect(gv.value).toBeCloseTo(20 - 60, 5)
  })

  it('maps a neutral (0.5) supply ratio to 0% normalized acceleration', () => {
    const gv = computeGapVelocity(10, 0.5)
    expect(gv.supply_acceleration_normalized_pct).toBe(0)
    expect(gv.value).toBe(10)
  })

  it('returns null value (never fabricated) when demand acceleration is missing', () => {
    const gv = computeGapVelocity(null, 0.5)
    expect(gv.value).toBeNull()
    expect(gv.supply_acceleration_normalized_pct).toBe(0)
  })

  it('returns null value (never fabricated) when supply velocity ratio is missing', () => {
    const gv = computeGapVelocity(15, undefined)
    expect(gv.value).toBeNull()
    expect(gv.demand_acceleration_pct).toBe(15)
    expect(gv.supply_acceleration_normalized_pct).toBeNull()
  })

  it('stamps the model version', () => {
    expect(computeGapVelocity(1, 0.5).version).toBe(LIFECYCLE_MODEL_VERSION)
  })
})

// ── Known-answer fixtures (roadmap's exact acceptance criterion) ─────────

const MEMO_SCAFFOLD = {
  category_name: 'Test', executive_summary: '', build_decision: 'SKIP',
  build_explanation: '', opportunity_score: 0,
  biggest_competitor: { name: '', revenue: '', gap: '' }, market_size: '',
  gross_margin: '', market_gaps: [], brand_opportunities: [],
  customer_language: { frustrations: [], desires: [], fears: [], ad_phrases: [] },
  product_recommendation: { format: '', dosing: '', formula: [], avoid: [], cogs_estimate: '', retail_price: '', gross_margin: '' },
  financial_projections: { gross_margin: '', net_margin_at_scale: '', path_to_10m: '' },
  scores: { demand: {}, virality: {}, subscription: {}, manufacturing: {} },
} as const

function groundedWithDemand(rawScore: number): GroundedScore {
  return {
    score: 60, decision: 'VALIDATE_FURTHER',
    dimensions: [{ key: 'demand', label: 'Demand', weight: 0.22, rawScore, source: 'verified', sourceLabel: 'test' }],
    groundedPct: 100, insufficientEvidence: false,
    evidenceBreadth: { contributingProviders: [], totalScoreEligibleProviders: 8, pct: 0, channelBreakdown: [], distinctChannelTypes: 0, crossChannelCorroborated: false },
  }
}

function matrix(searchMomentum: string, amazonMomentum: string): ConcordanceMatrix {
  return {
    dimension: 'demand',
    reads: [
      { channel: 'search_intent',  label: 'Search / SEO',       provider: 'google-trends', momentum: searchMomentum as never },
      { channel: 'amazon_market',  label: 'Amazon Marketplace', provider: 'keepa',         momentum: amazonMomentum as never },
      { channel: 'consumer_voice', label: 'Consumer Voice',     momentum: 'Absent' },
    ],
    distinctReportingChannels: 2,
    agreement: searchMomentum === amazonMomentum ? 'Unanimous' : 'Mixed',
  }
}

describe('computeLifecycle — known-answer fixtures (roadmap acceptance criterion, verbatim)', () => {
  it('a saturated, creatine-like fixture (huge established demand, flat search, no new-entrant surge) classifies Saturated or Contested', () => {
    const memo: MemoData = {
      ...MEMO_SCAFFOLD,
      concordance_matrix: matrix('Stable', 'Stable'),
      signal_evidence: {
        growth: { value: { score: 6, confidence: 0.7, momentum: 'Stable', momentum_90d_pct: 1 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
        virality: { value: { score: 8, confidence: 0.6 }, sources: ['tiktok'], primarySource: 'tiktok', confidence: 0.6 },
        supply_velocity: { value: { score: 2, confidence: 0.75, young_listing_pct_12m: 0.05, young_listing_pct_24m: 0.1, entry_velocity_ratio: 0.5, entry_velocity: 'Stable', sample_size: 30 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.75 },
        providers_used: ['keepa', 'tiktok'], overall_confidence: 0.7,
      },
    } as unknown as MemoData
    const { classification } = computeLifecycle(memo, groundedWithDemand(9)) // 9/10 = 'High'
    expect(['Saturated', 'Contested']).toContain(classification.stage)
  })

  it('a fabricated emerging fixture (search accelerating, Amazon-side demand still absent, supply not surging) classifies Emerging', () => {
    const memo: MemoData = {
      ...MEMO_SCAFFOLD,
      concordance_matrix: matrix('Accelerating', 'Absent'),
      signal_evidence: {
        growth: { value: { score: 8, confidence: 0.7, momentum: 'Accelerating', momentum_90d_pct: 40 }, sources: ['google-trends'], primarySource: 'google-trends', confidence: 0.7 },
        supply_velocity: { value: { score: 1, confidence: 0.5, young_listing_pct_12m: 0.05, young_listing_pct_24m: 0.08, entry_velocity_ratio: 0.4, entry_velocity: 'Stable', sample_size: 8 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.5 },
        providers_used: ['google-trends', 'keepa'], overall_confidence: 0.6,
      },
    } as unknown as MemoData
    const { classification } = computeLifecycle(memo, groundedWithDemand(0)) // no real Amazon-side demand score -> 'Absent'... see note below
    expect(classification.stage).toBe('Emerging')
  })

  it('always names science as unmeasured — never silently presented as a resolved input', () => {
    const memo: MemoData = { ...MEMO_SCAFFOLD } as unknown as MemoData
    const { classification } = computeLifecycle(memo, groundedWithDemand(5))
    expect(classification.unmeasured_dimensions).toContain('science')
  })

  it('every classification names its own model version, for future-classifier comparability', () => {
    const memo: MemoData = { ...MEMO_SCAFFOLD } as unknown as MemoData
    const { classification } = computeLifecycle(memo, groundedWithDemand(5))
    expect(classification.version).toBe(LIFECYCLE_MODEL_VERSION)
  })

  it('produces a real, auditable gap velocity from real growth momentum_90d_pct and supply entry_velocity_ratio', () => {
    const memo: MemoData = {
      ...MEMO_SCAFFOLD,
      signal_evidence: {
        growth: { value: { score: 7, confidence: 0.7, momentum_90d_pct: 25 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
        supply_velocity: { value: { score: 3, confidence: 0.6, entry_velocity_ratio: 0.7, entry_velocity: 'Accelerating', sample_size: 12 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.6 },
        providers_used: ['keepa'], overall_confidence: 0.65,
      },
    } as unknown as MemoData
    const { gapVelocity } = computeLifecycle(memo, groundedWithDemand(5))
    expect(gapVelocity.demand_acceleration_pct).toBe(25)
    expect(gapVelocity.supply_acceleration_normalized_pct).toBeCloseTo((0.7 - 0.5) * 200, 5)
    expect(gapVelocity.value).not.toBeNull()
  })

  it('gap velocity is null (never fabricated) when supply_velocity was never contributed', () => {
    const memo: MemoData = {
      ...MEMO_SCAFFOLD,
      signal_evidence: {
        growth: { value: { score: 7, confidence: 0.7, momentum_90d_pct: 25 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
        providers_used: ['keepa'], overall_confidence: 0.7,
      },
    } as unknown as MemoData
    const { gapVelocity } = computeLifecycle(memo, groundedWithDemand(5))
    expect(gapVelocity.value).toBeNull()
    expect(gapVelocity.supply_acceleration_normalized_pct).toBeNull()
  })
})
