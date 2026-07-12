// ── Per-user in-memory sliding-window rate limiter ────────────────────────
//
// Protects expensive API routes (Claude, Apify, DataForSEO, Keepa) from
// per-user request bursts. Keyed by userId so limits are per-authenticated-
// user, not per-IP. Falls back to IP key for unauthenticated paths (none
// currently exist after the /api/discover auth fix).
//
// Limitation: state is per Vercel serverless instance and not shared across
// instances. For a closed beta (low concurrency, known users) this is
// acceptable. Replace with Upstash Redis before public launch if horizontal
// scaling requires shared rate-limit state across instances.

const _store = new Map<string, number[]>()

/**
 * Returns true (allowed) or false (over limit).
 *
 * @param key       Unique limiter key — use userId for authenticated routes,
 *                  IP address as fallback for unauthenticated paths.
 * @param limit     Maximum requests allowed within windowMs.
 * @param windowMs  Sliding window duration in milliseconds (default: 60 000).
 */
export function checkRateLimit(
  key:      string,
  limit:    number,
  windowMs: number = 60_000,
): boolean {
  const now = Date.now()
  const pruned = (_store.get(key) ?? []).filter(t => now - t < windowMs)
  if (pruned.length === 0) _store.delete(key)  // evict cold entries to prevent unbounded growth
  if (pruned.length >= limit) return false
  pruned.push(now)
  _store.set(key, pruned)
  return true
}

// ── Per-route limits ──────────────────────────────────────────────────────
// Conservative: protects provider budgets without blocking normal usage.
// A real user browsing the product will rarely hit these in a minute.

/** Claude Haiku + signal engine — moderate cost */
export const DISCOVER_LIMIT      = 10

/** Claude Sonnet + all providers — highest cost */
export const GENERATE_LIMIT      = 3

/** Apify Amazon review scrape */
export const REVIEWS_COLLECT_LIMIT     = 5

/** Review analysis (AI chunked) */
export const REVIEWS_ANALYZE_LIMIT     = 5

/** Competitive review engine — up to 20 ASINs × Apify */
export const REVIEWS_COMPETITIVE_LIMIT = 3

/** Manufacturing estimate (Apify + AI) */
export const MANUFACTURING_LIMIT       = 5

/** Research market-signal (signal engine + keyword engine + regulatory) */
export const RESEARCH_LIMIT            = 5
