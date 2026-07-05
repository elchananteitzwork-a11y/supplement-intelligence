// ── Validation tests ──────────────────────────────────────────────────────
// Covers: AT-CONTRACT-001 (schema validation fires on invalid input)
//         AT-CONTRACT-002 (prohibited fields absent)
//         AT-ACCESS-001   (AI boundary: only allowed fields present)

import { describe, it, expect } from 'vitest'
import { validateSynthesisInput } from '../validate'
import type { SynthesisInput } from '../types'

// ── Minimal valid SynthesisInput for baseline ─────────────────────────────

const VALID_INPUT: SynthesisInput = {
  query:    'magnesium glycinate sleep',
  category: 'Magnesium Supplements',
  analysis_date: '2026-07-05',

  verdict:             'VALIDATION_REQUIRED',
  verdict_confidence:  'MODERATE',
  overall_score:       54,

  signals: [
    {
      id:              'demand',
      display_label:   'Market Demand',
      score:           6.2,
      confidence:      'MODERATE',
      headline:        'Moderate demand signal',
      supporting_stat: '28,400 searches/mo',
    },
    {
      id:              'market_accessibility',
      display_label:   'Market Accessibility',
      score:           4.8,
      confidence:      'MODERATE',
      headline:        'Moderate market competition',
      supporting_stat: '12 competitors',
    },
  ],

  primary_risk: {
    type:     'REVIEW_MOAT',
    severity: 'MODERATE',
    evidence: { review_moat_score: 2.8, avg_review_count: 3200 },
  },

  consumer_clusters: [
    { label: 'Sleep quality issues', frequency: 42, frequency_pct: 28, sentiment: 'NEGATIVE' },
  ],
  thin_corpus:  false,
  corpus_size:  150,

  keyword_summary: {
    total_monthly_volume: 45_000,
    top_3_keywords: [
      { keyword: 'magnesium glycinate sleep', volume: 28_400 },
      { keyword: 'magnesium glycinate', volume: 12_000 },
      { keyword: 'magnesium for sleep', volume: 4_600 },
    ],
    trend_direction: 'UP',
  },

  competitor_context: {
    meaningful_competitor_count: 12,
    avg_review_count:            3200,
    review_concentration_ratio:  0.52,
    avg_rating:                  4.4,
    top_competitors: [
      { brand: 'Pure Encapsulations', price: 34.99, review_count: 8400 },
      { brand: 'Thorne',              price: 29.99, review_count: 5200 },
      { brand: 'NOW Foods',           price: 19.99, review_count: 3100 },
    ],
  },

  manufacturing_context: {
    moq_range:       { min: 500, max: 2000 },
    unit_cost_range: { min: 4.20, max: 6.80 },
    feasibility:     'MODERATE',
  },

  demand_calibration: {
    monthly_search_volume: 28_400,
    keepa_monthly_units:   4_200,
    price_range: { median: 29, p25: 22, p75: 38 },
  },

  virality_context: {
    signal_strength:    'MODERATE',
    top_hashtag_volume: 18_000_000,
    top_hashtag:        'magnesiumsleep',
  },

  excluded_signals: [
    { signal_id: 'subscription_potential', reason: 'THIN_CORPUS' },
  ],
  confidence_flags: [],
}

// ── AT-CONTRACT-001: Schema validation fires on invalid input ─────────────

