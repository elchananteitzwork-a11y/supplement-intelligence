// Tests for buildRecordChapters' Economics chapter — specifically the
// measured Amazon fee rows added per docs/RD_V4_MEASURED_FEES.md. No test
// file existed for lib/partner-copy-record.ts before this (see the R&D
// doc's Reuse Audit); scoped to the Economics chapter only, not a full
// suite for the other five chapters this file also builds.

import { describe, it, expect } from 'vitest'
import { buildRecordChapters } from '../partner-copy-record'
import type { MemoData } from '@/types/index'

// Same file-local scaffold-plus-cast convention as
// lib/__tests__/scoring-honesty-pass.test.ts's REQUIRED_MEMO_SCAFFOLD —
// only the fields buildRecordChapters actually reads, rest satisfied via
// `as unknown as MemoData`.
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
  scores: { demand: {}, virality: {}, subscription: {}, manufacturing: {} },
} as const

function memoWithEconomics(overrides: Partial<MemoData> = {}): MemoData {
  return {
    ...REQUIRED_MEMO_SCAFFOLD,
    product_recommendation: {
      format: '', dosing: '', formula: [], avoid: [],
      cogs_estimate: '$3.20/unit', retail_price: '$29.99', gross_margin: '89%',
    },
    financial_projections: { gross_margin: '89%', net_margin_at_scale: '', path_to_10m: '' },
    ...overrides,
  } as unknown as MemoData
}

function economicsRows(memo: MemoData) {
  const chapter = buildRecordChapters(memo).find(c => c.key === 'economics')
  return chapter?.rows ?? []
}

describe('Economics chapter — measured Amazon fee rows', () => {
  it('renders both fee rows, measured, between retail price and gross margin, when both fields are present', () => {
    const memo = memoWithEconomics({
      signal_evidence: {
        providers_used: ['keepa'], overall_confidence: 0.7,
        demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
        revenue: {
          value: { score: 6, confidence: 0.7, avg_referral_fee_pct: 15, avg_fba_pick_pack_fee: '$4.53' },
          sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
        },
      } as unknown as MemoData['signal_evidence'],
    })

    const rows = economicsRows(memo)
    const claims = rows.map(r => r.claim)

    expect(claims.indexOf('Comparable retail price'))
      .toBeLessThan(claims.indexOf('Amazon referral fee'))
    expect(claims.indexOf('Amazon referral fee'))
      .toBeLessThan(claims.indexOf('Fulfillment fee (FBA, category average)'))
    expect(claims.indexOf('Fulfillment fee (FBA, category average)'))
      .toBeLessThan(claims.indexOf('Gross margin'))

    const referral = rows.find(r => r.claim === 'Amazon referral fee')!
    expect(referral.value).toBe('15% of price')
    expect(referral.marker).toBe('measured')

    const fba = rows.find(r => r.claim === 'Fulfillment fee (FBA, category average)')!
    expect(fba.value).toBe('$4.53')
    expect(fba.marker).toBe('measured')
  })

  it('renders neither fee row when the revenue dimension has no fee fields (no crash)', () => {
    const memo = memoWithEconomics({
      signal_evidence: {
        providers_used: ['keepa'], overall_confidence: 0.7,
        demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
        revenue: {
          value: { score: 6, confidence: 0.7 },
          sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
        },
      } as unknown as MemoData['signal_evidence'],
    })

    const claims = economicsRows(memo).map(r => r.claim)
    expect(claims).not.toContain('Amazon referral fee')
    expect(claims).not.toContain('Fulfillment fee (FBA, category average)')
    // The chapter itself still renders — other real rows are unaffected.
    expect(claims).toContain('Comparable retail price')
  })

  it('renders neither fee row when signal_evidence is absent entirely (legacy analysis, no crash)', () => {
    const memo = memoWithEconomics({ signal_evidence: undefined })

    const claims = economicsRows(memo).map(r => r.claim)
    expect(claims).not.toContain('Amazon referral fee')
    expect(claims).not.toContain('Fulfillment fee (FBA, category average)')
    expect(claims).toContain('Comparable retail price')
    expect(claims).toContain('Gross margin')
  })

  it('renders only the referral-fee row when only that field is present (each row gates independently)', () => {
    const memo = memoWithEconomics({
      signal_evidence: {
        providers_used: ['keepa'], overall_confidence: 0.7,
        demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
        revenue: {
          value: { score: 6, confidence: 0.7, avg_referral_fee_pct: 15 },
          sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
        },
      } as unknown as MemoData['signal_evidence'],
    })

    const claims = economicsRows(memo).map(r => r.claim)
    expect(claims).toContain('Amazon referral fee')
    expect(claims).not.toContain('Fulfillment fee (FBA, category average)')
  })
})
