// Output validator tests:
//   AT-HALL-001: Revenue figure regex fires correctly
//   AT-HALL-004: Probability language regex fires correctly
//   AT-HALL-005: Year reference outside analysis_date fires correctly
//   AT-VAL-004:  Causal paragraph must include a numeric value from SynthesisInput
//   AT-VAL-005:  Product thesis must include a consumer cluster label
//   AT-VAL-006:  Risk sentence must be one sentence (≤35 words, ends with period)

import { describe, it, expect } from 'vitest'
import {
  validateFormatCausalParagraph,
  validateFormatRiskSentence,
  validateFormatProductThesis,
  detectHallucinationPatterns,
  checkCausalParagraphGrounding,
  checkRiskSentenceGrounding,
  checkProductThesisGrounding,
  parseCallCJson,
} from '../writer/output-validator'
import type { SynthesisInput } from '../types'
import type { CallCOutput } from '../writer/types'

// ── Fixture ───────────────────────────────────────────────────────────────

const ANALYSIS_DATE = '2026-07-05'

const BASE_INPUT: SynthesisInput = {
  query:    'magnesium glycinate sleep',
  category: 'Magnesium Supplements',
  analysis_date: ANALYSIS_DATE,

  verdict:            'VALIDATION_REQUIRED',
  verdict_confidence: 'MODERATE',
  overall_score:      54,

  signals: [
    { id: 'demand', display_label: 'Demand', score: 6.2, confidence: 'MODERATE', headline: 'Moderate', supporting_stat: '28,400/mo' },
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
    ],
  },

  manufacturing_context: null,
  demand_calibration: {
    monthly_search_volume: 28_400,
    keepa_monthly_units:   4_200,
    price_range: { median: 29, p25: 22, p75: 38 },
  },
  virality_context: null,
  excluded_signals: [],
  confidence_flags: [],
}

// A valid causal paragraph for baseline tests — must be 60–160 words
const VALID_CAUSAL = 'Magnesium glycinate sleep shows moderate consumer search demand, with 28,400 monthly searches recorded across keyword platforms, with growing search momentum across the analysis period. Category products are priced between $22 and $38, with a median of $29. The competitive landscape has 12 established competitors with an average of 3,200 reviews each, and shows moderate review concentration with a concentration ratio of 0.52. Customer research indicates that 28% of reviewed buyers cite sleep quality issues as a primary concern driving purchase decisions. A review moat score of 2.8 reflects moderate incumbent advantage, signaling meaningful but not insurmountable barriers for new entrants seeking to position in this category.'

// A valid risk sentence
const VALID_RISK = 'Incumbent review accumulation is the primary concern: incumbents have an average of 3,200 reviews per product, which represents a barrier to entry.'

// ── validateFormatCausalParagraph ─────────────────────────────────────────

describe('validateFormatCausalParagraph', () => {
  it('passes valid causal paragraph', () => {
    const r = validateFormatCausalParagraph(VALID_CAUSAL)
    expect(r.passed).toBe(true)
  })

  it('fails on empty string', () => {
    const r = validateFormatCausalParagraph('')
    expect(r.passed).toBe(false)
    expect(r.error).toContain('empty')
  })

  it('fails when too short (< 60 words)', () => {
    const r = validateFormatCausalParagraph('This is a short output that does not meet the minimum word count requirement.')
    expect(r.passed).toBe(false)
    expect(r.error).toContain('Too short')
  })

  it('fails when too long (> 160 words)', () => {
    const long = Array(165).fill('word').join(' ') + '.'
    const r = validateFormatCausalParagraph(long)
    expect(r.passed).toBe(false)
    expect(r.error).toContain('Too long')
  })

  it('fails when does not end with sentence terminator', () => {
    const noEnd = VALID_CAUSAL.replace(/\.$/, '')
    const r = validateFormatCausalParagraph(noEnd)
    expect(r.passed).toBe(false)
    expect(r.error).toContain('terminator')
  })
})

// ── validateFormatRiskSentence (AT-VAL-006) ───────────────────────────────

describe('validateFormatRiskSentence (AT-VAL-006)', () => {
  it('passes valid risk sentence', () => {
    const r = validateFormatRiskSentence(VALID_RISK)
    expect(r.passed).toBe(true)
  })

  it('fails on empty string', () => {
    const r = validateFormatRiskSentence('')
    expect(r.passed).toBe(false)
  })

  it('fails when too short (< 10 words)', () => {
    const r = validateFormatRiskSentence('Risk exists here.')
    expect(r.passed).toBe(false)
    expect(r.error).toContain('Too short')
  })

  it('fails when too long (> 35 words)', () => {
    const long = Array(38).fill('word').join(' ') + '.'
    const r = validateFormatRiskSentence(long)
    expect(r.passed).toBe(false)
    expect(r.error).toContain('Too long')
  })

  it('fails when does not end with period', () => {
    const noEnd = VALID_RISK.replace(/\.$/, '!')
    const r = validateFormatRiskSentence(noEnd)
    expect(r.passed).toBe(false)
    expect(r.error).toContain('period')
  })
})

