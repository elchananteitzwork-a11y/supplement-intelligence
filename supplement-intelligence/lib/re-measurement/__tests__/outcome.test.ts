import { describe, it, expect } from 'vitest'
import { computeOutcomeLabel } from '../outcome'
import { REVIEW_MOAT_MIN_REVIEWS } from '@/lib/scoring'

describe('computeOutcomeLabel', () => {
  it('meaningful_traction: real accelerating new-entrant activity + a real non-trivial review base', () => {
    expect(computeOutcomeLabel({ entryVelocity: 'Accelerating', avgReviewCountAtMeasurement: REVIEW_MOAT_MIN_REVIEWS })).toBe('meaningful_traction')
  })

  it('no_meaningful_traction: no real acceleration and no real review base', () => {
    expect(computeOutcomeLabel({ entryVelocity: 'Decelerating', avgReviewCountAtMeasurement: 2 })).toBe('no_meaningful_traction')
    expect(computeOutcomeLabel({ entryVelocity: 'Stable', avgReviewCountAtMeasurement: 0 })).toBe('no_meaningful_traction')
  })

  it('too_early_to_tell: mixed real signal (accelerating but no review base yet)', () => {
    expect(computeOutcomeLabel({ entryVelocity: 'Accelerating', avgReviewCountAtMeasurement: 2 })).toBe('too_early_to_tell')
  })

  it('too_early_to_tell: mixed real signal (stable/decelerating but already has a real review base)', () => {
    expect(computeOutcomeLabel({ entryVelocity: 'Stable', avgReviewCountAtMeasurement: 50 })).toBe('too_early_to_tell')
  })

  it('too_early_to_tell (never a guess) when the real fast-tier re-pull produced no usable data', () => {
    expect(computeOutcomeLabel({ entryVelocity: undefined, avgReviewCountAtMeasurement: null })).toBe('too_early_to_tell')
    expect(computeOutcomeLabel({ entryVelocity: 'Accelerating', avgReviewCountAtMeasurement: null })).toBe('too_early_to_tell')
  })

  it('reuses the exact REVIEW_MOAT_MIN_REVIEWS threshold from lib/scoring.ts, not a new invented one', () => {
    expect(REVIEW_MOAT_MIN_REVIEWS).toBe(10)
    expect(computeOutcomeLabel({ entryVelocity: 'Accelerating', avgReviewCountAtMeasurement: 9 })).toBe('too_early_to_tell')
    expect(computeOutcomeLabel({ entryVelocity: 'Accelerating', avgReviewCountAtMeasurement: 10 })).toBe('meaningful_traction')
  })
})
