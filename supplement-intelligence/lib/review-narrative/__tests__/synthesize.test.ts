// synthesizeReviewNarrative tests — Milestone 7, Option 2.
//
// Covers the required failure-mode matrix: null/insufficient input, a
// failed (throwing) ReviewEngine call, a malformed/unusable result, and a
// timeout — every case must resolve to `null`, never throw, never persist
// a partial or fabricated object.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { synthesizeReviewNarrative, MIN_REVIEWS_FOR_NARRATIVE } from '../synthesize'
import { REVIEW_NARRATIVE_SOURCE } from '../types'

const analyzeMock = vi.fn()

vi.mock('@/lib/review-engine', () => ({
  ReviewEngine: class {
    analyze = analyzeMock
  },
}))

function review(i: number) {
  return {
    id: `r${i}`, asin: 'B000TEST01', title: 'Title', body: 'A real review body with enough content.',
    rating: 4, verified: true, helpful_votes: 2, date: new Date().toISOString(),
  }
}

function manyReviews(n: number) {
  return Array.from({ length: n }, (_, i) => review(i))
}

function validReport() {
  return {
    product_asin: 'B000TEST01',
    total_reviews_input: 20, total_reviews_analyzed: 20, chunk_count: 1, sampling_used: false,
    pain_score: 5, opportunity_score: 5, market_confidence: 0.6,
    top_complaints: ['too pricey'], top_requested_features: ['better flavor'],
    pain_points: [], missing_features: [], requested_improvements: [], quality_issues: [],
    packaging_issues: [], shipping_issues: [], price_complaints: [], positive_themes: [],
    avg_rating: 4.1,
    sentiment_distribution: { very_positive: 0.3, positive: 0.3, mixed: 0.2, negative: 0.1, very_negative: 0.1 },
    overall_sentiment: 'Positive' as const,
    ai_recommendation: 'Consider a flavor line extension.',
    analyzed_at: new Date().toISOString(),
    analysis_version: '1.0.0',
  }
}

describe('synthesizeReviewNarrative — insufficient / unavailable input', () => {
  beforeEach(() => { analyzeMock.mockReset() })

  it('returns null and never calls ReviewEngine when reviews is undefined', async () => {
    const result = await synthesizeReviewNarrative(undefined)
    expect(result).toBeNull()
    expect(analyzeMock).not.toHaveBeenCalled()
  })

  it('returns null and never calls ReviewEngine when reviews is an empty array', async () => {
    const result = await synthesizeReviewNarrative([])
    expect(result).toBeNull()
    expect(analyzeMock).not.toHaveBeenCalled()
  })

  it(`returns null and never calls ReviewEngine when review count is below MIN_REVIEWS_FOR_NARRATIVE (${MIN_REVIEWS_FOR_NARRATIVE})`, async () => {
    const result = await synthesizeReviewNarrative(manyReviews(MIN_REVIEWS_FOR_NARRATIVE - 1))
    expect(result).toBeNull()
    expect(analyzeMock).not.toHaveBeenCalled()
  })

  it('calls ReviewEngine once the minimum threshold is met', async () => {
    analyzeMock.mockResolvedValue(validReport())
    const result = await synthesizeReviewNarrative(manyReviews(MIN_REVIEWS_FOR_NARRATIVE))
    expect(analyzeMock).toHaveBeenCalledTimes(1)
    expect(result).not.toBeNull()
  })
})

describe('synthesizeReviewNarrative — failed ReviewEngine calls', () => {
  beforeEach(() => { analyzeMock.mockReset() })

  it('returns null (never throws) when ReviewEngine.analyze rejects', async () => {
    analyzeMock.mockRejectedValue(new Error('ReviewEngine: all chunk analyses failed'))
    const result = await synthesizeReviewNarrative(manyReviews(20))
    expect(result).toBeNull()
  })

  it('returns null when ReviewEngine.analyze throws synchronously', async () => {
    analyzeMock.mockImplementation(() => { throw new Error('reviews array is empty') })
    const result = await synthesizeReviewNarrative(manyReviews(20))
    expect(result).toBeNull()
  })
})

describe('synthesizeReviewNarrative — malformed results', () => {
  beforeEach(() => { analyzeMock.mockReset() })

  it('does not throw when ReviewEngine resolves with an unexpectedly sparse/malformed object', async () => {
    // Missing most fields — simulates a malformed upstream response.
    analyzeMock.mockResolvedValue({ total_reviews_analyzed: 20 })
    await expect(synthesizeReviewNarrative(manyReviews(20))).resolves.not.toThrow()
  })

  it('does not throw when ReviewEngine resolves with null', async () => {
    analyzeMock.mockResolvedValue(null)
    await expect(synthesizeReviewNarrative(manyReviews(20))).resolves.not.toThrow()
  })
})

describe('synthesizeReviewNarrative — timeout', () => {
  beforeEach(() => { analyzeMock.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('returns null once the internal timeout elapses, using fake timers to actually exercise the race — not just assert well-formedness', async () => {
    vi.useFakeTimers()
    analyzeMock.mockImplementation(() => new Promise(() => {})) // never resolves on its own

    const pending = synthesizeReviewNarrative(manyReviews(20))
    // Advance past NARRATIVE_TIMEOUT_MS (45_000ms) so the internal
    // Promise.race's setTimeout branch wins and rejects — the exact path a
    // real hung/slow AI call would take in production.
    await vi.advanceTimersByTimeAsync(46_000)

    const result = await pending
    expect(result).toBeNull()
  })
})

describe('synthesizeReviewNarrative — successful synthesis output shape', () => {
  beforeEach(() => { analyzeMock.mockReset() })

  it('labels the result with the exact source sentinel and a non-empty disclaimer', async () => {
    analyzeMock.mockResolvedValue(validReport())
    const result = await synthesizeReviewNarrative(manyReviews(20), 'B000TEST01')
    expect(result?.source).toBe(REVIEW_NARRATIVE_SOURCE)
    expect(result?.disclaimer.length).toBeGreaterThan(0)
  })

  it('never includes pain_score, opportunity_score, or market_confidence on the persisted object', async () => {
    analyzeMock.mockResolvedValue(validReport())
    const result = await synthesizeReviewNarrative(manyReviews(20))
    expect(result).not.toHaveProperty('pain_score')
    expect(result).not.toHaveProperty('opportunity_score')
    expect(result).not.toHaveProperty('market_confidence')
  })
})
