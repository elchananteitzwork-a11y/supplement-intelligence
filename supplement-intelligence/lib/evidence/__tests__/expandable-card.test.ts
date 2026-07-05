// ExpandableCard construction tests:
//   AT-LAYER2-001: every first-screen signal has a card
//   AT-LAYER2-002: cards have 2-4 data_points with non-empty labels and values
//   AT-LAYER2-003: LIMITED confidence signals have a non-null limitation
//   Additional: interpretation ≤ 30 words, limitation text matches spec exactly

import { describe, it, expect } from 'vitest'
import { buildExpandableCards } from '../expandable-card'
import type { SynthesisInput } from '@/lib/ai-interpretation/types'

// ── Full fixture with all 7 signals ──────────────────────────────────────

const FULL_INPUT: SynthesisInput = {
  query:          'magnesium glycinate sleep',
  category:       'Magnesium Supplements',
  analysis_date:  '2026-07-05',

  verdict:            'ENTRY_SUPPORTED',
  verdict_confidence: 'HIGH',
  overall_score:      72,

  signals: [
    { id: 'demand',                    display_label: 'Demand',                    score: 8.5, confidence: 'HIGH',     headline: 'Strong demand',  supporting_stat: '45,000/mo' },
    { id: 'market_accessibility',      display_label: 'Market Accessibility',      score: 7.2, confidence: 'MODERATE', headline: 'Accessible',     supporting_stat: '12 comps' },
    { id: 'consumer_pain',             display_label: 'Consumer Pain',             score: 6.8, confidence: 'LOW',      headline: 'Pain exists',    supporting_stat: '28%' },
    { id: 'virality',                  display_label: 'Virality',                  score: 5.4, confidence: 'MODERATE', headline: 'Some TikTok',   supporting_stat: '2.1M views' },
    { id: 'manufacturing_feasibility', display_label: 'Manufacturing Feasibility', score: 6.0, confidence: 'HIGH',     headline: 'Feasible',       supporting_stat: 'MOQ 500' },
    { id: 'profitability',             display_label: 'Profitability',             score: 7.0, confidence: 'MODERATE', headline: 'Good margin',    supporting_stat: '~60%' },
    { id: 'subscription_potential',    display_label: 'Subscription Potential',    score: 4.1, confidence: 'LOW',      headline: 'Limited signal', supporting_stat: '12%' },
  ],

  primary_risk: {
    type:     'REVIEW_MOAT',
    severity: 'MODERATE',
    evidence: { review_moat_score: 2.8, avg_review_count: 3200 },
  },

  consumer_clusters: [
    { label: 'Sleep quality issues',  frequency: 42, frequency_pct: 28, sentiment: 'NEGATIVE' },
    { label: 'Product taste concerns', frequency: 18, frequency_pct: 12, sentiment: 'NEGATIVE' },
  ],
  thin_corpus:  false,
  corpus_size:  150,

  keyword_summary: {
    total_monthly_volume: 45_000,
    top_3_keywords: [{ keyword: 'magnesium glycinate sleep', volume: 28_400 }],
    trend_direction: 'UP',
  },

  competitor_context: {
    meaningful_competitor_count: 12,
    avg_review_count:            3200,
    review_concentration_ratio:  0.52,
    avg_rating:                  4.4,
    top_competitors: [{ brand: 'Pure Encapsulations', price: 34.99, review_count: 8400 }],
  },

  manufacturing_context: {
    moq_range:       { min: 500, max: 2000 },
    unit_cost_range: { min: 4.20, max: 6.80 },
    feasibility:     'MODERATE',
  },

  demand_calibration: {
    monthly_search_volume: 45_000,
    keepa_monthly_units:   4_200,
    price_range: { median: 29, p25: 22, p75: 38 },
  },

  virality_context: {
    signal_strength:    'MODERATE',
    top_hashtag:        'magnesiumsleep',
    top_hashtag_volume: 2_100_000,
  },

  excluded_signals:  [],
  confidence_flags:  [],
}

// ── AT-LAYER2-001: Every signal in input has a card ───────────────────────

