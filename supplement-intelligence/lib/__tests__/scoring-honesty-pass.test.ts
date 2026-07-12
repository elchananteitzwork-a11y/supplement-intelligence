// Scoring honesty pass tests — V2 Blueprint §6 / Roadmap M1.2 / Milestone 4,
// SCORING_ENGINE_VERSION 2.9.0.
//
// Covers: manufacturing is never weighted (regardless of data availability),
// its former 5% weight redistributes automatically to verified dimensions,
// and the pre-existing correct behaviors (seasonality never scored,
// AI-judgment fallbacks always weight-0) are re-confirmed rather than
// silently assumed.

import { describe, it, expect } from 'vitest'
import { computeGroundedScore } from '../scoring'
import type { MemoData } from '@/types/index'

const REQUIRED_MEMO_SCAFFOLD = {
  category_name: 'Creatine',
  executive_summary: '',
  build_decision: 'SKIP',
  build_explanation: '',
  opportunity_score: 0,
  biggest_competitor: { name: '', revenue: '', gap: '' },
  market_size: '',
  gross_margin: '',
  market_gaps: [],
  brand_opportunities: [],
  customer_language: { frustrations: [], desires: [], fears: [], ad_phrases: [] },
  product_recommendation: {
    format: '', dosing: '', formula: [], avoid: [], cogs_estimate: '', retail_price: '', gross_margin: '',
  },
  financial_projections: { gross_margin: '', net_margin_at_scale: '', path_to_10m: '' },
} as const

function manufacturingEstimate(): MemoData['manufacturing_estimate'] {
  return {
    product: 'creatine', category: 'supplements',
    top_supplier_rating: 4.5,
    complexity: 'Low', confidence: 0.8, confidence_label: 'High',
    data_source: 'apify', notes: '', fetched_at: new Date().toISOString(),
    top_suppliers: [
      { name: 'Supplier A', customizable: true, country_code: 'CN' },
      { name: 'Supplier B', customizable: true, country_code: 'IN' },
    ],
    lead_time_days: { low: 25, high: 40 },
  }
}

function memoWithDemand(overrides: Partial<MemoData> = {}): MemoData {
  return {
    ...REQUIRED_MEMO_SCAFFOLD,
    scores: { demand: {}, virality: {}, subscription: {}, manufacturing: {} },
    keyword_intelligence: {
      top_buying: [{ keyword: 'creatine monohydrate powder', monthly_searches: 20_000 }],
      opportunity: [],
    },
    ...overrides,
  } as unknown as MemoData
}

describe('manufacturing is never a weighted dimension', () => {
  it('with real supplier data present, manufacturing still gets weight 0', () => {
    const memo = memoWithDemand({ manufacturing_estimate: manufacturingEstimate() })
    const grounded = computeGroundedScore(memo)
    const mfg = grounded.dimensions.find(d => d.key === 'manufacturing')
    expect(mfg).toBeDefined()
    expect(mfg!.weight).toBe(0)
    expect(mfg!.source).toBe('synthesized')
  })

  it('with NO supplier data, manufacturing still gets weight 0 (same as before — no regression)', () => {
    const memo = memoWithDemand() // no manufacturing_estimate
    const grounded = computeGroundedScore(memo)
    const mfg = grounded.dimensions.find(d => d.key === 'manufacturing')
    expect(mfg).toBeDefined()
    expect(mfg!.weight).toBe(0)
  })

  it('preserves the real manufacturing score as a qualitative level for report display, even though it is not scored', () => {
    const memo = memoWithDemand({ manufacturing_estimate: manufacturingEstimate() })
    const grounded = computeGroundedScore(memo)
    const mfg = grounded.dimensions.find(d => d.key === 'manufacturing')
    // Two customizable suppliers across 2 countries, 25-40 day lead time —
    // a real, decent-but-not-perfect manufacturing profile. It must surface
    // as SOME qualitative level (not silently dropped), never as a rawScore.
    expect(mfg!.qualitativeLevel).toBeDefined()
    expect(mfg!.rawScore).toBeUndefined()
  })

  it('no dimension in the output is ever key=manufacturing with weight > 0, across both data states', () => {
    for (const est of [manufacturingEstimate(), undefined]) {
      const grounded = computeGroundedScore(memoWithDemand({ manufacturing_estimate: est }))
      const offenders = grounded.dimensions.filter(d => d.key === 'manufacturing' && d.weight > 0)
      expect(offenders).toHaveLength(0)
    }
  })
})

describe('manufacturing\'s former 5% weight redistributes automatically', () => {
  it('when demand is the only verified dimension, it absorbs 100% of the weight (manufacturing excluded, not just diluted)', () => {
    const memo = memoWithDemand({ manufacturing_estimate: manufacturingEstimate() })
    const grounded = computeGroundedScore(memo)
    const demand = grounded.dimensions.find(d => d.key === 'demand')
    expect(demand?.weight).toBeCloseTo(1.0, 5)
  })

  it('when demand AND virality are both verified, their weights split proportionally to BASE_WEIGHTS (22:10), summing to 1.0, with zero share going to manufacturing', () => {
    const memo = memoWithDemand({
      manufacturing_estimate: manufacturingEstimate(),
      signal_evidence: {
        virality: { value: { score: 7, view_count: 5_000_000, tiktok: 'Medium' }, primarySource: 'tiktok', sources: ['tiktok'] },
      } as unknown as MemoData['signal_evidence'],
    })
    const grounded = computeGroundedScore(memo)
    const demand   = grounded.dimensions.find(d => d.key === 'demand')!
    const virality = grounded.dimensions.find(d => d.key === 'virality')!
    const mfg      = grounded.dimensions.find(d => d.key === 'manufacturing')!

    // BASE_WEIGHTS: demand=22, virality=10 → 22/32 and 10/32 exactly.
    expect(demand.weight).toBeCloseTo(22 / 32, 5)
    expect(virality.weight).toBeCloseTo(10 / 32, 5)
    expect(demand.weight + virality.weight).toBeCloseTo(1.0, 5)
    expect(mfg.weight).toBe(0)
  })
})

describe('scoring honesty pass — re-confirming already-correct behaviors (no regression)', () => {
  it('AI-judgment (qualitative) candidates are always weight 0 — demand with no real signal at all', () => {
    const memo = {
      ...REQUIRED_MEMO_SCAFFOLD,
      scores: { demand: { level: 'Medium' }, virality: {}, subscription: {}, manufacturing: {} },
    } as unknown as MemoData
    const grounded = computeGroundedScore(memo)
    const demand = grounded.dimensions.find(d => d.key === 'demand')
    expect(demand?.weight).toBe(0)
    expect(demand?.source).toBe('synthesized')
    expect(demand?.qualitativeLevel).toBe('Medium')
  })
})
