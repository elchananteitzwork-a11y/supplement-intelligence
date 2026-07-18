// TikTok Shop Intelligence (Social Commerce) provider tests — Roadmap M3.5.
//
// Covers: real Apify response shape (mocked, matching the actor's own real
// confirmed output fields), empty/thin-results honest null, error handling,
// and GMV derivation correctness (sold_count × price_usd, excluding any
// result missing either real field — never zero-filled).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TikTokShopProvider, FIXED_CONFIDENCE, DATA_SOURCE } from '../tiktok-shop'

const cacheGet = vi.fn()
const cacheSet = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/provider-cache', () => ({
  cacheGet: (...args: unknown[]) => cacheGet(...args),
  cacheSet: (...args: unknown[]) => cacheSet(...args),
}))

const ORIGINAL_TOKEN = process.env.APIFY_API_TOKEN

function mockDatasetResponse(items: unknown[]) {
  return { ok: true, status: 200, json: async () => items } as Response
}

// Shaped exactly like the actor's own real confirmed output fields
// (CONFIRMED VIA LIVE CALL 2026-07-17 against the actor's build metadata).
function realResult(overrides: Record<string, unknown> = {}) {
  return {
    id: '1729388303591248135',
    title: 'GuruNanda Whitening Strips',
    seller_name: 'GuruNanda LLC',
    price_usd: '$8.99',
    price: '$8.99',
    sold_count: 943022,
    rank: 1,
    product_status: true,
    ...overrides,
  }
}

describe('TikTokShopProvider — credential gating', () => {
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('is disabled when APIFY_API_TOKEN is unset', () => {
    delete process.env.APIFY_API_TOKEN
    expect(new TikTokShopProvider().enabled).toBe(false)
  })

  it('is enabled when APIFY_API_TOKEN is set', () => {
    process.env.APIFY_API_TOKEN = 'test-token'
    expect(new TikTokShopProvider().enabled).toBe(true)
  })

  it('fetch() returns null immediately when no token is present, without calling fetch', async () => {
    delete process.env.APIFY_API_TOKEN
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns null for an empty query, without calling fetch', async () => {
    process.env.APIFY_API_TOKEN = 'test-token'
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await new TikTokShopProvider().fetch({ query: '   ' })
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('TikTokShopProvider — honest-null handling', () => {
  beforeEach(() => {
    process.env.APIFY_API_TOKEN = 'test-token'
    cacheGet.mockResolvedValue(null)
  })
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('returns null when below MIN_RESULTS (thin data — honest null, not a shaky derived GMV)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([realResult(), realResult()]))
    const result = await new TikTokShopProvider().fetch({ query: 'obscure niche product' })
    expect(result).toBeNull()
  })

  // Regression test for the confirmed MIN_RESULTS bug (independent review):
  // MIN_RESULTS used to gate on the RAW Apify item count, before the
  // usable (sold_count + parseable price) filter ran — so a response with
  // enough raw items but too few real, computable ones slipped through and
  // produced a real, non-null SocialCommerceSignal with sample_size 0 (a
  // fabricated-looking 0, not an honest null). This fixture reproduces
  // exactly that shape: 3 raw items (>= MIN_RESULTS), but only 1 is
  // actually usable (< MIN_RESULTS) — must return null, not a thin object.
  it('returns null (never a sample_size: 0 object) when raw item count meets MIN_RESULTS but the USABLE count does not', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'usable', sold_count: 100, price_usd: '$10.00' }),          // usable
      realResult({ id: 'no-sold-count', sold_count: undefined, price_usd: '$10.00' }), // missing sold_count
      realResult({ id: 'no-price', sold_count: 50, price_usd: undefined, price: undefined }), // missing price
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'obscure niche product' })
    expect(result).toBeNull()
  })

  it('returns null (never a sample_size: 0 object) when raw item count meets MIN_RESULTS but ZERO are usable', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a', sold_count: undefined }),
      realResult({ id: 'b', sold_count: undefined }),
      realResult({ id: 'c', sold_count: undefined }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'obscure niche product' })
    expect(result).toBeNull()
  })

  it('returns null on a non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response)
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).toBeNull()
  })

  it('returns null when the actor returns a non-array response (unexpected shape)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ error: 'actor run failed' }),
    } as Response)
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new Error('not json') },
    } as unknown as Response)
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).toBeNull()
  })

  it('returns null when fetch itself throws (network error) — never fatal', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).toBeNull()
  })
})