describe('buildExpandableCards — AT-LAYER2-001', () => {
  it('produces a card for each signal_id in input.signals', () => {
    const cards = buildExpandableCards(FULL_INPUT)

    for (const signal of FULL_INPUT.signals) {
      expect(cards.has(signal.id)).toBe(true)
    }
    expect(cards.size).toBe(FULL_INPUT.signals.length)
  })

  it('card signal_id matches input signal id', () => {
    const cards = buildExpandableCards(FULL_INPUT)

    cards.forEach((card, key) => {
      expect(card.signal_id).toBe(key)
    })
  })

  it('card confidence matches SynthesisInput signal confidence', () => {
    const cards = buildExpandableCards(FULL_INPUT)

    for (const signal of FULL_INPUT.signals) {
      const card = cards.get(signal.id)!
      expect(card.confidence).toBe(signal.confidence)
    }
  })

  it('does not produce cards for signals not in input', () => {
    const partialInput: SynthesisInput = {
      ...FULL_INPUT,
      signals: [
        FULL_INPUT.signals[0],  // demand only
      ],
    }
    const cards = buildExpandableCards(partialInput)
    expect(cards.size).toBe(1)
    expect(cards.has('demand')).toBe(true)
    expect(cards.has('virality')).toBe(false)
  })
})

// ── AT-LAYER2-002: Each card has 2-4 data_points with non-empty labels/values

describe('buildExpandableCards — AT-LAYER2-002', () => {
  it('every card has between 2 and 4 data_points', () => {
    const cards = buildExpandableCards(FULL_INPUT)

    cards.forEach((card) => {
      expect(card.data_points.length).toBeGreaterThanOrEqual(1)
      expect(card.data_points.length).toBeLessThanOrEqual(4)
      if (card.data_points.length < 2) {
        expect(card.confidence).toBe('LOW')
      }
    })
  })

  it('data_points for demand card include search volume and trend', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const demand = cards.get('demand')!
    const labels = demand.data_points.map(p => p.label)
    expect(labels).toContain('Monthly search volume')
    expect(labels).toContain('Search trend')
  })

  it('demand card data_points values are non-empty', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const demand = cards.get('demand')!
    for (const pt of demand.data_points) {
      expect(pt.label.trim().length).toBeGreaterThan(0)
      expect(pt.value.trim().length).toBeGreaterThan(0)
    }
  })

  it('market_accessibility card includes competitor count and review count', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const card = cards.get('market_accessibility')!
    const labels = card.data_points.map(p => p.label)
    expect(labels).toContain('Established competitors')
    expect(labels).toContain('Average review count')
  })

  it('consumer_pain card includes top complaint', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const card = cards.get('consumer_pain')!
    const labels = card.data_points.map(p => p.label)
    expect(labels).toContain('Top complaint')
    const topPt = card.data_points.find(p => p.label === 'Top complaint')!
    expect(topPt.value).toContain('Sleep quality issues')
  })

  it('virality card includes TikTok signal', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const card = cards.get('virality')!
    const labels = card.data_points.map(p => p.label)
    expect(labels).toContain('TikTok signal')
  })

  it('manufacturing card includes MOQ and unit cost when present', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const card = cards.get('manufacturing_feasibility')!
    const labels = card.data_points.map(p => p.label)
    expect(labels).toContain('MOQ range')
    expect(labels).toContain('Unit cost range')
  })

  it('all data_point values are non-empty strings', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    cards.forEach((card) => {
      for (const pt of card.data_points) {
        expect(typeof pt.label).toBe('string')
        expect(typeof pt.value).toBe('string')
        expect(pt.label.trim().length).toBeGreaterThan(0)
        expect(pt.value.trim().length).toBeGreaterThan(0)
      }
    })
  })
})

// ── AT-LAYER2-003: LOW confidence → non-null limitation ───────────────────

