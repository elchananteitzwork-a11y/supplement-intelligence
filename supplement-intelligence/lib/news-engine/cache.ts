// ── Simple in-memory TTL cache ───────────────────────────────────────────────
//
// Module-scoped Map, so it persists across requests handled by the same warm
// Vercel function container (resets on cold start — no persistent store wired
// in yet). Purpose here is latency + being a good citizen toward free public
// APIs (GDELT in particular enforces a 1-request-per-5-seconds limit), not
// cost reduction — all three news providers are free. A Supabase-backed cache
// would survive cold starts if traffic ever makes that worth the extra
// migration; not needed at current beta volume.

interface CacheEntry<T> {
  data:      T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.data as T
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}
