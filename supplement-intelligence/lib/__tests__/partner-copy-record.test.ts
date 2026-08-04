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
      { brand: 'Big Brand', price: '$37', unitsLabel: '~20,000/mo', revenueLabel: '~$740k/mo', reviewsLabel: '—' },
      { brand: 'Mid Brand', price: '$30', unitsLabel: '~3,000/mo', revenueLabel: '~$90k/mo', reviewsLabel: '—' },
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
    expect(vm.statsLine).toBe('78 real reviews across the 3 strongest brands here')
    expect(vm.gaps[0]).toEqual({ text: 'Bad taste across the category', prevalenceLabel: '3 of the 3 top brands', severity: 'High' })
    expect(vm.gaps[1].prevalenceLabel).toBe('2 of the 3 top brands')
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

// ── Roadmap "Dynamic Science Coverage" (docs/RD_DYNAMIC_SCIENCE_COVERAGE.md)
// §3 step 6 — the science-queued honesty line. Additive only: never touches
// coverageLine or any other EvidenceAppendixVM field.
describe('buildEvidenceAppendix — scienceQueuedNote', () => {
  it('is present, capitalized, when the query matches the vocabulary and no science signal exists yet', () => {
    const vm = buildEvidenceAppendix(memoWithEconomics({
      product_query: 'Ashwagandha Gummies for Stress',
      signal_evidence: undefined,
    }))
    expect(vm.scienceQueuedNote).toBe('Science evidence for Ashwagandha is not yet available — it will appear after the next automated science update.')
  })

  it('is null when the query does not match any tracked or vocabulary ingredient', () => {
    const vm = buildEvidenceAppendix(memoWithEconomics({
      product_query: 'a totally generic gummy vitamin brand',
      signal_evidence: undefined,
    }))
    expect(vm.scienceQueuedNote).toBeNull()
  })

  it('is null when a real science signal already exists for the matched ingredient', () => {
    const vm = buildEvidenceAppendix(memoWithEconomics({
      product_query: 'Ashwagandha Gummies for Stress',
      signal_evidence: {
        providers_used: ['science'], overall_confidence: 0.7,
        demand_verified: false, virality_verified: false, pricing_verified: false, growth_verified: false,
        science: { value: { score: 5, confidence: 0.5, ingredient: 'ashwagandha' }, sources: ['science-pipeline'], primarySource: 'science-pipeline', confidence: 0.5 },
      } as unknown as MemoData['signal_evidence'],
    }))
    expect(vm.scienceQueuedNote).toBeNull()
  })

  it('also renders for a tracked-3 ingredient with no science signal yet (matchTrackedIngredient matches it too)', () => {
    const vm = buildEvidenceAppendix(memoWithEconomics({
      product_query: 'Berberine for blood sugar',
      signal_evidence: undefined,
    }))
    // 'berberine' is not in the demand queue at all (it's not enqueued —
    // see shouldEnqueueScienceDemand) but matchTrackedIngredient still
    // returns it, so the note DOES render for it today; this test documents
    // that real, current behavior rather than asserting a stronger claim
    // this milestone's scope doesn't cover (distinguishing the queue-table
    // case from the "one of the 3 benchmark tracked ingredients, awaiting
    // its existing nightly refresh" case is out of scope — see R&D doc §7).
    // Review fix: wording no longer says "queued" for this reason — it was
    // never literally queued (see the field's own doc comment above).
    expect(vm.scienceQueuedNote).toBe('Science evidence for Berberine is not yet available — it will appear after the next automated science update.')
  })

  it('never touches coverageLine — additive only', () => {
    const memo = memoWithEconomics({
      product_query: 'Ashwagandha Gummies for Stress',
      signal_evidence: undefined,
      evidence_depth_score: {
        available: true, score: 50, coverage: 0.5,
        inputs_available: ['ingredient_canonicalization'],
        contributions: [{ input: 'ingredient_canonicalization', score: 0 }],
        methodology: 'test', version: 'v1',
      } as unknown as MemoData['evidence_depth_score'],
    })
    const vm = buildEvidenceAppendix(memo)
    expect(vm.coverageLine).toContain('1 of 6 deep-evidence clusters')
    expect(vm.scienceQueuedNote).toBe('Science evidence for Ashwagandha is not yet available — it will appear after the next automated science update.')
  })
})

