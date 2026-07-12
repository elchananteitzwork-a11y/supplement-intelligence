// Evidence-breadth honesty test — defect found during the 2026-07-10 live
// E2E audit (analysis 58af9656): an AI-synthesized manufacturing estimate
// (data_source 'ai_synthesis', no supplier data) was credited as an
// apify-alibaba provider contribution, inflating evidence_breadth_pct,
// distinct_channel_types, and the manufacturing_supply channel witness in
// dimension confidence. Fix: detectContributingProviders only credits
// apify-alibaba for real provider sources.

import { describe, it, expect } from 'vitest'
import { computeGroundedScore } from '../scoring'
import type { MemoData } from '@/types/index'

const SCAFFOLD = {
  category_name: 'Test',
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
  product_recommendation: { format: '', dosing: '', formula: [], avoid: [], cogs_estimate: '', retail_price: '', gross_margin: '' },
  financial_projections: { gross_margin: '', net_margin_at_scale: '', path_to_10m: '' },
  scores: { demand: {}, virality: {}, subscription: {}, manufacturing: {} },
} as const

function memoWithEstimate(dataSource: string): MemoData {
  return {
    ...SCAFFOLD,
    keyword_intelligence: {
      top_buying: [{ keyword: 'creatine monohydrate powder', monthly_searches: 20_000 }],
      opportunity: [],
    },
    manufacturing_estimate: {
      product: 'test', category: 'supplements',
      top_supplier_rating: null,
      complexity: 'Low', confidence: 0.3, confidence_label: 'Low',
      data_source: dataSource, notes: '', fetched_at: new Date().toISOString(),
    },
  } as unknown as MemoData
}

describe('detectContributingProviders — AI-synthesized estimates are not provider evidence', () => {
  it('does NOT credit apify-alibaba when manufacturing_estimate.data_source is ai_synthesis', () => {
    const grounded = computeGroundedScore(memoWithEstimate('ai_synthesis'))
    expect(grounded.evidenceBreadth.contributingProviders).not.toContain('apify-alibaba')
    const mfgChannel = grounded.evidenceBreadth.channelBreakdown.find(c => c.channel === 'manufacturing_supply')
    expect(mfgChannel?.contributed).toBe(false)
  })

  it('DOES credit apify-alibaba when the estimate came from a real provider (apify)', () => {
    const grounded = computeGroundedScore(memoWithEstimate('apify'))
    expect(grounded.evidenceBreadth.contributingProviders).toContain('apify-alibaba')
  })

  it('the fix changes only disclosure — the score itself is identical either way', () => {
    const aiScore   = computeGroundedScore(memoWithEstimate('ai_synthesis'))
    const realScore = computeGroundedScore(memoWithEstimate('apify'))
    // manufacturing has weight 0 (2.9.0) and no realistic_unit_cost exists in
    // either fixture, so the weighted score must be identical.
    expect(aiScore.score).toBe(realScore.score)
    expect(aiScore.decision).toBe(realScore.decision)
  })
})
