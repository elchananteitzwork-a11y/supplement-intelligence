// AT-HALL-003: All three fallback functions produce non-empty, length-conforming output
// from any valid SynthesisInput, with no AI call required.

import { describe, it, expect } from 'vitest'
import { fallbackCausalParagraph, fallbackRiskSentence, fallbackProductThesis } from '../writer/fallbacks'
import type { SynthesisInput } from '../types'

// ── Shared fixture ────────────────────────────────────────────────────────

const BASE_INPUT: SynthesisInput = {
  query:    'magnesium glycinate sleep',
  category: 'Magnesium Supplements',
  analysis_date: '2026-07-05',

  verdict:            'VALIDATION_REQUIRED',
  verdict_confidence: 'MODERATE',
  overall_score:      54,

  signals: [
    { id: 'demand', display_label: 'Market Demand', score: 6.2, confidence: 'MODERATE', headline: 'Moderate demand', supporting_stat: '28,400/mo' },
    { id: 'market_accessibility', display_label: 'Market Access', score: 4.8, confidence: 'MODERATE', headline: 'Moderate competition', supporting_stat: '12 competitors' },
  ],

  primary_risk: {
    type:     'REVIEW_MOAT',
    severity: 'MODERATE',
    evidence: { review_moat_score: 2.8, avg_review_count: 3200 },
  },

  consumer_clusters: [
    { label: 'Sleep quality issues', frequency: 42, frequency_pct: 28, sentiment: 'NEGATIVE' },
    { label: 'Digestive tolerance', frequency: 31, frequency_pct: 20, sentiment: 'NEGATIVE' },
  ],
  thin_corpus:  false,
  corpus_size:  150,

  keyword_summary: {
    total_monthly_volume: 45_000,
    top_3_keywords: [
      { keyword: 'magnesium glycinate sleep', volume: 28_400 },
      { keyword: 'magnesium glycinate',       volume: 12_000 },
      { keyword: 'magnesium for sleep',        volume: 4_600 },
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

  virality_context: null,
  excluded_signals: [],
  confidence_flags: [],
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// ── AT-HALL-003: fallbackCausalParagraph ─────────────────────────────────

describe('fallbackCausalParagraph (AT-HALL-003)', () => {
  it('returns a non-empty string', () => {
    const result = fallbackCausalParagraph(BASE_INPUT)
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    expect(result.trim().length).toBeGreaterThan(0)
  })

  it('is within 60–160 words', () => {
    const result = fallbackCausalParagraph(BASE_INPUT)
    const wc = wordCount(result)
    expect(wc).toBeGreaterThanOrEqual(60)
    expect(wc).toBeLessThanOrEqual(160)
  })

  it('ends with sentence terminator', () => {
    const result = fallbackCausalParagraph(BASE_INPUT)
    expect(result.trim()).toMatch(/[.!?]$/)
  })

  it('includes query term', () => {
    const result = fallbackCausalParagraph(BASE_INPUT)
    expect(result.toLowerCase()).toContain('magnesium')
  })

  it('references a numeric value from demand_calibration', () => {
    const result = fallbackCausalParagraph(BASE_INPUT)
    // Should mention monthly search volume
    expect(result).toMatch(/28,400|4,200/)
  })

  it('works with thin corpus input', () => {
    const thin: SynthesisInput = {
      ...BASE_INPUT,
      thin_corpus:       true,
      corpus_size:       8,
      consumer_clusters: [],
    }
    const result = fallbackCausalParagraph(thin)
    expect(result.trim().length).toBeGreaterThan(0)
    const wc = wordCount(result)
    expect(wc).toBeLessThanOrEqual(160)
  })

  it('works when competitor_context is null', () => {
    const noComp: SynthesisInput = { ...BASE_INPUT, competitor_context: null }
    const result = fallbackCausalParagraph(noComp)
    expect(result.trim().length).toBeGreaterThan(0)
  })

  it('works when demand_calibration is null', () => {
    const noDemand: SynthesisInput = { ...BASE_INPUT, demand_calibration: null }
    const result = fallbackCausalParagraph(noDemand)
    expect(result.trim().length).toBeGreaterThan(0)
  })

  it('mentions UP trend when present', () => {
    const result = fallbackCausalParagraph(BASE_INPUT)
    expect(result.toLowerCase()).toContain('growing')
  })

  it('appends qualification sentence when confidence flag present', () => {
    const flagged: SynthesisInput = {
      ...BASE_INPUT,
      confidence_flags: [{ code: 'SINGLE_CHANNEL', message: 'Only one data channel' }],
    }
    const result = fallbackCausalParagraph(flagged)
    const wc = wordCount(result)
    expect(wc).toBeLessThanOrEqual(160)
    expect(result.toLowerCase()).toContain('single')
  })
})

// ── AT-HALL-003: fallbackRiskSentence ────────────────────────────────────

describe('fallbackRiskSentence (AT-HALL-003)', () => {
  it('returns a non-empty string', () => {
    const result = fallbackRiskSentence(BASE_INPUT)
    expect(result).toBeTruthy()
    expect(result.trim().length).toBeGreaterThan(0)
  })

  it('is 10–35 words', () => {
    const result = fallbackRiskSentence(BASE_INPUT)
    const wc = wordCount(result)
    expect(wc).toBeGreaterThanOrEqual(10)
    expect(wc).toBeLessThanOrEqual(35)
  })

  it('ends with a period', () => {
    const result = fallbackRiskSentence(BASE_INPUT)
    expect(result.trim()).toMatch(/\.$/)
  })

  it('mentions the risk type', () => {
    const result = fallbackRiskSentence(BASE_INPUT)
    // REVIEW_MOAT → 'Incumbent review accumulation'
    expect(result).toContain('Incumbent review accumulation')
  })

  it('references numeric evidence (avg_review_count)', () => {
    const result = fallbackRiskSentence(BASE_INPUT)
    expect(result).toContain('3,200')
  })

  it('hard-truncates at 35 words for long outputs', () => {
    const longEvidence: SynthesisInput = {
      ...BASE_INPUT,
      primary_risk: {
        type:     'MARKET_SATURATION',
        severity: 'HIGH',
        evidence: { meaningful_competitor_count: 25 },
      },
    }
    const result = fallbackRiskSentence(longEvidence)
    expect(wordCount(result)).toBeLessThanOrEqual(35)
    expect(result.trim()).toMatch(/\.$/)
  })

  it('works for all 10 risk types without throwing', () => {
    const riskTypes: SynthesisInput['primary_risk']['type'][] = [
      'REVIEW_MOAT', 'MARKET_SATURATION', 'DEMAND_UNCERTAINTY', 'COST_STRUCTURE',
      'THIN_CONSUMER_DATA', 'COMPETITOR_FORMULA_PARITY', 'SEASONALITY',
      'DEMAND_CONCENTRATION', 'VIRALITY_ABSENCE', 'CATEGORY_ACCESSIBILITY',
    ]
    for (const type of riskTypes) {
      const input: SynthesisInput = {
        ...BASE_INPUT,
        primary_risk: { type, severity: 'MODERATE', evidence: {} },
      }
      const result = fallbackRiskSentence(input)
      expect(result.trim().length).toBeGreaterThan(0)
      expect(wordCount(result)).toBeLessThanOrEqual(35)
      expect(result.trim()).toMatch(/\.$/)
    }
  })
})

// ── AT-HALL-003: fallbackProductThesis ───────────────────────────────────

describe('fallbackProductThesis (AT-HALL-003)', () => {
  it('returns an object with headline and full_thesis', () => {
    const result = fallbackProductThesis(BASE_INPUT)
    expect(result).toHaveProperty('headline')
    expect(result).toHaveProperty('full_thesis')
    expect(typeof result.headline).toBe('string')
    expect(typeof result.full_thesis).toBe('string')
  })

  it('headline is 8–25 words', () => {
    const result = fallbackProductThesis(BASE_INPUT)
    const wc = wordCount(result.headline)
    expect(wc).toBeGreaterThanOrEqual(8)
    expect(wc).toBeLessThanOrEqual(25)
  })

  it('full_thesis is 80–200 words', () => {
    const result = fallbackProductThesis(BASE_INPUT)
    const wc = wordCount(result.full_thesis)
    expect(wc).toBeGreaterThanOrEqual(80)
    expect(wc).toBeLessThanOrEqual(200)
  })

  it('full_thesis ends with sentence terminator', () => {
    const result = fallbackProductThesis(BASE_INPUT)
    expect(result.full_thesis.trim()).toMatch(/[.!?]$/)
  })

  it('headline mentions the query', () => {
    const result = fallbackProductThesis(BASE_INPUT)
    expect(result.headline.toLowerCase()).toContain('magnesium')
  })

  it('full_thesis contains at least one consumer_cluster label', () => {
    const result = fallbackProductThesis(BASE_INPUT)
    const text = result.full_thesis.toLowerCase()
    const hasLabel = BASE_INPUT.consumer_clusters.some(c =>
      text.includes(c.label.toLowerCase()),
    )
    expect(hasLabel).toBe(true)
  })

  it('references at least one competitor brand', () => {
    const result = fallbackProductThesis(BASE_INPUT)
    const text = `${result.headline} ${result.full_thesis}`
    expect(text).toContain('Pure Encapsulations')
  })

  it('works without consumer clusters', () => {
    const noCluster: SynthesisInput = { ...BASE_INPUT, consumer_clusters: [] }
    const result = fallbackProductThesis(noCluster)
    expect(result.headline.trim().length).toBeGreaterThan(0)
    expect(result.full_thesis.trim().length).toBeGreaterThan(0)
  })

  it('works without competitor context', () => {
    const noComp: SynthesisInput = { ...BASE_INPUT, competitor_context: null }
    const result = fallbackProductThesis(noComp)
    const wc = wordCount(result.full_thesis)
    expect(wc).toBeGreaterThanOrEqual(40)
    expect(wc).toBeLessThanOrEqual(200)
  })

  it('mentions manufacturing cost when available', () => {
    const result = fallbackProductThesis(BASE_INPUT)
    expect(result.full_thesis).toMatch(/\$4\.20|\$6\.80|\$4\.2|\$6\.8/)
  })
})