// ── validateFormatProductThesis ───────────────────────────────────────────

describe('validateFormatProductThesis', () => {
  const VALID_THESIS: CallCOutput = {
    headline:   'A differentiated magnesium glycinate sleep product addressing sleep quality issues.',
    full_thesis: Array(90).fill('word').join(' ') + '.',
  }

  it('passes valid thesis output', () => {
    const r = validateFormatProductThesis(VALID_THESIS)
    expect(r.passed).toBe(true)
  })

  it('fails when headline is empty', () => {
    const r = validateFormatProductThesis({ headline: '', full_thesis: VALID_THESIS.full_thesis })
    expect(r.passed).toBe(false)
    expect(r.error).toContain('headline')
  })

  it('fails when full_thesis is empty', () => {
    const r = validateFormatProductThesis({ headline: VALID_THESIS.headline, full_thesis: '' })
    expect(r.passed).toBe(false)
    expect(r.error).toContain('full_thesis')
  })

  it('fails when headline is too short (< 8 words)', () => {
    const r = validateFormatProductThesis({ headline: 'Too short headline.', full_thesis: VALID_THESIS.full_thesis })
    expect(r.passed).toBe(false)
    expect(r.error).toContain('headline too short')
  })

  it('fails when headline is too long (> 25 words)', () => {
    const r = validateFormatProductThesis({
      headline: Array(28).fill('word').join(' '),
      full_thesis: VALID_THESIS.full_thesis,
    })
    expect(r.passed).toBe(false)
    expect(r.error).toContain('headline too long')
  })

  it('fails when full_thesis is too short (< 80 words)', () => {
    const r = validateFormatProductThesis({ headline: VALID_THESIS.headline, full_thesis: 'Short thesis.' })
    expect(r.passed).toBe(false)
    expect(r.error).toContain('full_thesis too short')
  })

  it('fails when full_thesis is too long (> 200 words)', () => {
    const r = validateFormatProductThesis({
      headline:    VALID_THESIS.headline,
      full_thesis: Array(210).fill('word').join(' ') + '.',
    })
    expect(r.passed).toBe(false)
    expect(r.error).toContain('full_thesis too long')
  })
})

// ── AT-HALL-001: Revenue figure detection ────────────────────────────────

describe('detectHallucinationPatterns — AT-HALL-001 (revenue figures)', () => {
  it('detects dollar revenue figure', () => {
    const r = detectHallucinationPatterns('This market generates $2M in annual revenue.', BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.pattern).toContain('revenue_figure')
  })

  it('detects dollar with billion suffix', () => {
    const r = detectHallucinationPatterns('The market is worth $1.5 billion.', BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.pattern).toContain('revenue_figure')
  })

  it('passes when no revenue figure present', () => {
    const r = detectHallucinationPatterns(VALID_CAUSAL, BASE_INPUT)
    expect(r.passed).toBe(true)
  })

  it('passes price reference (no currency unit suffix)', () => {
    // Prices like "$29" are valid — they match the revenue regex only if followed by M/B/k/etc.
    // Plain prices are allowed (the spec only blocks revenue projections, not price references)
    const r = detectHallucinationPatterns('The median price is $29 per unit.', BASE_INPUT)
    expect(r.passed).toBe(true)
  })
})

// ── AT-HALL-004: Probability language detection ───────────────────────────

describe('detectHallucinationPatterns — AT-HALL-004 (probability language)', () => {
  it('detects "likely to succeed"', () => {
    const r = detectHallucinationPatterns('This product is likely to succeed in the market.', BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.pattern).toContain('probability_language')
  })

  it('detects "will probably"', () => {
    const r = detectHallucinationPatterns('Sales will probably increase over the next year.', BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.pattern).toContain('probability_language')
  })

  it('detects "projected to"', () => {
    const r = detectHallucinationPatterns('The market is projected to grow rapidly.', BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.pattern).toContain('probability_language')
  })

  it('passes factual language', () => {
    const r = detectHallucinationPatterns('Demand data indicates 28,400 monthly searches.', BASE_INPUT)
    expect(r.passed).toBe(true)
  })
})

// ── AT-HALL-005: Year reference outside analysis year ─────────────────────

describe('detectHallucinationPatterns — AT-HALL-005 (year references)', () => {
  it('detects year that is not analysis year', () => {
    const r = detectHallucinationPatterns('Sales grew significantly in 2023.', BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.pattern).toContain('year_reference')
  })

  it('passes the analysis year', () => {
    const r = detectHallucinationPatterns('This analysis was conducted in 2026.', BASE_INPUT)
    expect(r.passed).toBe(true)
  })

  it('passes text with no year reference', () => {
    const r = detectHallucinationPatterns(VALID_CAUSAL, BASE_INPUT)
    expect(r.passed).toBe(true)
  })
})

