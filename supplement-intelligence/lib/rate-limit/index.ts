// ── Rate limiter — public entry point ────────────────────────────────────
//
// Beta Readiness Audit (Critical): production now always uses the
// distributed Upstash-backed store (redis-store.ts) so the limit is
// actually shared across every serverless instance. The in-memory store
// (memory-store.ts) is kept ONLY for local development/tests, where a
// single process is the whole "deployment" and a network dependency would
// be pure friction, not safety.
//
// NODE_ENV === 'production' is what Next.js/Vercel set for every real
// deployment (including preview deployments, not only the production
// domain) — same convention already established for the dev-only billing
// bypass (lib/billing/dev-bypass.ts). Any other value (development, test,
// undefined) uses the in-memory store.
//
// Public contract is unchanged except that this is now async — every call
// site already runs inside an async route handler, so this is a one-line
// `await` change at each of the 8 existing call sites, not a behavior
// change: same keys, same limits, same windows, same allow/deny meaning.

import { checkRateLimitInMemory } from './memory-store'
import { checkRateLimitRedis } from './redis-store'

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Returns true (allowed) or false (over limit).
 *
 * @param key       Unique limiter key — use userId for authenticated routes,
 *                  IP address as fallback for unauthenticated paths.
 * @param limit     Maximum requests allowed within windowMs.
 * @param windowMs  Sliding window duration in milliseconds (default: 60 000).
 */
export async function checkRateLimit(
  key:      string,
  limit:    number,
  windowMs: number = 60_000,
): Promise<boolean> {
  if (isProductionRuntime()) {
    return checkRateLimitRedis(key, limit, windowMs)
  }
  return checkRateLimitInMemory(key, limit, windowMs)
}

export {
  DISCOVER_LIMIT,
  GENERATE_LIMIT,
  REVIEWS_COLLECT_LIMIT,
  REVIEWS_ANALYZE_LIMIT,
  REVIEWS_COMPETITIVE_LIMIT,
  MANUFACTURING_LIMIT,
  RESEARCH_LIMIT,
  COMPARE_RECOMMEND_LIMIT,
} from './limits'