describe('TikTokShopProvider — GMV derivation correctness', () => {
  beforeEach(() => {
    process.env.APIFY_API_TOKEN = 'test-token'
    cacheGet.mockResolvedValue(null)
  })
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('computes estimated_gmv_total as the real sum of sold_count × price_usd', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a', sold_count: 100, price_usd: '$10.00' }),   // 1,000
      realResult({ id: 'b', sold_count: 50,  price_usd: '$20.00' }),   // 1,000
      realResult({ id: 'c', sold_count: 4,   price_usd: '$5.00' }),    // 20
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).not.toBeNull()
    const sc = result!.social_commerce!
    expect(sc.estimated_gmv_total).toBeCloseTo(2020, 2)
    expect(sc.sold_count_total).toBe(154)
    expect(sc.sample_size).toBe(3)
  })

  it('excludes a result missing sold_count or an unparseable price, never zero-filling it (with enough OTHER usable results to clear MIN_RESULTS)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a', sold_count: 100, price_usd: '$10.00' }),   // 1,000 — usable
      realResult({ id: 'd', sold_count: 200, price_usd: '$5.00' }),    // 1,000 — usable
      realResult({ id: 'e', sold_count: 10,  price_usd: '$1.00' }),    // 10 — usable
      realResult({ id: 'b', sold_count: undefined, price_usd: '$20.00' }), // no sold_count — excluded
      realResult({ id: 'c', sold_count: 50, price_usd: undefined, price: undefined }), // no price — excluded
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).not.toBeNull()
    const sc = result!.social_commerce!
    // Only the 3 real, usable results count — the 2 excluded ones (missing
    // sold_count / unparseable price) contribute NOTHING, not a zero.
    expect(sc.sample_size).toBe(3)
    expect(sc.estimated_gmv_total).toBeCloseTo(2010, 2)
    expect(sc.sold_count_total).toBe(310)
  })

  // `currency: '$'` is required on the fallback item here because the
  // `price` fallback is gated on a CONFIRMED USD currency (see Finding 2 —
  // currency validated before trusting `price` as USD, below) — a bare
  // `price` with no currency confirmation at all is excluded, not assumed.
  it('falls back to the `price` field only when `price_usd` is absent, and currency is confirmed USD', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a', sold_count: 100, price_usd: undefined, price: '$12.50', currency: '$' }),
      realResult({ id: 'b', sold_count: 10, price_usd: '$1.00' }),
      realResult({ id: 'c', sold_count: 10, price_usd: '$1.00' }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    const sc = result!.social_commerce!
    expect(sc.estimated_gmv_total).toBeCloseTo(100 * 12.5 + 10 + 10, 2)
  })

  it('sets methodology, data_source, and a FIXED confidence never derived from sample size', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse(
      Array.from({ length: 10 }, (_, i) => realResult({ id: `p${i}`, sold_count: 1000 * (i + 1), price_usd: '$9.99' })),
    ))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    const sc = result!.social_commerce!
    expect(sc.methodology).toBe('derived_sold_count_x_price_lifetime_cumulative')
    expect(sc.data_source).toBe(DATA_SOURCE)
    expect(sc.confidence).toBe(FIXED_CONFIDENCE)
    expect(result!.confidence).toBe(FIXED_CONFIDENCE)
    // A 10-item real sample must NOT push confidence above the fixed cap —
    // the entire point of FIXED_CONFIDENCE (see provider header comment).
    expect(sc.confidence).toBeLessThan(0.5)
  })

  it('sorts top_products by estimated_gmv desc and caps at 10, with real per-listing fields', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'small', title: 'Small GMV', sold_count: 10, price_usd: '$1.00' }),
      realResult({ id: 'big',   title: 'Big GMV',   sold_count: 1000, price_usd: '$50.00' }),
      realResult({ id: 'mid',   title: 'Mid GMV',   sold_count: 100, price_usd: '$5.00' }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    const sc = result!.social_commerce!
    expect(sc.top_products?.map(p => p.title)).toEqual(['Big GMV', 'Mid GMV', 'Small GMV'])
    expect(sc.top_products?.[0].estimated_gmv).toBeCloseTo(50000, 2)
  })

  it('produces a valid ProviderSignals shape with provider name "tiktok-shop"', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a' }), realResult({ id: 'b' }), realResult({ id: 'c' }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result!.provider).toBe('tiktok-shop')
    expect(typeof result!.fetched_at).toBe('string')
  })

  it('sends the real actor endpoint, US country_code, and the query as keyword', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a' }), realResult({ id: 'b' }), realResult({ id: 'c' }),
    ]))
    await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('api.apify.com/v2/acts/pratikdani~tiktok-shop-search-scraper/run-sync-get-dataset-items')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.country_code).toBe('US')
    expect(body.keyword).toBe('magnesium glycinate')
    expect(body.limit).toBeLessThanOrEqual(10)
  })
})

