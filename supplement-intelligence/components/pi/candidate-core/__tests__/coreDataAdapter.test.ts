// RD-UIv2-M4 §3/§5 — sourcesCount wiring test. Asserts buildCoreViewModel's
// new `sourcesCount` field is read verbatim off the same real
// evidenceBreadth.contributingProviders the Core hero's Sources toggle
// label needs (never re-derived or approximated), for a real fixture memo
// (same SCAFFOLD/fixture convention as
// lib/__tests__/evidence-breadth-honesty.test.ts — a real MemoData shape,
// not a mocked computeGroundedScore).

import { describe, it, expect } from 'vitest'
import type { MemoData } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { buildCoreViewModel } from '../coreDataAdapter'

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

// Real fixture memo with two genuinely-contributing providers (dataforseo
// via keyword_intelligence, apify-alibaba via a real, non-ai_synthesis
// manufacturing_estimate) — mirrors evidence-breadth-honesty.test.ts's own
// fixture shape so this doesn't invent a new fixture-building pattern.
function memoWithTwoProviders(): MemoData {
  return {
    ...SCAFFOLD,
    keyword_intelligence: {
      top_buying: [{ keyword: 'creatine monohydrate powder', monthly_searches: 20_000 }],
      opportunity: [],
    },
    manufacturing_estimate: {
      product: 'test', category: 'supplements',
      top_supplier_rating: null,
      complexity: 'Low', confidence: 0.6, confidence_label: 'Moderate',
      data_source: 'apify', notes: '', fetched_at: new Date().toISOString(),
    },
  } as unknown as MemoData
}

describe('buildCoreViewModel — sourcesCount', () => {
  it('equals the real evidenceBreadth.contributingProviders.length for a memo with real provider evidence', () => {
    const m = memoWithTwoProviders()
    const grounded = computeGroundedScore(m)
    const vm = buildCoreViewModel(m, { entry: null, alerts: [] })

    expect(grounded.evidenceBreadth.contributingProviders.length).toBeGreaterThan(0)
    expect(vm.sourcesCount).toBe(grounded.evidenceBreadth.contributingProviders.length)
  })

  it('equals 0 for a memo with no real contributing providers (never a fabricated fallback count)', () => {
    const m = { ...SCAFFOLD } as unknown as MemoData
    const grounded = computeGroundedScore(m)
    const vm = buildCoreViewModel(m, { entry: null, alerts: [] })

    expect(grounded.evidenceBreadth.contributingProviders.length).toBe(0)
    expect(vm.sourcesCount).toBe(0)
  })
})
