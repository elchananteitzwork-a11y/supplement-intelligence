import { describe, it, expect } from 'vitest'
import { daysSince, dueCheckpoints, CHECKPOINT_DAYS } from '../checkpoints'

describe('daysSince', () => {
  it('computes real elapsed whole days', () => {
    expect(daysSince('2026-01-01T00:00:00Z', new Date('2026-01-11T00:00:00Z'))).toBe(10)
  })
})

describe('dueCheckpoints', () => {
  it('no checkpoint is due before 90 real days have elapsed (the real ledger\'s honest current state)', () => {
    const createdAt = '2026-07-12T00:00:00Z'
    const now = new Date('2026-07-13T00:00:00Z')   // 1 day elapsed
    expect(dueCheckpoints(createdAt, now, [])).toEqual([])
  })

  it('the 3-month checkpoint becomes due at exactly 90 elapsed days', () => {
    const createdAt = '2026-01-01T00:00:00Z'
    const now = new Date(new Date(createdAt).getTime() + CHECKPOINT_DAYS[3] * 86_400_000)
    expect(dueCheckpoints(createdAt, now, [])).toEqual([3])
  })

  it('all three checkpoints are due at 12+ real months elapsed', () => {
    const createdAt = '2025-01-01T00:00:00Z'
    const now = new Date(new Date(createdAt).getTime() + CHECKPOINT_DAYS[12] * 86_400_000)
    expect(dueCheckpoints(createdAt, now, [])).toEqual([3, 6, 12])
  })

  it('never re-includes a checkpoint already recorded (idempotent)', () => {
    const createdAt = '2025-01-01T00:00:00Z'
    const now = new Date(new Date(createdAt).getTime() + CHECKPOINT_DAYS[12] * 86_400_000)
    expect(dueCheckpoints(createdAt, now, [3, 6])).toEqual([12])
    expect(dueCheckpoints(createdAt, now, [3, 6, 12])).toEqual([])
  })
})