// ── Bug-fix audit regression tests (2026-07-18) ─────────────────────────────
// Finding 1: no product-id dedupe (sponsored + organic double-counting).
// Finding 2: `price` fallback never validated against `currency` before
// being trusted as USD. Both mirror the equivalent fixes already made this
// session in competition.ts (dedupeByAsin / usdPrice) — see tiktok-shop.ts's
// own fix comments for full rationale.

describe('Finding 1 — product-id dedupe', () => {
  beforeEach(() => {
    process.env.APIFY_API_TOKEN = 'test-token'
    cacheGet.mockResolvedValue(null)
  })
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('counts a sponsored + organic placement of the same real product id exactly once', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      // Sponsored placement of the same real id at rank 1
      realResult({ id: 'B0DUPE001', title: 'Dupe Product', sold_count: 1000, price_usd: '$10.00', rank: 1 }),
      realResult({ id: 'other-2', title: 'Other 2', sold_count: 300, price_usd: '$5.00', rank: 2 }),
      realResult({ id: 'other-3', title: 'Other 3', sold_count: 250, price_usd: '$5.00', rank: 3 }),
      // Organic placement of the SAME real id, later in the response
      realResult({ id: 'B0DUPE001', title: 'Dupe Product', sold_count: 1000, price_usd: '$10.00', rank: 5 }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).not.toBeNull()
    const sc = result!.social_commerce!

    // 3 real distinct listings after dedupe (4 raw items, 1 duplicate id removed).
    expect(sc.sample_size).toBe(3)
    // GMV/sold_count must reflect the deduped id counted ONCE, not twice:
    // 1000*10 (dupe, once) + 300*5 + 250*5 = 10000 + 1500 + 1250 = 12750
    expect(sc.estimated_gmv_total).toBeCloseTo(12750, 2)
    expect(sc.sold_count_total).toBe(1550)
    // The deduped id appears exactly once in top_products.
    const dupeEntries = sc.top_products!.filter(p => p.title === 'Dupe Product')
    expect(dupeEntries.length).toBe(1)
  })

  it('keeps the first (earliest/highest-ranked) real occurrence of a duplicate id', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'B0DUPE001', title: 'Dupe Product', sold_count: 1000, price_usd: '$10.00', rank: 1 }),
      realResult({ id: 'other-2', title: 'Other 2', sold_count: 300, price_usd: '$5.00', rank: 2 }),
      realResult({ id: 'other-3', title: 'Other 3', sold_count: 250, price_usd: '$5.00', rank: 3 }),
      // Same id reappears at a worse rank with different values — must be dropped, not merged.
      realResult({ id: 'B0DUPE001', title: 'Dupe Product', sold_count: 999999, price_usd: '$999.00', rank: 9 }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    const sc = result!.social_commerce!
    const kept = sc.top_products!.find(p => p.title === 'Dupe Product')
    expect(kept).toBeDefined()
    expect(kept!.rank).toBe(1)
    expect(kept!.sold_count).toBe(1000)
    expect(kept!.price_usd).toBe(10.00)
  })

  it('does not dedupe items that lack a real id (nothing reliable to key on)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: undefined, title: 'No ID A', sold_count: 100, price_usd: '$10.00' }),
      realResult({ id: undefined, title: 'No ID B', sold_count: 200, price_usd: '$10.00' }),
      realResult({ id: 'real-1', title: 'Real 1', sold_count: 50, price_usd: '$10.00' }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    const sc = result!.social_commerce!
    // All 3 (including the 2 id-less ones) count as usable — none deduped
    // against each other since neither has a real id.
    expect(sc.sample_size).toBe(3)
  })
})