describe('buildCompetitiveReviewsVM — niche fallback (live finding 2026-07-28)', () => {
  it('falls back to niche_gaps with honest 1-of-N labels when cross-product tiers are empty', () => {
    const report = marketReportFixture()
    report.universal_gaps = []
    report.common_gaps = []
    report.niche_gaps = [
      { description: 'Clumps in cold water', category: 'quality_issue', prevalence: 0.33, product_count: 1, asin_examples: ['A1'], severity: 'High' },
      { description: 'Too sweet from stevia', category: 'quality_issue', prevalence: 0.33, product_count: 1, asin_examples: ['A2'], severity: 'Medium' },
    ]
    const vm = buildCompetitiveReviewsVM(report)
    expect(vm.gaps).toHaveLength(2)
    expect(vm.gaps[0].prevalenceLabel).toBe('1 of the 3 top brands')
  })
})

// ── Truth audit 2026-08-02 (docs/RD_TRUTH_AUDIT.md) — marker honesty ────────
// LLM-written memo fields must never carry the 'measured' marker; the leader
// rows follow signal_metadata.competitor_revenue_verified (the real-data
// override flag set by lib/real-competitor.ts), not the field name.
describe('marker honesty — LLM-written fields are never labeled measured', () => {
  function memoWithAiFields(overrides: Partial<MemoData> = {}): MemoData {
    return {
      ...REQUIRED_MEMO_SCAFFOLD,
      biggest_competitor: { name: 'BrandX', revenue: '$1M/mo', gap: 'no gummies' },
      market_saturation: { dominant_brands: 'BrandX, BrandY' },
      product_recommendation: {
        format: '', dosing: '', formula: [], avoid: [],
        cogs_estimate: '$3.20/unit', retail_price: '$29.99', gross_margin: '89%',
      },
      customer_language: { frustrations: ['pills too large'], desires: [], fears: [], ad_phrases: [] },
      ...overrides,
    } as unknown as MemoData
  }
  const allRows = (m: MemoData) => buildRecordChapters(m).flatMap(c => c.rows)
  const markerOf = (m: MemoData, claim: string) => allRows(m).find(r => r.claim === claim)?.marker

  it('labels cogs/retail/dominant-brands/top-frustration as judgment', () => {
    const m = memoWithAiFields()
    expect(markerOf(m, 'Landed unit cost')).toBe('judgment')
    expect(markerOf(m, 'Comparable retail price')).toBe('judgment')
    expect(markerOf(m, 'Dominant brands')).toBe('judgment')
    expect(markerOf(m, 'Top frustration')).toBe('judgment')
  })

  it('labels leader rows judgment when competitor_revenue_verified is absent/false', () => {
    const m = memoWithAiFields()
    expect(markerOf(m, 'Category leader')).toBe('judgment')
    expect(markerOf(m, "Leader's revenue")).toBe('judgment')
  })

  it('labels leader rows measured when the real-data override ran', () => {
    const m = memoWithAiFields({
      signal_metadata: { competitor_revenue_verified: true } as MemoData['signal_metadata'],
    })
    expect(markerOf(m, 'Category leader')).toBe('measured')
    expect(markerOf(m, "Leader's revenue")).toBe('measured')
  })
})

