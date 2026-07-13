// ── Per-user in-memory sliding-window rate limiter — LOCAL DEVELOPMENT ONLY ──
//
// Beta Readiness Audit (Critical): this used to be the only implementation,
// and it ran in production too — state is per Vercel serverless instance
// and not shared across instances, so it could not actually enforce a
// limit under real concurrent/multi-instance traffic. It is now used only
// when NODE_ENV !== 'production' (see ../index.ts); production always
// goes through redis-store.ts's distributed, atomic implementation.
//
// Kept byte-identical to the original algorithm so local dev behavior is
// unchanged: a real sliding window over an array of request timestamps,
// synchronous (Node has no concurrent access within one process, so no
// race is possible here — this was never the bug; the bug was state not
// being shared ACROSS processes/instances).

const _store = new Map<string, number[]>()

/**
 * Returns true (allowed) or false (over limit). Synchronous — wrapped in a
 * resolved Promise by the caller (index.ts) so both stores share one async
 * public signature.
 */
export function checkRateLimitInMemory(
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

// Test-only: clear all counters so tests don't leak state into each other.
export function __resetMemoryStoreForTests(): void {
  _store.clear()
}
