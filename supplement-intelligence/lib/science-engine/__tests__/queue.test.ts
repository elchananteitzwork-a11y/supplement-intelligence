// Roadmap "Dynamic Science Coverage" (docs/RD_DYNAMIC_SCIENCE_COVERAGE.md) —
// shouldEnqueueScienceDemand is the only pure, dependency-free function in
// lib/science-engine/queue.ts; the rest (getUnfetchedQueueRows,
// getFetchedQueueRowsByDemand, markQueueRowFetched, getCacheExpiresAt) are
// thin Supabase read/write wrappers in the same style as
// lib/provider-cache/index.ts, which itself has no direct unit test in this
// codebase (its real consumers, e.g. lib/science-engine/pipeline.ts's own
// test suite, mock the module wholesale instead — same convention followed
// here for lib/science-engine/pipeline.test.ts's drainScienceIngredientQueue
// tests).

import { describe, it, expect } from 'vitest'
import { shouldEnqueueScienceDemand } from '../queue'
import { TRACKED_INGREDIENTS } from '../tracked-ingredients'

describe('shouldEnqueueScienceDemand', () => {
  it('is false when there is no vocabulary match at all', () => {
    expect(shouldEnqueueScienceDemand(null, false)).toBe(false)
  })

  it('is false for any of the 3 benchmark tracked ingredients — they already refresh nightly for free', () => {
    for (const tracked of TRACKED_INGREDIENTS) {
      expect(shouldEnqueueScienceDemand(tracked, false)).toBe(false)
    }
  })

  it('is false when a science signal is already present (not a real cache miss)', () => {
    expect(shouldEnqueueScienceDemand('ashwagandha', true)).toBe(false)
  })

  it('is true for a vocabulary-matched, non-tracked ingredient with no science signal yet', () => {
    expect(shouldEnqueueScienceDemand('ashwagandha', false)).toBe(true)
  })
})
