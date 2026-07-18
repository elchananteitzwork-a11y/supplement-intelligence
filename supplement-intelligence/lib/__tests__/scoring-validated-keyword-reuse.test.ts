// Regression tests — 2026-07 audit Finding 2: three scoring.ts call sites
// (computeMarketAccessibility's difficulty->ease sub-signal, computeProfitability's
// CAC-pressure CPC sub-signal, and the demandCrossValidated weight-exclusion check)
// bypassed the nav+semantic keyword filter that computeDemand and
// computeReviewMoatScore already applied via checkKeywordIntent /
// checkKeywordSemanticRelevance / checkKeywordProductSignals, and read raw
// top_buying[0] instead. Fix: all 4 sites now go through the single shared
// helper getValidatedKeywords(m).keywords[0].
//
// Every test below puts a NAVIGATIONAL keyword ("... near me") first in
// top_buying with numbers that are outliers relative to the real, product-
// relevant second keyword, so any accidental raw top_buying[0] read produces
// a detectably different (and wrong) score than the filtered read.

import { describe, it, expect } from 'vitest'
import { getValidatedKeywords, computeGroundedScore } from '../scoring'
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
  scores: { demand: {}, virality: {}, subscription: {}, manufacturing: {} },
} as const

const NAV_KEYWORD = 'creatine store hours of operation'   // matches NAVIGATIONAL_PATTERNS — always rejected
const VALID_KEYWORD = 'creatine monohydrate powder'

describe('getValidatedKeywords — shared filter (unit)', () => {
  it('rejects the navigational keyword and returns the real product keyword as keywords[0]', () => {
    const memo = {
      ...REQUIRED_MEMO_SCAFFOLD,
      product_query: 'creatine monohydrate',
      keyword_intelligence: {
        top_buying: [
          { keyword: NAV_KEYWORD, monthly_searches: 50_000, difficulty: 0, cpc: 20 },
          { keyword: VALID_KEYWORD, monthly_searches: 500, difficulty: 80, cpc: 2 },
        ],
        opportunity: [],
      },
    } as unknown as MemoData

    const { keywords, navSkipped } = getValidatedKeywords(memo)
    expect(keywords[0]?.keyword).toBe(VALID_KEYWORD)
    expect(navSkipped.map(k => k.keyword)).toContain(NAV_KEYWORD)
  })
})

describe('Finding 2 — computeMarketAccessibility difficulty sub-signal uses the validated keyword', () => {
  it('scores off the valid keyword\'s difficulty (80 -> ease 2), not the navigational keyword\'s (0 -> ease 10)', () => {
    const memo = {
      ...REQUIRED_MEMO_SCAFFOLD,
      product_query: 'creatine monohydrate',
      keyword_intelligence: {
        top_buying: [
          { keyword: NAV_KEYWORD, monthly_searches: 50_000, difficulty: 0, cpc: 20 },
          { keyword: VALID_KEYWORD, monthly_searches: 500, difficulty: 80, cpc: 2 },
        ],
        opportunity: [],
      },
      // No review_velocity/competition signal and no review-moat inputs, so
      // difficulty->ease is the ONLY market-accessibility sub-signal — isolates it.
    } as unknown as MemoData

    const grounded = computeGroundedScore(memo)
    const marketAccess = grounded.dimensions.find(d => d.key === 'marketAccessibility')
    expect(marketAccess).toBeDefined()
    // difficultyToEaseScore(80) = round((100-80)/10) = 2. If the bug were
    // present it would score off difficulty=0 -> ease 10 instead.
    expect(marketAccess!.rawScore).toBe(2)
  })
})

describe('Finding 2 — computeProfitability CAC-pressure sub-signal uses the validated keyword\'s CPC', () => {
  it('scores off the valid keyword\'s cpc ($2), not the navigational keyword\'s ($20)', () => {
    const memo = {
      ...REQUIRED_MEMO_SCAFFOLD,
      product_query: 'creatine monohydrate',
      keyword_intelligence: {
        top_buying: [
          { keyword: NAV_KEYWORD, monthly_searches: 50_000, difficulty: 0, cpc: 20 },
          { keyword: VALID_KEYWORD, monthly_searches: 500, difficulty: 80, cpc: 2 },
        ],
        opportunity: [],
      },
      signal_evidence: {
        pricing: { value: { avg_price: '$40', score: 5 }, primarySource: 'keepa', sources: ['keepa'], confidence: 0.8 },
        // No fee schedule, no manufacturing_estimate -> CAC pressure is the
        // ONLY profitability sub-signal, isolating it.
      } as unknown as MemoData['signal_evidence'],
    } as unknown as MemoData

    const grounded = computeGroundedScore(memo)
    const profitability = grounded.dimensions.find(d => d.key === 'profitability')
    expect(profitability).toBeDefined()
    // cacPressureToScore(cpc/price): valid keyword -> 2/40=0.05 -> round((1-0.05/0.20)*10) = 8.
    // Navigational keyword would give 20/40=0.5 -> round((1-0.5/0.20)*10) clamped to 0.
    expect(profitability!.rawScore).toBe(8)
  })
})