describe('AT-CONTRACT-001: validateSynthesisInput fires on invalid input', () => {
  it('passes on a valid SynthesisInput', () => {
    const result = validateSynthesisInput(VALID_INPUT)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects null input', () => {
    const result = validateSynthesisInput(null)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects missing required field: verdict', () => {
    const input = { ...VALID_INPUT, verdict: undefined }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('verdict'))).toBe(true)
  })

  it('rejects invalid verdict value', () => {
    const input = { ...VALID_INPUT, verdict: 'BUILD_NOW' }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('verdict'))).toBe(true)
  })

  it('rejects overall_score outside 0-100', () => {
    const input = { ...VALID_INPUT, overall_score: 105 }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('overall_score'))).toBe(true)
  })

  it('rejects non-integer overall_score', () => {
    const input = { ...VALID_INPUT, overall_score: 54.7 }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
  })

  it('rejects analysis_date that includes time component', () => {
    const input = { ...VALID_INPUT, analysis_date: '2026-07-05T12:00:00Z' }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('analysis_date'))).toBe(true)
  })

  it('rejects signal with score > 10', () => {
    const input = {
      ...VALID_INPUT,
      signals: [{ ...VALID_INPUT.signals[0], score: 11 }],
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('score'))).toBe(true)
  })

  it('rejects signal with invalid id', () => {
    const input = {
      ...VALID_INPUT,
      signals: [{ ...VALID_INPUT.signals[0], id: 'fake_signal' as any }],
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('id'))).toBe(true)
  })

  it('rejects supporting_stat longer than 30 chars', () => {
    const input = {
      ...VALID_INPUT,
      signals: [{ ...VALID_INPUT.signals[0], supporting_stat: 'A'.repeat(31) }],
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('supporting_stat'))).toBe(true)
  })

  it('rejects more than 7 signals', () => {
    const extra = Array(8).fill(VALID_INPUT.signals[0])
    const input = { ...VALID_INPUT, signals: extra }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('signals'))).toBe(true)
  })

  it('rejects more than 3 consumer_clusters', () => {
    const cluster = { label: 'X', frequency: 5, frequency_pct: 3, sentiment: 'NEGATIVE' as const }
    const input = { ...VALID_INPUT, consumer_clusters: [cluster, cluster, cluster, cluster] }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('consumer_clusters'))).toBe(true)
  })

  it('rejects more than 3 keyword entries in top_3_keywords', () => {
    const kw = { keyword: 'x', volume: 1 }
    const input = {
      ...VALID_INPUT,
      keyword_summary: { ...VALID_INPUT.keyword_summary!, top_3_keywords: [kw, kw, kw, kw] },
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
  })

  it('rejects invalid primary_risk.type', () => {
    const input = { ...VALID_INPUT, primary_risk: { ...VALID_INPUT.primary_risk, type: 'FAKE_RISK' as any } }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
  })

  it('rejects invalid primary_risk.severity', () => {
    const input = { ...VALID_INPUT, primary_risk: { ...VALID_INPUT.primary_risk, severity: 'CRITICAL' as any } }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
  })

  it('rejects invalid trend_direction in keyword_summary', () => {
    const input = {
      ...VALID_INPUT,
      keyword_summary: { ...VALID_INPUT.keyword_summary!, trend_direction: 'RISING' as any },
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
  })

  it('rejects consumer_cluster with frequency_pct > 100', () => {
    const input = {
      ...VALID_INPUT,
      consumer_clusters: [{ label: 'X', frequency: 5, frequency_pct: 101, sentiment: 'NEGATIVE' as const }],
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
  })

  it('rejects missing analysis_date', () => {
    const input = { ...VALID_INPUT, analysis_date: undefined as any }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('analysis_date'))).toBe(true)
  })
})

// ── AT-CONTRACT-002 / AT-ACCESS-001: Prohibited fields must be absent ──────

describe('AT-CONTRACT-002 / AT-ACCESS-001: Prohibited fields detection', () => {
  it('rejects input with productsAnalyzed field', () => {
    const input = { ...VALID_INPUT, productsAnalyzed: [{ productId: 'B001', brand: 'X', reviewsCollected: 42 }] }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('productsAnalyzed'))).toBe(true)
  })

  it('rejects competitor with productId (ASIN) present', () => {
    const input = {
      ...VALID_INPUT,
      competitor_context: {
        ...VALID_INPUT.competitor_context!,
        top_competitors: [
          { brand: 'X', price: 29, review_count: 500, productId: 'B001ABC123' } as any,
        ],
      },
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('productId'))).toBe(true)
  })

  it('rejects competitor with ingredients_label present', () => {
    const input = {
      ...VALID_INPUT,
      competitor_context: {
        ...VALID_INPUT.competitor_context!,
        top_competitors: [
          { brand: 'X', price: 29, review_count: 500, ingredients_label: 'Magnesium (as magnesium glycinate) 120mg' } as any,
        ],
      },
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('ingredients_label'))).toBe(true)
  })

  it('rejects competitor with bullets present', () => {
    const input = {
      ...VALID_INPUT,
      competitor_context: {
        ...VALID_INPUT.competitor_context!,
        top_competitors: [
          { brand: 'X', price: 29, review_count: 500, bullets: ['bullet 1'] } as any,
        ],
      },
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('bullets'))).toBe(true)
  })

  it('rejects consumer_cluster with exampleQuote present', () => {
    const input = {
      ...VALID_INPUT,
      consumer_clusters: [
        { label: 'X', frequency: 5, frequency_pct: 3, sentiment: 'NEGATIVE' as const, exampleQuote: 'I hated this product' } as any,
      ],
    }
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('exampleQuote'))).toBe(true)
  })

  it('rejects input with provider name field (deep scan)', () => {
    const input = { ...VALID_INPUT, provider: 'keepa' } as any
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('provider'))).toBe(true)
  })

  it('rejects input with cache_key field', () => {
    const input = { ...VALID_INPUT, cache_key: 'reviews:v1:B001ABC123' } as any
    const result = validateSynthesisInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('cache_key'))).toBe(true)
  })

  it('passes competitor_context with only allowed fields', () => {
    // brand, price, review_count only — no prohibited fields
    const result = validateSynthesisInput(VALID_INPUT)
    expect(result.valid).toBe(true)
  })
})
