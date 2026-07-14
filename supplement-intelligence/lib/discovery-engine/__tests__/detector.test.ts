import { describe, it, expect } from 'vitest'
import { detectAcceleration, DISCOVERY_ACCELERATION_THRESHOLD_PCT } from '../detector'

describe('lib/discovery-engine/detector', () => {
  it('returns null with fewer than 2 real observations', () => {
    expect(detectAcceleration([])).toBeNull()
    expect(detectAcceleration([{ value: 10, observedAt: '2026-07-01T00:00:00Z' }])).toBeNull()
  })

  it('returns null when the prior value is exactly 0 (undefined percent change)', () => {
    const result = detectAcceleration([
      { value: 0, observedAt: '2026-07-01T00:00:00Z' },
      { value: 5, observedAt: '2026-07-08T00:00:00Z' },
    ])
    expect(result).toBeNull()
  })

  it('computes a real percent change between the two most recent points, sorted by time regardless of input order', () => {
    const result = detectAcceleration([
      { value: 20, observedAt: '2026-07-08T00:00:00Z' },
      { value: 10, observedAt: '2026-07-01T00:00:00Z' },
    ])
    expect(result).toEqual({ priorValue: 10, latestValue: 20, changePct: 100, isAccelerating: true })
  })

  it(`flags isAccelerating only when change_pct exceeds the disclosed ${DISCOVERY_ACCELERATION_THRESHOLD_PCT}% threshold`, () => {
    const justBelow = detectAcceleration([
      { value: 100, observedAt: '2026-07-01T00:00:00Z' },
      { value: 124, observedAt: '2026-07-08T00:00:00Z' },
    ])
    expect(justBelow?.isAccelerating).toBe(false)

    const above = detectAcceleration([
      { value: 100, observedAt: '2026-07-01T00:00:00Z' },
      { value: 126, observedAt: '2026-07-08T00:00:00Z' },
    ])
    expect(above?.isAccelerating).toBe(true)
  })

  it('only ever compares the two most recent points when more than 2 exist', () => {
    const result = detectAcceleration([
      { value: 1000, observedAt: '2026-06-01T00:00:00Z' },  // old spike, must be ignored
      { value: 10,   observedAt: '2026-07-01T00:00:00Z' },
      { value: 20,   observedAt: '2026-07-08T00:00:00Z' },
    ])
    expect(result).toEqual({ priorValue: 10, latestValue: 20, changePct: 100, isAccelerating: true })
  })

  it('handles a negative prior value using its magnitude as the denominator, not producing a sign error', () => {
    const result = detectAcceleration([
      { value: -10, observedAt: '2026-07-01T00:00:00Z' },
      { value: 5,   observedAt: '2026-07-08T00:00:00Z' },
    ])
    // (5 - (-10)) / |-10| = 1.5 -> 150%
    expect(result?.changePct).toBe(150)
    expect(result?.isAccelerating).toBe(true)
  })

  it('is not accelerating when the metric declines', () => {
    const result = detectAcceleration([
      { value: 20, observedAt: '2026-07-01T00:00:00Z' },
      { value: 10, observedAt: '2026-07-08T00:00:00Z' },
    ])
    expect(result?.changePct).toBe(-50)
    expect(result?.isAccelerating).toBe(false)
  })
})