// ── Provider name detection ───────────────────────────────────────────────

describe('detectHallucinationPatterns — provider_name', () => {
  it('detects DataForSEO', () => {
    const r = detectHallucinationPatterns('Data sourced from DataForSEO search volume.', BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.pattern).toContain('provider_name')
  })

  it('detects Keepa', () => {
    const r = detectHallucinationPatterns('Sales data comes from Keepa.', BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.pattern).toContain('provider_name')
  })
})

// ── AT-VAL-004: Causal paragraph grounding ───────────────────────────────

describe('checkCausalParagraphGrounding (AT-VAL-004)', () => {
  it('passes when output contains a number from input', () => {
    const r = checkCausalParagraphGrounding(VALID_CAUSAL, BASE_INPUT)
    expect(r.passed).toBe(true)
  })

  it('fails when output contains no numbers from input', () => {
    const noNumbers = 'This market shows moderate demand signals with reasonable competition and acceptable consumer interest patterns emerging over time.'
    const r = checkCausalParagraphGrounding(noNumbers, BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.error).toContain('numeric value')
  })

  it('passes vacuously when input has no numeric values', () => {
    const noNumInput: SynthesisInput = {
      ...BASE_INPUT,
      signals:            [],
      consumer_clusters:  [],
      competitor_context: null,
      demand_calibration: null,
      keyword_summary:    null,
      corpus_size:        0,
    }
    const r = checkCausalParagraphGrounding('This market shows limited signals.', noNumInput)
    expect(r.passed).toBe(true)
  })

  it('accepts comma-formatted numbers', () => {
    const withCommas = 'The category receives 28,400 monthly searches from consumers.'
    const r = checkCausalParagraphGrounding(withCommas, BASE_INPUT)
    expect(r.passed).toBe(true)
  })
})

// ── AT-VAL-005: Product thesis grounding (cluster label) ─────────────────

describe('checkProductThesisGrounding (AT-VAL-005)', () => {
  it('passes when thesis contains cluster label', () => {
    const output: CallCOutput = {
      headline:   'A differentiated product addressing Sleep quality issues.',
      full_thesis: 'The primary opportunity is to address Sleep quality issues, cited in 28% of reviews. ' + Array(70).fill('word').join(' ') + '.',
    }
    const r = checkProductThesisGrounding(output, BASE_INPUT)
    expect(r.passed).toBe(true)
  })

  it('fails when thesis contains no cluster label', () => {
    const output: CallCOutput = {
      headline:   'A differentiated product for the category.',
      full_thesis: 'The market opportunity exists across multiple dimensions without addressing any specific consumer complaint pattern that appears in existing customer reviews.',
    }
    const r = checkProductThesisGrounding(output, BASE_INPUT)
    expect(r.passed).toBe(false)
    expect(r.error).toContain('consumer_cluster.label')
  })

  it('passes vacuously when no consumer clusters', () => {
    const noCluster: SynthesisInput = { ...BASE_INPUT, consumer_clusters: [] }
    const output: CallCOutput = { headline: 'Any headline.', full_thesis: 'Any thesis content here.' }
    const r = checkProductThesisGrounding(output, noCluster)
    expect(r.passed).toBe(true)
  })
})

// ── Risk sentence grounding ───────────────────────────────────────────────

describe('checkRiskSentenceGrounding', () => {
  it('passes when risk sentence references numeric evidence', () => {
    const r = checkRiskSentenceGrounding(VALID_RISK, BASE_INPUT)
    expect(r.passed).toBe(true)
  })

  it('fails when risk sentence references no numeric evidence', () => {
    const text = 'The primary risk is review moat concentration in the incumbent landscape.'
    const r = checkRiskSentenceGrounding(text, BASE_INPUT)
    expect(r.passed).toBe(false)
  })
})

// ── parseCallCJson ────────────────────────────────────────────────────────

describe('parseCallCJson', () => {
  it('parses valid JSON', () => {
    const raw = JSON.stringify({ headline: 'A headline.', full_thesis: 'A thesis.' })
    const r = parseCallCJson(raw)
    expect(r).toEqual({ headline: 'A headline.', full_thesis: 'A thesis.' })
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n{"headline":"H","full_thesis":"T"}\n```'
    const r = parseCallCJson(raw)
    expect(r).toEqual({ headline: 'H', full_thesis: 'T' })
  })

  it('returns null for invalid JSON', () => {
    const r = parseCallCJson('not json')
    expect(r).toBeNull()
  })

  it('returns null when required keys missing', () => {
    const r = parseCallCJson('{"headline":"H"}')
    expect(r).toBeNull()
  })
})