describe('Finding 2 — demandCrossValidated weight-exclusion check uses the validated keyword\'s monthly_searches', () => {
  function thinCorpusConsumerIntelligence(): MemoData['consumer_intelligence'] {
    return {
      productsAnalyzed: [{ productId: 'B000TEST01', brand: 'TestBrand', reviewsCollected: 30 }],
      totalReviewsCollected: 30,   // below THIN_SAMPLE_THRESHOLD (50)
      positivePoolSize: 20,
      negativePoolSize: 10,
      sentimentBreakdown: {
        avgRating: 4.0, totalReviews: 30,
        distribution: [], positivePct: 60, neutralPct: 10, negativePct: 30,
      },
      negativeThemes: [{ label: 'bad taste', mentionedBy: 5, outOf: 10, exampleQuote: 'tastes bad' }],
      categoryGapThemes: [{ label: 'bad taste', mentionedBy: 5, outOf: 10, exampleQuote: 'tastes bad', competitorCount: { total: 2, withTheme: 2 }, competitorCoverage: 1, isCategoryGap: true }],
      productSpecificThemes: [],
      mostMentionedProblems: [],
      featureRequests: [],
      prerequisiteFeatureRequests: [],
      enhancementFeatureRequests: [],
      positiveThemes: [],
      repurchaseLanguage: { mentionedBy: 5, outOf: 20 },
      dataSource: 'amazon-reviews',
      confidence: 0.6,
      generatedAt: new Date().toISOString(),
    } as unknown as MemoData['consumer_intelligence']
  }

  it('does NOT cross-validate demand off the navigational keyword\'s 50,000 searches — the real keyword only has 500', () => {
    const memo = {
      ...REQUIRED_MEMO_SCAFFOLD,
      product_query: 'creatine monohydrate',
      keyword_intelligence: {
        top_buying: [
          { keyword: NAV_KEYWORD, monthly_searches: 50_000, difficulty: 0, cpc: 20 },   // >=10k -> would wrongly cross-validate if bug present
          { keyword: VALID_KEYWORD, monthly_searches: 500, difficulty: 80, cpc: 2 },     // <10k -> correct answer is "not cross-validated"
        ],
        opportunity: [],
      },
      consumer_intelligence: thinCorpusConsumerIntelligence(),
    } as unknown as MemoData

    const grounded = computeGroundedScore(memo)
    const consumerPain = grounded.dimensions.find(d => d.key === 'consumerPain')
    expect(consumerPain).toBeDefined()

    // Fixed behavior: thin corpus + NOT cross-validated (real keyword is only
    // 500 searches/mo) -> Scenario A, dimension IS scored (real weight, real
    // rawScore) rather than being weight-excluded as "cross-validated."
    expect(consumerPain!.weight).toBeGreaterThan(0)
    expect(consumerPain!.rawScore).toBeDefined()
    expect(consumerPain!.sourceLabel).not.toMatch(/cross-validated demand/)
  })

  it('DOES cross-validate when the real (validated) keyword itself clears 10,000 searches', () => {
    const memo = {
      ...REQUIRED_MEMO_SCAFFOLD,
      product_query: 'creatine monohydrate',
      keyword_intelligence: {
        top_buying: [
          { keyword: NAV_KEYWORD, monthly_searches: 999, difficulty: 0, cpc: 20 },        // low volume, irrelevant anyway
          { keyword: VALID_KEYWORD, monthly_searches: 15_000, difficulty: 80, cpc: 2 },    // >=10k, real product keyword
        ],
        opportunity: [],
      },
      consumer_intelligence: thinCorpusConsumerIntelligence(),
    } as unknown as MemoData

    const grounded = computeGroundedScore(memo)
    const consumerPain = grounded.dimensions.find(d => d.key === 'consumerPain')
    expect(consumerPain).toBeDefined()
    expect(consumerPain!.weight).toBe(0)
    expect(consumerPain!.sourceLabel).toMatch(/cross-validated demand/)
    expect(consumerPain!.sourceLabel).toMatch(/15,000 searches\/mo/)
  })
})
