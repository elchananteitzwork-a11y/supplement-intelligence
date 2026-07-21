// ── Per-route limits ──────────────────────────────────────────────────────
// Conservative: protects provider budgets without blocking normal usage.
// A real user browsing the product will rarely hit these in a minute.
// Unchanged from the prior in-memory-only limiter — this Beta Readiness
// fix replaces the storage backend, not the limits themselves.

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

/** Compare recommendation — Claude Sonnet, short prompt over already-
 *  computed real data (pre-beta security audit fix: this route previously
 *  had no rate limit at all). */
export const COMPARE_RECOMMEND_LIMIT   = 5
