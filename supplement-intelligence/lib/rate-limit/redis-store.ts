// ── Distributed sliding-window rate limiter — Upstash Redis ─────────────────
//
// Beta Readiness Audit (Critical): replaces the in-memory limiter for every
// production request. Upstash's REST-based client (no persistent TCP
// connection) is what makes this safe to call from Vercel serverless
// functions — the same reason the original code comment named Upstash
// specifically as the intended fix.
//
// Same real algorithm as the old in-memory version (a true sliding-window
// log: prune entries older than the window, count what's left, compare to
// the limit), now backed by one shared Redis sorted set per key instead of
// one Map per process — so every serverless instance sees the same count.
//
// Atomicity: the prune-count-compare-add sequence runs as a single Lua
// script, which Redis executes to completion without interleaving any
// other command — this is what actually prevents the race a naive
// "GET count, compare, then SET" implementation would have under
// concurrent requests (two concurrent calls could both read count=2 under
// limit=3 before either writes, and both would then be allowed, exceeding
// the real limit by one for every additional concurrent racer). A plain
// Map was never at risk of this within one process (Node has no
// preemptive threading), but network round-trips to Redis reintroduce
// exactly this class of race unless the check-and-increment is atomic.

import { Redis } from '@upstash/redis'

// KEYS[1] = the namespaced rate-limit key
// ARGV[1] = now (ms)
// ARGV[2] = window (ms)
// ARGV[3] = limit
// ARGV[4] = unique member for this request (avoids same-millisecond collisions)
const SLIDING_WINDOW_SCRIPT = `
  local key    = KEYS[1]
  local now    = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local limit  = tonumber(ARGV[3])
  local member = ARGV[4]

  redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
  local count = redis.call('ZCARD', key)

  if count >= limit then
    return 0
  end

  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return 1
`

// Minimal surface this module needs from the Upstash client — lets tests
// inject a fake without depending on the real network client.
export interface RedisEvalClient {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>
}

let _client: Redis | null = null

export function isRedisRateLimitConfigured(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
}

function getRedisClient(): Redis {
  if (!isRedisRateLimitConfigured()) {
    throw new Error('Upstash Redis is not configured — UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are unset.')
  }
  if (!_client) {
    _client = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return _client
}

// Pure given an injected client — this is the actual rate-limit decision,
// factored out so it's directly testable (including concurrency) against
// a fake client that faithfully models Redis's atomic-script guarantee,
// without a live Upstash instance.
export async function checkRateLimitWithClient(
  client:   RedisEvalClient,
  key:      string,
  limit:    number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now()
  const member = `${now}-${Math.random().toString(36).slice(2)}`
  const result = await client.eval(SLIDING_WINDOW_SCRIPT, [`rl:${key}`], [now, windowMs, limit, member])
  return result === 1
}

// Public entry point used by index.ts in production. Fails OPEN (allows
// the request) on any misconfiguration or backend error, logging loudly —
// this limiter protects paid-provider cost budgets, not authentication or
// billing; a Redis outage taking down every metered route in the app
// would be a worse beta outcome than a temporary loss of burst protection.
// This is a deliberate, disclosed choice (see Beta Readiness Audit), not
// an oversight — quota/billing/auth all fail CLOSED elsewhere in this
// codebase and are unaffected by this module.
export async function checkRateLimitRedis(
  key:      string,
  limit:    number,
  windowMs: number,
): Promise<boolean> {
  if (!isRedisRateLimitConfigured()) {
    console.warn(
      '[RateLimit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not configured in a production ' +
      'runtime — failing open (request allowed, unrated) rather than blocking traffic. Configure Upstash ' +
      'to restore real rate limiting.'
    )
    return true
  }

  try {
    return await checkRateLimitWithClient(getRedisClient(), key, limit, windowMs)
  } catch (e: unknown) {
    console.warn(
      '[RateLimit] Upstash Redis call failed — failing open (request allowed, unrated) rather than ' +
      'blocking traffic.',
      e instanceof Error ? e.message : e,
    )
    return true
  }
}

// Test-only: reset the singleton so tests can inject a fresh mock per case.
export function __resetRedisClientForTests(): void {
  _client = null
}
