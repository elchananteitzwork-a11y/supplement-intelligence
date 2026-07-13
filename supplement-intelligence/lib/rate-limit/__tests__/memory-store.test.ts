import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkRateLimitInMemory, __resetMemoryStoreForTests } from '../memory-store'

describe('checkRateLimitInMemory', () => {
  beforeEach(() => {
    __resetMemoryStoreForTests()
    vi.useRealTimers()
  })

  it('allows requests up to the limit', () => {
    expect(checkRateLimitInMemory('user-1', 3)).toBe(true)
    expect(checkRateLimitInMemory('user-1', 3)).toBe(true)
    expect(checkRateLimitInMemory('user-1', 3)).toBe(true)
  })

  it('denies the request that would exceed the limit', () => {
    expect(checkRateLimitInMemory('user-2', 2)).toBe(true)
    expect(checkRateLimitInMemory('user-2', 2)).toBe(true)
    expect(checkRateLimitInMemory('user-2', 2)).toBe(false)
  })

  it('tracks each key independently', () => {
    expect(checkRateLimitInMemory('user-3', 1)).toBe(true)
    expect(checkRateLimitInMemory('user-3', 1)).toBe(false)
    // A different key has its own, unaffected counter.
    expect(checkRateLimitInMemory('user-4', 1)).toBe(true)
  })

  it('allows again once the window has real-elapsed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    expect(checkRateLimitInMemory('user-5', 1, 1_000)).toBe(true)
    expect(checkRateLimitInMemory('user-5', 1, 1_000)).toBe(false)

    vi.setSystemTime(new Date('2026-01-01T00:00:01.001Z'))
    expect(checkRateLimitInMemory('user-5', 1, 1_000)).toBe(true)
    vi.useRealTimers()
  })
})
