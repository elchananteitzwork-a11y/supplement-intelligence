import { describe, it, expect } from 'vitest'
import { deriveHistoricalOutcomeStatus } from '../derivations'
import { CHECKPOINT_DAYS } from '@/lib/re-measurement/checkpoints'

describe('deriveHistoricalOutcomeStatus', () => {
  it('is "too_early" the day after a verdict was recorded', () => {
    const createdAt = '2026-07-12T00:00:00Z'
    const now = new Date('2026-07-13T00:00:00Z')
    const result = deriveHistoricalOutcomeStatus(createdAt, now)
    expect(result.maturity).toBe('too_early')
    expect(result.daysSinceVerdict).toBe(1)
  })

  it('is still "too_early" one real day before the 90-day (3-month) checkpoint threshold', () => {
    const createdAt = '2026-01-01T00:00:00Z'
    const now = new Date(new Date(createdAt).getTime() + (CHECKPOINT_DAYS[3] - 1) * 86_400_000)
    const result = deriveHistoricalOutcomeStatus(createdAt, now)
    expect(result.maturity).toBe('too_early')
  })

  it('becomes "checkpoint_due" at exactly the real 90-day threshold — the same one the M2.9 worker itself uses', () => {
    const createdAt = '2026-01-01T00:00:00Z'
    const now = new Date(new Date(createdAt).getTime() + CHECKPOINT_DAYS[3] * 86_400_000)
    const result = deriveHistoricalOutcomeStatus(createdAt, now)
    expect(result.maturity).toBe('checkpoint_due')
    expect(result.daysSinceVerdict).toBe(CHECKPOINT_DAYS[3])
  })

  it('stays "checkpoint_due" well past the 12-month checkpoint (never reverts)', () => {
    const createdAt = '2024-01-01T00:00:00Z'
    const now = new Date(new Date(createdAt).getTime() + CHECKPOINT_DAYS[12] * 2 * 86_400_000)
    const result = deriveHistoricalOutcomeStatus(createdAt, now)
    expect(result.maturity).toBe('checkpoint_due')
  })
})