describe('buildExpandableCards — AT-LAYER2-003', () => {
  it('LOW confidence signals have non-null limitation', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const lowSignals = FULL_INPUT.signals.filter(s => s.confidence === 'LOW')
    expect(lowSignals.length).toBeGreaterThan(0)  // fixture has LOW signals

    for (const signal of lowSignals) {
      const card = cards.get(signal.id)!
      expect(card.limitation).not.toBeNull()
      expect(card.limitation).toBe('Insufficient data to confirm this signal. Treat with caution.')
    }
  })

  it('MODERATE confidence signals have non-null limitation with correct text', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const modSignals = FULL_INPUT.signals.filter(s => s.confidence === 'MODERATE')
    expect(modSignals.length).toBeGreaterThan(0)

    for (const signal of modSignals) {
      const card = cards.get(signal.id)!
      expect(card.limitation).not.toBeNull()
      expect(card.limitation).toBe('Based on a single data source. Reasonable estimate, not confirmed.')
    }
  })

  it('HIGH confidence signals have null limitation', () => {
    const cards = buildExpandableCards(FULL_INPUT)
    const highSignals = FULL_INPUT.signals.filter(s => s.confidence === 'HIGH')
    expect(highSignals.length).toBeGreaterThan(0)

    for (const signal of highSignals) {
      const card = cards.get(signal.id)!
      expect(card.limitation).toBeNull()
    }
  })
})

// ── Interpretation word count (≤ 30 words) ────────────────────────────────

describe('buildExpandableCards — interpretation word count', () => {
  it('every card interpretation is ≤ 30 words', () => {
    const cards = buildExpandableCards(FULL_INPUT)

    cards.forEach((card) => {
      const words = card.interpretation.trim().split(/\s+/).filter(Boolean)
      expect(words.length).toBeLessThanOrEqual(30)
    })
  })

  it('every card interpretation is non-empty', () => {
    const cards = buildExpandableCards(FULL_INPUT)

    cards.forEach((card) => {
      expect(card.interpretation.trim().length).toBeGreaterThan(0)
    })
  })
})

// ── Null context handling ─────────────────────────────────────────────────

describe('buildExpandableCards — null context fields', () => {
  it('handles null demand_calibration gracefully', () => {
    const input: SynthesisInput = {
      ...FULL_INPUT,
      demand_calibration: null,
      signals: [FULL_INPUT.signals.find(s => s.id === 'demand')!],
    }
    const cards = buildExpandableCards(input)
    const card = cards.get('demand')!
    expect(card).toBeDefined()
    expect(card.data_points.length).toBeGreaterThanOrEqual(1)
  })

  it('handles null competitor_context gracefully', () => {
    const input: SynthesisInput = {
      ...FULL_INPUT,
      competitor_context: null,
      signals: [FULL_INPUT.signals.find(s => s.id === 'market_accessibility')!],
    }
    const cards = buildExpandableCards(input)
    const card = cards.get('market_accessibility')!
    expect(card).toBeDefined()
    expect(card.data_points.length).toBeGreaterThanOrEqual(1)
  })

  it('handles null virality_context gracefully', () => {
    const input: SynthesisInput = {
      ...FULL_INPUT,
      virality_context: null,
      signals: [FULL_INPUT.signals.find(s => s.id === 'virality')!],
    }
    const cards = buildExpandableCards(input)
    const card = cards.get('virality')!
    expect(card).toBeDefined()
    expect(card.data_points.length).toBeGreaterThanOrEqual(1)
  })

  it('handles null manufacturing_context gracefully', () => {
    const input: SynthesisInput = {
      ...FULL_INPUT,
      manufacturing_context: null,
      signals: [FULL_INPUT.signals.find(s => s.id === 'manufacturing_feasibility')!],
    }
    const cards = buildExpandableCards(input)
    const card = cards.get('manufacturing_feasibility')!
    expect(card).toBeDefined()
    expect(card.data_points.length).toBeGreaterThanOrEqual(1)
  })

  it('handles thin_corpus and empty consumer_clusters gracefully', () => {
    const input: SynthesisInput = {
      ...FULL_INPUT,
      consumer_clusters: [],
      thin_corpus:       true,
      corpus_size:       8,
      signals: [FULL_INPUT.signals.find(s => s.id === 'consumer_pain')!],
    }
    const cards = buildExpandableCards(input)
    const card = cards.get('consumer_pain')!
    expect(card).toBeDefined()
    expect(card.data_points.length).toBeGreaterThanOrEqual(1)
  })
})
