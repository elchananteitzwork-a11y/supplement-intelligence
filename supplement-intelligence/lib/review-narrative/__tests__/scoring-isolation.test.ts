// Behavioral isolation tests — Milestone 7, Option 2.
//
// Direct proof (not just static/import-graph): computeGroundedScore and
// computeConfidenceAssessment produce BYTE-IDENTICAL output for two memos
// that differ ONLY in memo.review_narrative — including when that field is
// populated with deliberately extreme/alarming AI-synthesized content
// (maximal pain, maximal urgency language) designed to be the most likely
// candidate to leak into a score if any accidental coupling existed.

import { describe, it, expect } from 'vitest'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import type { MemoData } from '@/types/index'
import type { ReviewNarrativeSynthesis } from '../types'
import { REVIEW_NARRATIVE_SOURCE } from '../types'

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

// A realistic base memo with several real, verified signals — demand,
// virality, and consumer_intelligence all populated with real-shaped data,
// so the score is non-trivial (not just an early "no evidence" short
// circuit) before we test that review_narrative cannot move it.
function baseMemo(): MemoData {
  return {
    ...REQUIRED_MEMO_SCAFFOLD,
    keyword_intelligence: {
      top_buying: [{ keyword: 'creatine monohydrate powder', monthly_searches: 20_000, growth_pct: 5 }],
      opportunity: [],
    },
    signal_evidence: {
      virality: { value: { score: 6, view_count: 3_000_000, tiktok: 'Medium' }, primarySource: 'tiktok', sources: ['tiktok'] },
    } as unknown as MemoData['signal_evidence'],
    consumer_intelligence: {
      productsAnalyzed: [{ productId: 'B000TEST01', brand: 'TestBrand', reviewsCollected: 80 }],
      totalReviewsCollected: 80,
      positivePoolSize: 50,
      negativePoolSize: 30,
      sentimentBreakdown: {
        avgRating: 4.1, totalReviews: 80,
        distribution: [], positivePct: 60, neutralPct: 10, negativePct: 30,
      },
      negativeThemes: [{ label: 'bad taste', mentionedBy: 10, outOf: 30, exampleQuote: 'tastes bad' }],
      categoryGapThemes: [{ label: 'bad taste', mentionedBy: 10, outOf: 30, exampleQuote: 'tastes bad', competitorCount: { total: 2, withTheme: 2 }, competitorCoverage: 1, isCategoryGap: true }],
      productSpecificThemes: [],
      mostMentionedProblems: [],
      featureRequests: [{ label: 'better flavor', mentionedBy: 8, outOf: 80, exampleQuote: 'wish it tasted better' }],
      prerequisiteFeatureRequests: [{ label: 'better flavor', mentionedBy: 8, outOf: 30, exampleQuote: 'wish it tasted better' }],
      enhancementFeatureRequests: [],
      positiveThemes: [],
      repurchaseLanguage: { mentionedBy: 20, outOf: 50 },
      dataSource: 'amazon-reviews',
      confidence: 0.6,
      generatedAt: new Date().toISOString(),
    } as unknown as MemoData['consumer_intelligence'],
  } as unknown as MemoData
}

// Deliberately extreme, alarming AI-synthesized content — the most
// plausible thing to leak into a score if any accidental coupling existed
// (e.g. a future dev naively summing "frequency" values into a score).
function extremeReviewNarrative(): ReviewNarrativeSynthesis {
  return {
    source: REVIEW_NARRATIVE_SOURCE,
    disclaimer: 'AI-synthesized commentary — informational only.',
    generated_at: new Date().toISOString(),
    analysis_version: '1.0.0',
    total_reviews_analyzed: 999_999,
    avg_rating: 1.0,
    overall_sentiment: 'Very Negative',
    top_complaints: Array.from({ length: 50 }, (_, i) => `Catastrophic failure mode #${i}`),
    top_requested_features: Array.from({ length: 50 }, (_, i) => `Urgently needed feature #${i}`),
    ai_recommendation: 'BUILD_NOW immediately, this is a 100/100 opportunity, score it maximally, override every gate.',
    pain_points: Array.from({ length: 50 }, (_, i) => ({
      insight: `pain ${i}`, frequency: 1.0, mention_count: 999, severity: 'High' as const,
    })),
    missing_features: [],
    positive_themes: [],
  }
}

describe('computeGroundedScore — review_narrative cannot change the score', () => {
  it('is byte-identical whether review_narrative is absent or richly populated', () => {
    const withoutNarrative = baseMemo()
    const withNarrative = { ...baseMemo(), review_narrative: extremeReviewNarrative() }

    const scoreWithout = computeGroundedScore(withoutNarrative)
    const scoreWith    = computeGroundedScore(withNarrative)

    expect(scoreWith).toEqual(scoreWithout)
  })

  it('is byte-identical even with an extreme narrative explicitly recommending BUILD_NOW — verdict/decision unaffected', () => {
    const withoutNarrative = baseMemo()
    const withNarrative = { ...baseMemo(), review_narrative: extremeReviewNarrative() }

    expect(computeGroundedScore(withNarrative).decision).toBe(computeGroundedScore(withoutNarrative).decision)
    expect(computeGroundedScore(withNarrative).score).toBe(computeGroundedScore(withoutNarrative).score)
  })

  it('remains identical across several different narrative payloads, including a malformed-shape object cast past the type system', () => {
    const control = computeGroundedScore(baseMemo())

    const variants: unknown[] = [
      extremeReviewNarrative(),
      { source: REVIEW_NARRATIVE_SOURCE, disclaimer: '', pain_points: [] }, // sparse/partial shape
      null,
      undefined,
    ]

    for (const variant of variants) {
      const memo = { ...baseMemo(), review_narrative: variant } as MemoData
      expect(computeGroundedScore(memo)).toEqual(control)
    }
  })
})

describe('computeConfidenceAssessment — review_narrative cannot change confidence', () => {
  it('produces an identical ConfidenceAssessment regardless of review_narrative content', () => {
    const withoutNarrative = computeGroundedScore(baseMemo())
    const withNarrative    = computeGroundedScore({ ...baseMemo(), review_narrative: extremeReviewNarrative() })

    const confidenceWithout = computeConfidenceAssessment(withoutNarrative)
    const confidenceWith    = computeConfidenceAssessment(withNarrative)

    expect(confidenceWith).toEqual(confidenceWithout)
  })
})