describe('Finding 2 — currency validated before trusting `price` as USD', () => {
  beforeEach(() => {
    process.env.APIFY_API_TOKEN = 'test-token'
    cacheGet.mockResolvedValue(null)
  })
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('excludes a result whose price_usd is absent/unparseable and whose price is in a real non-USD currency, rather than assuming USD', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      // Non-USD listing: no usable price_usd, and its real `price` is EUR — must be excluded, not treated as $18.50 USD.
      realResult({ id: 'eur-1', title: 'EUR listing', sold_count: 500, price_usd: undefined, price: '€18.50', currency: 'EUR' }),
      realResult({ id: 'usd-1', title: 'USD 1', sold_count: 100, price_usd: '$10.00' }),
      realResult({ id: 'usd-2', title: 'USD 2', sold_count: 100, price_usd: '$10.00' }),
      realResult({ id: 'usd-3', title: 'USD 3', sold_count: 100, price_usd: '$10.00' }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).not.toBeNull()
    const sc = result!.social_commerce!

    // Only the 3 real USD listings are usable — the EUR one contributes nothing.
    expect(sc.sample_size).toBe(3)
    expect(sc.estimated_gmv_total).toBeCloseTo(3000, 2)
    expect(sc.top_products!.some(p => p.title === 'EUR listing')).toBe(false)
  })

  // Independent-review correction (2026-07-18): the `price` fallback used to
  // also be allowed when `currency` was entirely absent, reasoning that an
  // absent field was "no evidence" of a non-USD price. That reasoning was
  // never CONFIRMED VIA LIVE CALL (unlike every other actor-behavior claim
  // in this file) and — per this bug-fix task's own constraint of no paid
  // Apify calls right now — cannot be live-confirmed today. Tightened to
  // the conservative behavior below: absent currency also excludes the
  // fallback, exactly like competition.ts's `usdPrice()`, pending a future
  // live-confirmed check of this actor's real currency-field behavior.
  it('excludes the `price` fallback when currency is entirely absent (unverified whether an absent field ever means non-USD)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'no-currency', title: 'No currency field', sold_count: 100, price_usd: undefined, price: '$12.50', currency: undefined }),
      realResult({ id: 'usd-1', sold_count: 10, price_usd: '$1.00' }),
      realResult({ id: 'usd-2', sold_count: 10, price_usd: '$1.00' }),
      realResult({ id: 'usd-3', sold_count: 10, price_usd: '$1.00' }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).not.toBeNull()
    const sc = result!.social_commerce!
    // Only the 3 real price_usd-backed listings are usable — the
    // absent-currency `price`-fallback listing contributes nothing.
    expect(sc.sample_size).toBe(3)
    expect(sc.top_products!.some(p => p.title === 'No currency field')).toBe(false)
  })

  it('still allows the `price` fallback when currency is confirmed "USD" or "$"', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a', title: 'Dollar sign', sold_count: 100, price_usd: undefined, price: '$12.50', currency: '$' }),
      realResult({ id: 'b', title: 'USD string', sold_count: 100, price_usd: undefined, price: '$9.00', currency: 'USD' }),
      realResult({ id: 'c', sold_count: 10, price_usd: '$1.00' }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    const sc = result!.social_commerce!
    expect(sc.sample_size).toBe(3)
    expect(sc.top_products!.some(p => p.title === 'Dollar sign')).toBe(true)
    expect(sc.top_products!.some(p => p.title === 'USD string')).toBe(true)
  })

  it('uses price_usd directly with no currency gating, even when currency looks non-USD', async () => {
    // price_usd is already a documented USD-converted field — currency
    // (if present at all) describes the OTHER `price` field, not price_usd.
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a', title: 'Has price_usd', sold_count: 100, price_usd: '$10.00', price: '€9.20', currency: 'EUR' }),
      realResult({ id: 'b', sold_count: 10, price_usd: '$1.00' }),
      realResult({ id: 'c', sold_count: 10, price_usd: '$1.00' }),
    ]))
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    const sc = result!.social_commerce!
    const kept = sc.top_products!.find(p => p.title === 'Has price_usd')
    expect(kept).toBeDefined()
    expect(kept!.price_usd).toBe(10.00)
  })
})

describe('TikTokShopProvider — caching', () => {
  beforeEach(() => { process.env.APIFY_API_TOKEN = 'test-token' })
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('returns a cache HIT without calling fetch', async () => {
    const cached = {
      social_commerce: {
        estimated_gmv_total: 500, sold_count_total: 50, sample_size: 3,
        methodology: 'derived_sold_count_x_price_lifetime_cumulative' as const,
        data_source: DATA_SOURCE, confidence: FIXED_CONFIDENCE,
      },
      provider: 'tiktok-shop', fetched_at: '2026-07-17T00:00:00.000Z', confidence: FIXED_CONFIDENCE,
    }
    cacheGet.mockResolvedValue(cached)
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).toEqual(cached)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('writes to cache on a real miss', async () => {
    cacheGet.mockResolvedValue(null)
    vi.spyOn(global, 'fetch').mockResolvedValue(mockDatasetResponse([
      realResult({ id: 'a' }), realResult({ id: 'b' }), realResult({ id: 'c' }),
    ]))
    await new TikTokShopProvider().fetch({ query: 'magnesium glycinate' })
    expect(cacheSet).toHaveBeenCalledWith(
      'tiktok-shop:v1:magnesium glycinate', 'tiktok-shop', expect.any(Object), expect.any(Number),
    )
  })
})
