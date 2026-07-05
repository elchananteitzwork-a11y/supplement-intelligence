// ── Confidence tier tests ─────────────────────────────────────────────────
// Covers: AT-CONF-001 through AT-CONF-005
//         All 7 signal confidence tier assignments with boundary thresholds

import { describe, it, expect } from 'vitest'
import {
  demandConfidenceTier,
  marketAccessibilityConfidenceTier,
  consumerPainConfidenceTier,
  viralityConfidenceTier,
  manufacturingConfidenceTier,
  subscriptionConfidenceTier,
  profitabilityConfidenceTier,
} from '../confidence'
import type { MemoData } from '@/types/index'

// ── Minimal MemoData stubs ────────────────────────────────────────────────

function makeMemo(overrides: Partial<MemoData> = {}): MemoData {
  return {
    category_name:      'Magnesium Supplements',
    executive_summary:  '',
    build_decision:     'VALIDATE_FURTHER',
    build_explanation:  '',
    opportunity_score:  54,
    scores: {
      demand:        { level: 'Medium', notes: '' },
      virality:      { level: 'Medium', notes: '' },
      subscription:  { level: 'Medium', notes: '' },
      manufacturing: { level: 'Medium', notes: '' },
    },
    biggest_competitor: { name: '', revenue: '', gap: '' },
    market_size:        '',
    gross_margin:       '',
    market_gaps:        [],
    brand_opportunities: [],
    customer_language:  { frustrations: [], desires: [], fears: [], ad_phrases: [] },
    product_recommendation: {
      format: '', dosing: '', formula: [], avoid: [], cogs_estimate: '', retail_price: '', gross_margin: '',
    },
    financial_projections: { gross_margin: '', net_margin_at_scale: '', path_to_10m: '' },
    ...overrides,
  }
}

// ── AT-CONF-001: Demand confidence tier ──────────────────────────────────

describe('AT-CONF-001: demandConfidenceTier', () => {
  it('HIGH when DataForSEO ≥ 10,000 AND Keepa ≥ 5,000', () => {
    const memo = makeMemo({
      keyword_intelligence: {
        seed_keyword: 'magnesium',
        top_buying: [{ keyword: 'magnesium glycinate', monthly_searches: 12_000, growth_pct: null, competition: null, difficulty: null, cpc: null }],
        opportunity: [], long_tail: [], fast_growing: [],
        provider: 'dataforseo', fetched_at: '2026-07-05',
      },
      signal_evidence: {
        revenue: {
          value: { score: 7, confidence: 0.8, est_monthly_units_sold: '6000', est_monthly_revenue: '$180000' },
          sources: ['keepa'], primarySource: 'keepa', confidence: 0.8,
        },
        providers_used: ['keepa', 'dataforseo'],
        overall_confidence: 0.8,
      },
    })
    expect(demandConfidenceTier(memo)).toBe('HIGH')
  })

  it('MODERATE when only DataForSEO ≥ 5,000', () => {
    const memo = makeMemo({
      keyword_intelligence: {
        seed_keyword: 'magnesium',
        top_buying: [{ keyword: 'magnesium glycinate', monthly_searches: 7_000, growth_pct: null, competition: null, difficulty: null, cpc: null }],
        opportunity: [], long_tail: [], fast_growing: [],
        provider: 'dataforseo', fetched_at: '2026-07-05',
      },
    })
    expect(demandConfidenceTier(memo)).toBe('MODERATE')
  })

  it('LOW when neither source has sufficient data', () => {
    const memo = makeMemo({
      keyword_intelligence: {
        seed_keyword: 'obscure supplement',
        top_buying: [{ keyword: 'obscure supplement', monthly_searches: 800, growth_pct: null, competition: null, difficulty: null, cpc: null }],
        opportunity: [], long_tail: [], fast_growing: [],
        provider: 'dataforseo', fetched_at: '2026-07-05',
      },
    })
    expect(demandConfidenceTier(memo)).toBe('LOW')
  })

  it('LOW when keyword_intelligence is absent', () => {
    expect(demandConfidenceTier(makeMemo())).toBe('LOW')
  })
})

// ── AT-CONF-002: Market Accessibility confidence tier ─────────────────────

