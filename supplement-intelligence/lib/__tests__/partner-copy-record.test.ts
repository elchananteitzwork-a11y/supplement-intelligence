// Tests for buildRecordChapters' Economics chapter — specifically the
// measured Amazon fee rows added per docs/RD_V4_MEASURED_FEES.md. No test
// file existed for lib/partner-copy-record.ts before this (see the R&D
// doc's Reuse Audit); scoped to the Economics chapter only, not a full
// suite for the other five chapters this file also builds.

import { describe, it, expect } from 'vitest'
import { buildRecordChapters, buildEvidenceAppendix, buildCompetitiveReviewsVM } from '../partner-copy-record'
import type { MemoData } from '@/types/index'
import type { MarketReport } from '@/lib/competitive-review-engine'

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

// ── Item ב (docs/RD_V4_NICHE_COMPETITOR_ECONOMICS.md) ─────────────────────

function memoWithCompetitorRevenues(): MemoData {
  return memoWithEconomics({
    signal_evidence: {
      providers_used: ['keepa'], overall_confidence: 0.7,
      demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
      revenue: {
        value: {
          score: 6, confidence: 0.7,
          top_competitor_revenues: [
            { productId: 'BIG', brand: 'Big Brand', price: 37, monthly_sold: 20000, est_monthly_revenue_mo: 740_000 },
            { productId: 'MID', brand: 'Mid Brand', price: 30, monthly_sold: 3000, est_monthly_revenue_mo: 90_000 },
          ],
          measured_revenue_total_mo: 830_000,
          revenue_concentration_top1: 0.89,
          off_category_excluded_count: 2,
        },
        sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
      },
    } as unknown as MemoData['signal_evidence'],
    // A competitor row is needed for the Competition chapter to exist at all.
    biggest_competitor: { name: 'Big Brand', revenue: '~$740k/mo', gap: '' },
  })
}

describe('Item ב — measured competitor revenue surfaces', () => {
  it('Economics leads with the measured-total row; Competition carries the leader-share row', () => {
    const chapters = buildRecordChapters(memoWithCompetitorRevenues())

    const econ = chapters.find(c => c.key === 'economics')!
    expect(econ.rows[0]).toEqual({
      claim: 'Measured revenue, top 2 sellers',
      value: '~$830k/mo',
      marker: 'measured',
    })

    const comp = chapters.find(c => c.key === 'competition')!
    const share = comp.rows.find(r => r.claim === "Leader's share of measured revenue")!
    expect(share.value).toBe('~89%')
    expect(share.marker).toBe('measured')
  })

  it('neither row appears without the fields (legacy analyses)', () => {
    const chapters = buildRecordChapters(memoWithEconomics({
      biggest_competitor: { name: 'Someone', revenue: '', gap: '' },
    }))
    const claims = chapters.flatMap(c => c.rows.map(r => r.claim))
    expect(claims).not.toContain('Measured revenue, top 2 sellers')
    expect(claims).not.toContain("Leader's share of measured revenue")
  })

  it('appendix: real table rows + floor/exclusion footnote when fields exist', () => {
    const vm = buildEvidenceAppendix(memoWithCompetitorRevenues())
    expect(vm.competitorRows).toEqual([
      { brand: 'Big Brand', price: '$37', unitsLabel: '~20,000/mo', revenueLabel: '~$740k/mo' },
      { brand: 'Mid Brand', price: '$30', unitsLabel: '~3,000/mo', revenueLabel: '~$90k/mo' },
    ])
    expect(vm.competitorsFootnote).toContain('rounded-down bands')
    expect(vm.competitorsFootnote).toContain('2 search results from a different product category')
  })

  it('appendix: legacy analyses keep the empty table and the honest fallback note', () => {
    const vm = buildEvidenceAppendix(memoWithEconomics())
    expect(vm.competitorRows).toEqual([])
    expect(vm.competitorsFootnote).toBeNull()
    expect(vm.competitorsNote).toContain('not yet surfaced here')
  })
})

// ── Item ג (docs/RD_V4_COMPETITIVE_REVIEWS.md §3.4) ────────────────────────

function marketReportFixture(): MarketReport {
  return {
    asins_analyzed: ['A1', 'A2', 'A3'],
    products_analyzed: 3,
    products: [
      { asin: 'A1', brand: 'Big Brand', avg_rating: 4.21, reviews_collected: 40, pain_score: 6, opportunity_score: 7, market_confidence: 0.7, top_complaints: ['tastes awful', 'clumps in water', 'weak scoop', 'fourth complaint'], top_requested_features: [], overall_sentiment: 'mixed' },
      { asin: 'A2', title: 'Untitled Product Two', brand: '', avg_rating: 4.5, reviews_collected: 38, pain_score: 4, opportunity_score: 5, market_confidence: 0.7, top_complaints: ['pricey'], top_requested_features: [], overall_sentiment: 'positive' },
      { asin: 'A3', brand: 'Broken Brand', avg_rating: 0, reviews_collected: 0, pain_score: 0, opportunity_score: 0, market_confidence: 0, top_complaints: [], top_requested_features: [], overall_sentiment: '', error: 'collection failed' },
    ],
    market_pain_score: 6, market_opportunity_score: 7, gap_score: 6.5, competition_risk: 4, market_confidence: 0.7,
    universal_gaps: [
      { description: 'Bad taste across the category', category: 'quality_issue', prevalence: 1, product_count: 3, asin_examples: ['A1'], severity: 'High' },
    ],
    common_gaps: [
      { description: 'Packaging arrives damaged', category: 'packaging_issue', prevalence: 0.66, product_count: 2, asin_examples: ['A2'], severity: 'Medium' },
    ],
    niche_gaps: [],
    top_market_gaps: [], winner_features: ['third-party tested', 'transparent labels', 'f3', 'f4', 'f5'],
    ai_market_recommendation: 'rec', ai_product_brief: 'Build the clean-taste option.',
    total_reviews_collected: 78, total_reviews_analyzed: 78,
    analyzed_at: '2026-07-28T00:00:00Z', analysis_version: '1.0.0',
  }
}

describe('buildCompetitiveReviewsVM', () => {
  it('maps gaps with measured prevalence labels, sorted by prevalence, winners capped at 4', () => {
    const vm = buildCompetitiveReviewsVM(marketReportFixture())
    expect(vm.statsLine).toBe('78 real reviews across 3 competitors')
    expect(vm.gaps[0]).toEqual({ text: 'Bad taste across the category', prevalenceLabel: '3 of 3 competitors', severity: 'High' })
    expect(vm.gaps[1].prevalenceLabel).toBe('2 of 3 competitors')
    expect(vm.winnerFeatures).toHaveLength(4)
    expect(vm.productBrief).toBe('Build the clean-taste option.')
  })

  it('drops errored competitors, falls back brand→title→asin, caps complaints at 3', () => {
    const vm = buildCompetitiveReviewsVM(marketReportFixture())
    expect(vm.competitors).toHaveLength(2)
    expect(vm.competitors[0]).toEqual({ name: 'Big Brand', rating: '4.2', reviews: 40, topComplaints: ['tastes awful', 'clumps in water', 'weak scoop'] })
    expect(vm.competitors[1].name).toBe('Untitled Product Two')
  })
})
