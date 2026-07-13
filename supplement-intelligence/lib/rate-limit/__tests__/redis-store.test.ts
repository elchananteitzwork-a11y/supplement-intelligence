import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  checkRateLimitWithClient,
  checkRateLimitRedis,
  isRedisRateLimitConfigured,
  __resetRedisClientForTests,
  type RedisEvalClient,
} from '../redis-store'

// Mocks the real Upstash client so checkRateLimitRedis's own construction +
// error-handling path (not just checkRateLimitWithClient's pure logic,
// already covered above with an injected fake) is exercised directly.
const mockEval = vi.fn()
vi.mock('@upstash/redis', () => ({
  // Must be a real function (not an arrow function) so `new Redis(...)` in
  // redis-store.ts works — arrow functions have no [[Construct]] internal
  // method and throw "is not a constructor" when used with `new`.
  Redis: vi.fn().mockImplementation(function FakeRedis() { return { eval: mockEval } }),
}))

// ── Fake Redis clients used only in this test file ──────────────────────────
//
// FakeAtomicRedis faithfully models what the real Upstash/Redis eval() call
// guarantees: a random network-latency delay to REACH the server (so
// concurrent callers genuinely race to get there), followed by the entire
// prune-count-compare-add sequence running to completion with no further
// await in between — exactly how Redis executes a single Lua script
// (single-threaded, atomic, no other command can interleave inside it).
//
// FakeNonAtomicRedis simulates what a naive "GET count, compare, then SET"
// implementation (three separate round trips instead of one atomic script)
// would do instead — each step is its own await, so two concurrent callers
// really can both read the same under-limit count before either writes.
// It exists only to prove, by contrast, that the atomic single-script
// design is actually load-bearing here and not an arbitrary implementation
// choice.

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class FakeAtomicRedis implements RedisEvalClient {
  private zsets = new Map<string, Map<string, number>>() // key -> member -> score

  async eval(_script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    await delay(Math.random() * 5) // simulated network latency to "reach" Redis
    const [key] = keys
    const [now, window, limit, member] = args as [number, number, number, string]

    const zset = this.zsets.get(key) ?? new Map<string, number>()
    for (const [m, score] of Array.from(zset.entries())) {
      if (score < now - window) zset.delete(m)
    }
    if (zset.size >= limit) {
      this.zsets.set(key, zset)
      return 0
    }
    zset.set(member, now)
    this.zsets.set(key, zset)
    return 1
  }
}

class FakeNonAtomicRedis implements RedisEvalClient {
  private counts = new Map<string, number>()

  // Ignores the real script — deliberately reimplements the same intent as
  // three separate, independently-awaited round trips to expose the race.
  async eval(_script: string, keys: string[], _args: (string | number)[]): Promise<unknown> {
    const [key] = keys
    const limit = Number(_args[2])

    await delay(Math.random() * 5) // round trip 1: read count
    const current = this.counts.get(key) ?? 0

    await delay(Math.random() * 5) // round trip 2: compare (no-op, just a yield point)

    if (current >= limit) return 0

    await delay(Math.random() * 5) // round trip 3: write incremented count
    this.counts.set(key, current + 1)
    return 1
  }
}

describe('checkRateLimitWithClient — single request behavior', () => {
  it('allows requests up to the limit', async () => {
    const client = new FakeAtomicRedis()
    expect(await checkRateLimitWithClient(client, 'k1', 3, 60_000)).toBe(true)
    expect(await checkRateLimitWithClient(client, 'k1', 3, 60_000)).toBe(true)
    expect(await checkRateLimitWithClient(client, 'k1', 3, 60_000)).toBe(true)
  })

  it('denies the request that would exceed the limit', async () => {
    const client = new FakeAtomicRedis()
    expect(await checkRateLimitWithClient(client, 'k2', 2, 60_000)).toBe(true)
    expect(await checkRateLimitWithClient(client, 'k2', 2, 60_000)).toBe(true)
    expect(await checkRateLimitWithClient(client, 'k2', 2, 60_000)).toBe(false)
  })

  it('interprets any eval result other than exactly 1 as denied', async () => {
    const client: RedisEvalClient = { eval: vi.fn().mockResolvedValue(0) }
    expect(await checkRateLimitWithClient(client, 'k3', 5, 60_000)).toBe(false)
  })
})

describe('checkRateLimitWithClient — concurrency (no race across "instances")', () => {
  it('never allows more than `limit` successes out of many concurrent callers sharing one key', async () => {
    const client = new FakeAtomicRedis()
    const limit = 3
    const concurrentCallers = 25

    const results = await Promise.all(
      Array.from({ length: concurrentCallers }, () => checkRateLimitWithClient(client, 'shared-key', limit, 60_000)),
    )

    const allowed = results.filter(Boolean).length
    expect(allowed).toBe(limit)
  })

  it('demonstrates the race a non-atomic (multi-round-trip) implementation would allow — motivating the atomic script', async () => {
    const client = new FakeNonAtomicRedis()
    const limit = 3
    const concurrentCallers = 25

    const results = await Promise.all(
      Array.from({ length: concurrentCallers }, () => checkRateLimitWithClient(client, 'shared-key', limit, 60_000)),
    )

    const allowed = results.filter(Boolean).length
    // Not asserting an exact number (the race is inherently nondeterministic)
    // — only that the naive approach can and does overshoot the real limit,
    // which the atomic implementation above never does.
    expect(allowed).toBeGreaterThan(limit)
  })
})

describe('checkRateLimitRedis — fail-open behavior', () => {
  const ORIGINAL_ENV = { ...process.env }
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    __resetRedisClientForTests()
    mockEval.mockReset()
    vi.restoreAllMocks()
  })

  it('is not configured when Upstash env vars are missing', () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    expect(isRedisRateLimitConfigured()).toBe(false)
  })

  it('is configured when both Upstash env vars are present', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    expect(isRedisRateLimitConfigured()).toBe(true)
  })

  it('fails OPEN (allows the request) when Upstash is not configured, and warns', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const allowed = await checkRateLimitRedis('user-1', 3, 60_000)

    expect(allowed).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not configured'))
  })

  it('fails OPEN (allows the request) when Upstash is configured but the call throws, and warns', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockEval.mockRejectedValue(new Error('ECONNRESET'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const allowed = await checkRateLimitRedis('user-1', 3, 60_000)

    expect(allowed).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('call failed'), expect.stringContaining('ECONNRESET'))
  })

  it('enforces the real limit when Upstash is configured and healthy', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockEval.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0)

    expect(await checkRateLimitRedis('user-2', 2, 60_000)).toBe(true)
    expect(await checkRateLimitRedis('user-2', 2, 60_000)).toBe(true)
    expect(await checkRateLimitRedis('user-2', 2, 60_000)).toBe(false)
  })
})