// ── Entry Proof (docs/RD_ENTRY_PROOF.md) — display surfaces ────────────────
describe('Entry Proof — Competition row + appendix reviews column', () => {
  function memoWithEntryProof(entryProofOverride?: Record<string, unknown>): MemoData {
    return {
      ...REQUIRED_MEMO_SCAFFOLD,
      signal_evidence: {
        providers_used: ['keepa'], overall_confidence: 0.7,
        demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
        revenue: {
          value: {
            score: 6, confidence: 0.7,
            top_competitor_revenues: [
              { productId: 'LEADER', brand: 'BigLeader', price: 30, monthly_sold: 5000, est_monthly_revenue_mo: 150000, review_count: 20000, listing_age_months: 90 },
              { productId: 'FRESH',  brand: 'FreshCo',   price: 28, monthly_sold: 3000, est_monthly_revenue_mo: 84000,  review_count: 45,    listing_age_months: 8 },
            ],
            measured_revenue_total_mo: 234000,
            revenue_concentration_top1: 0.64,
            entry_proof: {
              productId: 'FRESH', brand: 'FreshCo', monthly_sold: 3000, review_count: 45,
              price: 28, listing_age_months: 8, recent: true,
              niche_median_reviews: 10023, niche_median_sold: 4000, niche_median_price: 29,
              ...entryProofOverride,
            },
          },
          sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
        },
      } as unknown as MemoData['signal_evidence'],
    } as unknown as MemoData
  }

  const competitionRows = (m: MemoData) =>
    buildRecordChapters(m).find(c => c.key === 'competition')?.rows ?? []

  it('renders the headline row, measured, with both real numbers and the niche median', () => {
    const row = competitionRows(memoWithEntryProof())
      .find(r => r.claim === 'Proof of entry — low-review seller moving volume')!
    expect(row).toBeDefined()
    expect(row.marker).toBe('measured')
    expect(row.value).toBe('FreshCo: ~3,000/mo with only 45 reviews (typical here: 10,023 reviews)')
  })

  it('appends the price-dump disclosure when suspected', () => {
    const row = competitionRows(memoWithEntryProof({ price: 9, price_dump_suspected: true }))
      .find(r => r.claim === 'Proof of entry — low-review seller moving volume')!
    expect(row.value).toContain('— at $9 vs typical $29')
  })

  it('renders no row when entry_proof is absent (legacy analyses unaffected)', () => {
    const m = memoWithEntryProof()
    const se = m.signal_evidence as unknown as { revenue: { value: Record<string, unknown> } }
    delete se.revenue.value.entry_proof
    expect(competitionRows(m).some(r => r.claim.startsWith('Proof of entry'))).toBe(false)
  })

  it('appendix rows always carry a reviews label — real count or an honest dash', () => {
    const m = memoWithEntryProof()
    const vm = buildEvidenceAppendix(m)
    expect(vm.competitorRows[0].reviewsLabel).toBe('20,000 reviews')
    expect(vm.competitorRows[1].reviewsLabel).toBe('45 reviews')

    const legacy = memoWithEntryProof()
    const se = legacy.signal_evidence as unknown as { revenue: { value: { top_competitor_revenues: Record<string, unknown>[] } } }
    delete se.revenue.value.top_competitor_revenues[0].review_count
    expect(buildEvidenceAppendix(legacy).competitorRows[0].reviewsLabel).toBe('—')
  })
})

