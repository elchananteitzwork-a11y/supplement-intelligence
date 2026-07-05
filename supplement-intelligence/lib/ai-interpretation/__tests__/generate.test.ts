// Generate integration tests using a mocked Anthropic client:
//   AT-VAL-001: Validation pipeline blocks hallucination (first call fails, retry passes)
//   AT-VAL-002: Fallback used after two failures (AT-VAL-002: exactly two AI attempts, fallback on second)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateInterpretation } from '../writer/generate'
import type { SynthesisInput } from '../types'
import type Anthropic from '@anthropic-ai/sdk'

// ── SynthesisInput fixture ────────────────────────────────────────────────

const BASE_INPUT: SynthesisInput = {
  query:    'magnesium glycinate sleep',
  category: 'Magnesium Supplements',
  analysis_date: '2026-07-05',

  verdict:            'VALIDATION_REQUIRED',
  verdict_confidence: 'MODERATE',
  overall_score:      54,

  signals: [
    { id: 'demand', display_label: 'Demand', score: 6.2, confidence: 'MODERATE', headline: 'Moderate demand', supporting_stat: '28,400/mo' },
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
    top_3_keywords: [{ keyword: 'magnesium glycinate sleep', volume: 28_400 }],
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

// ── Good AI responses (pass validation) ──────────────────────────────────

const GOOD_CAUSAL = 'Magnesium glycinate sleep shows moderate consumer search demand, with 28,400 monthly searches recorded across keyword platforms and a growing trend across the analysis period. Category products are priced between $22 and $38, with a median of $29. The competitive landscape has 12 established competitors with an average of 3,200 reviews each, and shows moderate review concentration with a concentration ratio of 0.52. Customer research indicates that 28% of reviewed buyers cite sleep quality issues as a primary concern. A review moat score of 2.8 reflects moderate incumbent advantage, signaling meaningful but not insurmountable barriers for new entrants.'

const GOOD_RISK = 'Incumbent review accumulation is the primary concern: incumbents have an average of 3,200 reviews per product, representing a significant barrier to new market entry.'

const GOOD_THESIS = JSON.stringify({
  headline: 'A differentiated magnesium sleep product directly addressing sleep quality issues from reviews.',
  full_thesis: 'The primary product opportunity is a magnesium glycinate formulation that directly resolves sleep quality issues, cited in 28% of customer reviews. Leading incumbent Pure Encapsulations holds 8,400 reviews at $34.99, indicating price anchoring and review moat dynamics. Manufacturing data indicates unit costs of $4.20–$6.80 at accessible MOQ levels, making the economics viable at the $29 median price point. With a review concentration ratio of 0.52, the distributed review base suggests room for a new entrant with strong product evidence and targeted positioning strategy.',
})

// ── Hallucination response (fails step 3) ────────────────────────────────

const HALLUCINATED_CAUSAL = 'This product is likely to succeed in the market with a $5M revenue opportunity over time due to growing demand patterns across platforms.'

// ── Anthropic client mock factory ─────────────────────────────────────────
// Routes by max_tokens so parallel calls get the right response regardless of order:
//   max_tokens 400 → Call A (causal paragraph)
//   max_tokens 100 → Call B (risk sentence)
//   max_tokens 600 → Call C (product thesis)

interface MockResponses {
  callA: string[]   // responses for each attempt (index 0 = attempt 1, index 1 = retry)
  callB: string[]
  callC: string[]
}

function makeClient(responses: MockResponses): Anthropic {
  const counters: Record<number, number> = { 400: 0, 100: 0, 600: 0 }
  const mock = {
    messages: {
      create: vi.fn().mockImplementation(async (params: { max_tokens: number }) => {
        const maxTok = params.max_tokens
        const callResponses = maxTok === 400 ? responses.callA
                            : maxTok === 100 ? responses.callB
                            : responses.callC
        const idx = counters[maxTok] ?? 0
        counters[maxTok] = idx + 1
        const text = callResponses[idx] ?? callResponses[callResponses.length - 1]
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }
      }),
    },
  }
  return mock as unknown as Anthropic
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('generateInterpretation', () => {
  describe('AT-VAL-001: Validation pipeline blocks hallucinations', () => {
    it('accepts clean AI output on first attempt (no fallback)', async () => {
      const client = makeClient({
        callA: [GOOD_CAUSAL],
        callB: [GOOD_RISK],
        callC: [GOOD_THESIS],
      })

      const result = await generateInterpretation(client, BASE_INPUT)

      expect(result.causal_paragraph_is_fallback).toBe(false)
      expect(result.risk_sentence_is_fallback).toBe(false)
      expect(result.product_thesis_is_fallback).toBe(false)

      expect(result.validation_trace.call_a.attempt_count).toBe(1)
      expect(result.validation_trace.call_b.attempt_count).toBe(1)
      expect(result.validation_trace.call_c.attempt_count).toBe(1)
    })

    it('rejects hallucinated causal output and retries', async () => {
      // Call A: hallucination on attempt 1, good output on attempt 2
      // Calls B and C: good on attempt 1
      const client = makeClient({
        callA: [HALLUCINATED_CAUSAL, GOOD_CAUSAL],  // attempt 1 fails, retry passes
        callB: [GOOD_RISK],
        callC: [GOOD_THESIS],
      })

      const result = await generateInterpretation(client, BASE_INPUT)

      expect(result.causal_paragraph).toBe(GOOD_CAUSAL)
      expect(result.causal_paragraph_is_fallback).toBe(false)
      // Two attempts were needed — trace reflects the final (successful) attempt
      expect(result.validation_trace.call_a.attempt_count).toBe(2)
      expect(result.validation_trace.call_a.used_fallback).toBe(false)
      // The final attempt passed all validation steps
      expect(result.validation_trace.call_a.step3_patterns.passed).toBe(true)
    })
  })

  describe('AT-VAL-002: Fallback after two failures', () => {
    it('uses fallback when both attempts fail validation', async () => {
      const client = makeClient({
        callA: [HALLUCINATED_CAUSAL, HALLUCINATED_CAUSAL],  // both attempts fail
        callB: [GOOD_RISK],
        callC: [GOOD_THESIS],
      })

      const result = await generateInterpretation(client, BASE_INPUT)

      expect(result.causal_paragraph_is_fallback).toBe(true)
      expect(result.validation_trace.call_a.attempt_count).toBe(2)
      expect(result.validation_trace.call_a.used_fallback).toBe(true)

      expect(result.risk_sentence_is_fallback).toBe(false)
      expect(result.product_thesis_is_fallback).toBe(false)

      expect(result.causal_paragraph.trim().length).toBeGreaterThan(0)
    })

    it('uses fallback for call C when JSON cannot be parsed on both attempts', async () => {
      const client = makeClient({
        callA: [GOOD_CAUSAL],
        callB: [GOOD_RISK],
        callC: ['not json', 'still bad'],  // both parse as invalid
      })

      const result = await generateInterpretation(client, BASE_INPUT)

      expect(result.product_thesis_is_fallback).toBe(true)
      expect(result.validation_trace.call_c.used_fallback).toBe(true)
      expect(result.validation_trace.call_c.attempt_count).toBe(2)

      expect(result.product_thesis_headline.trim().length).toBeGreaterThan(0)
      expect(result.product_thesis_full.trim().length).toBeGreaterThan(0)
    })
  })

  describe('schema validation (step 1)', () => {
    it('throws on invalid SynthesisInput', async () => {
      const client = makeClient({ callA: [GOOD_CAUSAL], callB: [GOOD_RISK], callC: [GOOD_THESIS] })
      const badInput = { ...BASE_INPUT, query: '' }

      await expect(
        generateInterpretation(client, badInput as SynthesisInput),
      ).rejects.toThrow('SynthesisInput validation failed')
    })
  })

  describe('WriterOutput shape', () => {
    it('returns all required fields', async () => {
      const client = makeClient({
        callA: [GOOD_CAUSAL],
        callB: [GOOD_RISK],
        callC: [GOOD_THESIS],
      })

      const result = await generateInterpretation(client, BASE_INPUT)

      expect(result).toHaveProperty('causal_paragraph')
      expect(result).toHaveProperty('causal_paragraph_is_fallback')
      expect(result).toHaveProperty('risk_sentence')
      expect(result).toHaveProperty('risk_sentence_is_fallback')
      expect(result).toHaveProperty('product_thesis_headline')
      expect(result).toHaveProperty('product_thesis_full')
      expect(result).toHaveProperty('product_thesis_is_fallback')
      expect(result).toHaveProperty('validation_trace')
      expect(result.validation_trace).toHaveProperty('step1_schema')
      expect(result.validation_trace).toHaveProperty('call_a')
      expect(result.validation_trace).toHaveProperty('call_b')
      expect(result.validation_trace).toHaveProperty('call_c')
      expect(result.validation_trace).toHaveProperty('step6_final')
    })

    it('validation_trace.step1_schema.passed is true for valid input', async () => {
      const client = makeClient({
        callA: [GOOD_CAUSAL],
        callB: [GOOD_RISK],
        callC: [GOOD_THESIS],
      })

      const result = await generateInterpretation(client, BASE_INPUT)
      expect(result.validation_trace.step1_schema.passed).toBe(true)
    })
  })
})