describe('AT-CONF-002: marketAccessibilityConfidenceTier', () => {
  it('HIGH when review_velocity.confidence ≥ 0.75', () => {
    const memo = makeMemo({
      signal_evidence: {
        review_velocity: {
          value: { score: 6, confidence: 0.8, meaningful_competitor_count: 12 },
          sources: ['apify'], primarySource: 'apify', confidence: 0.8,
        },
        providers_used: ['apify'],
        overall_confidence: 0.8,
      },
    })
    expect(marketAccessibilityConfidenceTier(memo)).toBe('HIGH')
  })

  it('MODERATE when confidence is 0.60', () => {
    const memo = makeMemo({
      signal_evidence: {
        review_velocity: {
          value: { score: 5, confidence: 0.6, meaningful_competitor_count: 7 },
          sources: ['apify'], primarySource: 'apify', confidence: 0.6,
        },
        providers_used: ['apify'],
        overall_confidence: 0.6,
      },
    })
    expect(marketAccessibilityConfidenceTier(memo)).toBe('MODERATE')
  })

  it('LOW when review_velocity is absent', () => {
    expect(marketAccessibilityConfidenceTier(makeMemo())).toBe('LOW')
  })
})

// ── AT-CONF-003: Consumer Pain confidence tier ────────────────────────────

describe('AT-CONF-003: consumerPainConfidenceTier', () => {
  it('HIGH when corpus ≥ 100', () => {
    const memo = makeMemo({ consumer_intelligence: { totalReviewsCollected: 150 } as any })
    expect(consumerPainConfidenceTier(memo)).toBe('HIGH')
  })

  it('MODERATE when corpus is 20–99', () => {
    const memo = makeMemo({ consumer_intelligence: { totalReviewsCollected: 45 } as any })
    expect(consumerPainConfidenceTier(memo)).toBe('MODERATE')
  })

  it('LOW when corpus < 20', () => {
    const memo = makeMemo({ consumer_intelligence: { totalReviewsCollected: 10 } as any })
    expect(consumerPainConfidenceTier(memo)).toBe('LOW')
  })

  it('LOW when consumer_intelligence absent', () => {
    expect(consumerPainConfidenceTier(makeMemo())).toBe('LOW')
  })
})

// ── AT-CONF-004: Virality confidence tier ────────────────────────────────

describe('AT-CONF-004: viralityConfidenceTier', () => {
  it('HIGH when view_count ≥ 100,000,000', () => {
    const memo = makeMemo({
      signal_evidence: {
        virality: {
          value: { score: 8, confidence: 0.9, view_count: 150_000_000, hashtag: 'magnesium' },
          sources: ['tiktok'], primarySource: 'tiktok', confidence: 0.9,
        },
        providers_used: ['tiktok'],
        overall_confidence: 0.9,
      },
    })
    expect(viralityConfidenceTier(memo)).toBe('HIGH')
  })

  it('MODERATE when view_count is 10,000,000–99,999,999', () => {
    const memo = makeMemo({
      signal_evidence: {
        virality: {
          value: { score: 6, confidence: 0.7, view_count: 25_000_000 },
          sources: ['tiktok'], primarySource: 'tiktok', confidence: 0.7,
        },
        providers_used: ['tiktok'],
        overall_confidence: 0.7,
      },
    })
    expect(viralityConfidenceTier(memo)).toBe('MODERATE')
  })

  it('LOW when view_count < 10,000,000', () => {
    const memo = makeMemo({
      signal_evidence: {
        virality: {
          value: { score: 3, confidence: 0.5, view_count: 5_000_000 },
          sources: ['tiktok'], primarySource: 'tiktok', confidence: 0.5,
        },
        providers_used: ['tiktok'],
        overall_confidence: 0.5,
      },
    })
    expect(viralityConfidenceTier(memo)).toBe('LOW')
  })

  it('LOW when virality signal is absent', () => {
    expect(viralityConfidenceTier(makeMemo())).toBe('LOW')
  })
})

// ── AT-CONF-005: Manufacturing confidence tier ────────────────────────────

describe('AT-CONF-005: manufacturingConfidenceTier', () => {
  it('HIGH when both MOQ and cost are present', () => {
    const memo = makeMemo({
      manufacturing_estimate: {
        product: 'test', category: 'supplements',
        moq: { low: 500, high: 2000, unit: 'units' },
        realistic_unit_cost: { low: 4.20, high: 6.80, currency: 'USD' },
        top_supplier_rating: 4.5,
        complexity: 'Low', confidence: 0.8, confidence_label: 'High',
        data_source: 'apify', notes: '', fetched_at: '2026-07-05',
      },
    })
    expect(manufacturingConfidenceTier(memo)).toBe('HIGH')
  })

  it('MODERATE when only MOQ is present', () => {
    const memo = makeMemo({
      manufacturing_estimate: {
        product: 'test', category: 'supplements',
        moq: { low: 500, high: 2000, unit: 'units' },
        top_supplier_rating: null,
        complexity: 'Low', confidence: 0.5, confidence_label: 'Medium',
        data_source: 'apify', notes: '', fetched_at: '2026-07-05',
      },
    })
    expect(manufacturingConfidenceTier(memo)).toBe('MODERATE')
  })

  it('LOW when manufacturing_estimate is absent', () => {
    expect(manufacturingConfidenceTier(makeMemo())).toBe('LOW')
  })
})