// ── Entry Proof ladder wording (owner design 2026-08-03) ────────────────────
describe('Entry Proof ladder — tier wording scales with member count', () => {
  function memoWithMembers(members: Record<string, unknown>[]): MemoData {
    const m = {
      ...REQUIRED_MEMO_SCAFFOLD,
      signal_evidence: {
        providers_used: ['keepa'], overall_confidence: 0.7,
        demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
        revenue: {
          value: {
            score: 6, confidence: 0.7,
            entry_proof: {
              ...members[0],
              niche_median_reviews: 201, niche_median_sold: 5000, niche_median_price: 27,
              members,
            },
          },
          sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
        },
      } as unknown as MemoData['signal_evidence'],
    } as unknown as MemoData
    return m
  }
  const entryRow = (m: MemoData) =>
    buildRecordChapters(m).find(c => c.key === 'competition')?.rows
      .find(r => r.claim.startsWith('Proof of entry') || r.claim.startsWith('Entry pattern'))

  const M = (id: string, brand: string, sold: number, reviews: number, extra: Record<string, unknown> = {}) =>
    ({ productId: id, brand, monthly_sold: sold, review_count: reviews, price: 26, ...extra })

  it('3+ members → "Entry pattern" wording with count, max reviews, min volume', () => {
    const row = entryRow(memoWithMembers([
      M('A', 'FreshOne', 5000, 86), M('B', 'FreshTwo', 2000, 66), M('C', 'FreshThree', 2000, 134),
    ]))!
    expect(row.claim).toBe('Entry pattern — multiple low-review sellers moving volume')
    expect(row.value).toBe('3 different brands, each ≤134 reviews, each moving ~2,000+/mo (typical here: 201 reviews)')
    expect(row.marker).toBe('measured')
  })

  it('2 members → "two independent" wording naming both brands', () => {
    const row = entryRow(memoWithMembers([
      M('A', 'FreshOne', 5000, 86), M('B', 'FreshTwo', 2000, 66),
    ]))!
    expect(row.claim).toBe('Proof of entry — two independent low-review sellers')
    expect(row.value).toBe('FreshOne + FreshTwo: each ≤86 reviews, each moving ~2,000+/mo (typical here: 201 reviews)')
  })

  it('1 member → single-example wording (same as legacy)', () => {
    const row = entryRow(memoWithMembers([M('A', 'FreshOne', 5000, 86)]))!
    expect(row.claim).toBe('Proof of entry — low-review seller moving volume')
    expect(row.value).toBe('FreshOne: ~5,000/mo with only 86 reviews (typical here: 201 reviews)')
  })

  it('a dump-suspected member adds the inline price disclosure to the tier line', () => {
    const row = entryRow(memoWithMembers([
      M('A', 'FreshOne', 5000, 86), M('B', 'CheapCo', 2000, 66, { price: 9, price_dump_suspected: true }),
      M('C', 'FreshThree', 2000, 134),
    ]))!
    expect(row.value).toContain('— incl. one at $9 vs typical $27')
  })
})

// ── Entry Outcomes (docs/RD_ENTRY_OUTCOMES.md) — display surfaces ──────────
describe('Entry Outcomes — state-dependent Competition row + appendix caveat', () => {
  function memoWithOutcomes(eo: Record<string, unknown> | undefined): MemoData {
    return {
      ...REQUIRED_MEMO_SCAFFOLD,
      biggest_competitor: { name: 'Someone', revenue: '', gap: '' },
      signal_evidence: {
        providers_used: ['keepa'], overall_confidence: 0.7,
        demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
        revenue: {
          value: { score: 6, confidence: 0.7, ...(eo && { entry_outcomes: eo }) },
          sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
        },
      } as unknown as MemoData['signal_evidence'],
    } as unknown as MemoData
  }
  const M = (id: string, sold: number | null) => ({ productId: id, brand: id, monthly_sold: sold, review_count: 50, listing_age_months: 10, price: 25 })
  const base = { young_total: 6, large_base_count: 1, small_scale_count: 5, judgeable_count: 5, stall_threshold_sold: 200 }
  const outcomesRow = (m: MemoData) =>
    buildRecordChapters(m).find(c => c.key === 'competition')?.rows
      .find(r => ['Young sellers here break through', 'Young sellers here often stall', 'No small-scale young seller visible'].includes(r.claim))

  it('welcoming renders the breakout ratio, measured', () => {
    const row = outcomesRow(memoWithOutcomes({ ...base, state: 'welcoming', broke_out: [M('A',5000),M('B',3000),M('C',2000),M('D',900),M('E',800)], stalled: [] }))!
    expect(row.marker).toBe('measured')
    expect(row.value).toBe('5 of 5 small-scale young listings (6-24mo) are selling past ~200/mo')
  })

  it('contested renders the stall ratio with the actual computed bar', () => {
    const row = outcomesRow(memoWithOutcomes({ ...base, state: 'contested', stall_threshold_sold: 100, broke_out: [M('A',5000),M('B',3000)], stalled: [M('C',100),M('D',50),M('E',null)] }))!
    expect(row.value).toBe("3 of 5 small-scale young listings (6-24mo) are stuck at ~100/mo or less by Amazon's own sales badge")
  })

  it('no_small_entrants_visible renders the review-scale observation (no brand-identity claim)', () => {
    const row = outcomesRow(memoWithOutcomes({ ...base, state: 'no_small_entrants_visible', young_total: 4, small_scale_count: 0, judgeable_count: 0, broke_out: [], stalled: [] }))!
    expect(row.value).toBe('Every young listing visible here (4) already carries a 1,000+ review base')
  })

  it('insufficient renders no row; absent entry_outcomes renders no row', () => {
    expect(outcomesRow(memoWithOutcomes({ ...base, state: 'insufficient', broke_out: [], stalled: [] }))).toBeUndefined()
    expect(outcomesRow(memoWithOutcomes(undefined))).toBeUndefined()
  })

  it('appendix caveat renders exactly when a claim was made', () => {
    const withClaim = buildEvidenceAppendix(memoWithOutcomes({ ...base, state: 'contested', broke_out: [], stalled: [M('C',100)] }))
    expect(withClaim.entryOutcomesCaveat).toContain('visible top-search results only')
    const noClaim = buildEvidenceAppendix(memoWithOutcomes({ ...base, state: 'insufficient', broke_out: [], stalled: [] }))
    expect(noClaim.entryOutcomesCaveat).toBeNull()
    expect(buildEvidenceAppendix(memoWithOutcomes(undefined)).entryOutcomesCaveat).toBeNull()
  })
})

// ── Wounded Leader + Amazon Presence — display (docs/RD_WOUNDED_LEADER_AMAZON_PRESENCE.md)
describe('Wounded Leader + Amazon Presence rows', () => {
  function memoWith(fields: Record<string, unknown>): MemoData {
    return {
      ...REQUIRED_MEMO_SCAFFOLD,
      biggest_competitor: { name: 'Someone', revenue: '', gap: '' },
      signal_evidence: {
        providers_used: ['keepa'], overall_confidence: 0.7,
        demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
        revenue: { value: { score: 6, confidence: 0.7, ...fields }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
      } as unknown as MemoData['signal_evidence'],
    } as unknown as MemoData
  }
  const compRow = (m: MemoData, claim: string) =>
    buildRecordChapters(m).find(c => c.key === 'competition')?.rows.find(r => r.claim === claim)

  it('wounded leader row lists each wound with its real numbers', () => {
    const m = memoWith({ wounded_leader: { productId: 'L', brand: 'Create', wounds: [
      { type: 'rating_gap', now: 4.0, baseline: 4.5 },
      { type: 'price_climb', now: 33, baseline: 29 },
    ] } })
    const row = compRow(m, 'The revenue leader shows cracks')!
    expect(row.marker).toBe('measured')
    expect(row.value).toBe('Create: rating 4.0 vs 4.5 typical here; price up 14% vs its yearly average')
  })

  it('amazon presence renders the house-brand fact with real volume + appendix context', () => {
    const m = memoWith({ amazon_presence: {
      house_brands: [{ productId: 'A', brand: 'Amazon Basics', monthly_sold: 9000 }],
    } })
    expect(compRow(m, "Amazon's own brand sells here")!.value).toBe('Amazon Basics at ~9,000/mo')
    expect(buildEvidenceAppendix(m).amazonPresenceContext).toContain('~1% of its overall sales')
  })

  it('volume-less house brand renders without a number; absence renders nothing', () => {
    const m = memoWith({ amazon_presence: {
      house_brands: [{ productId: 'A', brand: 'Solimo', monthly_sold: null }],
    } })
    expect(compRow(m, "Amazon's own brand sells here")!.value).toBe('Solimo')
    const empty = memoWith({})
    expect(compRow(empty, "Amazon's own brand sells here")).toBeUndefined()
    expect(compRow(empty, 'The revenue leader shows cracks')).toBeUndefined()
    expect(buildEvidenceAppendix(empty).amazonPresenceContext).toBeNull()
  })
})
