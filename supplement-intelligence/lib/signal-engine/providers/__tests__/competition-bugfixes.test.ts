// Regression tests for 5 audit-confirmed correctness bugs in
// lib/signal-engine/providers/competition.ts (data-integrity bug-fix task,
// not a feature/refactor — see the fix comments in competition.ts itself
// for full rationale on each). No live Apify calls — global.fetch is
// mocked throughout with fixtures shaped like the actor's own real,
// confirmed junglee/amazon-crawler output fields (see competition.ts's
// JungleeResult interface and its "CONFIRMED VIA LIVE CALL" comments).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CompetitionSignalProvider } from '../competition'
import type { ReviewVelocitySignal } from '../../types'

const cacheGet = vi.fn()
const cacheSet = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/provider-cache', () => ({
  cacheGet: (...args: unknown[]) => cacheGet(...args),
  cacheSet: (...args: unknown[]) => cacheSet(...args),
}))
vi.mock('../../../provider-cache', () => ({
  cacheGet: (...args: unknown[]) => cacheGet(...args),
  cacheSet: (...args: unknown[]) => cacheSet(...args),
}))

const ORIGINAL_TOKEN = process.env.APIFY_API_TOKEN

// Real field shape, matching JungleeResult in competition.ts (CONFIRMED VIA
// LIVE CALL comments in that file — brand/stars/reviewsCount/price/asin/
// features/breadCrumbs/importantInformation).
function realResult(overrides: Record<string, unknown> = {}) {
  return {
    asin:         'B000ASIN01',
    title:        'Magnesium Glycinate 200mg',
    brand:        'Nutricost',
    price:        { value: 19.99, currency: '$' },
    stars:        4.5,
    reviewsCount: 500,
    breadCrumbs:  'Health & Household > Vitamins, Minerals & Supplements > Minerals > Magnesium',
    features:     ['Contains 200mg Magnesium Glycinate per serving', 'Non-GMO'],
    ...overrides,
  }
}

function mockJungleeResponse(items: unknown[]) {
  return { ok: true, status: 200, json: async () => items } as Response
}

// Mocks the openFDA recalling_firm lookup (lib/regulatory-engine/manufacturer-credibility.ts)
// as "no recalls found" — real, honest empty response, not a guessed shape.
function mockOpenFdaEmpty() {
  return { ok: true, status: 200, json: async () => ({ results: [] }) } as Response
}

beforeEach(() => {
  process.env.APIFY_API_TOKEN = 'test-token'
  cacheGet.mockReset()
  cacheGet.mockResolvedValue(null)
  cacheSet.mockClear()
})
afterEach(() => {
  process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN
  vi.restoreAllMocks()
})

// Helper: wires global.fetch so the junglee actor call returns `items`, and
// any openFDA recall lookup returns an honest empty result.
function mockProviderResponses(items: unknown[]) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const u = String(url)
    if (u.includes('run-sync-get-dataset-items')) return mockJungleeResponse(items)
    if (u.includes('api.fda.gov')) return mockOpenFdaEmpty()
    throw new Error('unexpected URL: ' + u)
  })
}

// ── Finding 1: MIN_RESULTS gates on usable count, not raw count ────────────

describe('Finding 1 — MIN_RESULTS gates on the usable (withReviews) count', () => {
  it('returns null when raw item count clears MIN_RESULTS but usable count does not (real failure mode: brand field empty)', async () => {
    // 6 raw items (clears the old MIN_RESULTS=5 raw-count gate) but every
    // brand field is empty — the real, documented automation-lab-style
    // failure mode this file's own header comment describes.
    const items = Array.from({ length: 6 }, (_, i) =>
      realResult({ asin: `B0000000${i}`, brand: '', reviewsCount: 100 }),
    )
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).toBeNull()
  })

  it('succeeds when usable count clears MIN_RESULTS, even though raw count is only marginally higher', async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      realResult({ asin: `B0000000${i}` }),
    )
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).not.toBeNull()
    expect(result!.review_velocity).toBeDefined()
  })

  it('returns null (not a false-confident score) when raw count is high but usable count is below the floor', async () => {
    // 8 raw items, but only 3 have both reviewsCount>0 and a real brand —
    // below MIN_RESULTS=5 on the usable count.
    const items = [
      ...Array.from({ length: 3 }, (_, i) => realResult({ asin: `BGOOD000${i}` })),
      ...Array.from({ length: 5 }, (_, i) => realResult({ asin: `BBAD0000${i}`, brand: undefined, reviewsCount: undefined })),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).toBeNull()
  })
})

// ── Finding 3: ASIN-level dedupe ────────────────────────────────────────────

describe('Finding 3 — ASIN-level dedupe', () => {
  it('counts a sponsored + organic placement of the same real ASIN exactly once', async () => {
    const items = [
      // Sponsored placement of B0DUPE001 at position 1
      realResult({ asin: 'B0DUPE001', brand: 'Nutricost', reviewsCount: 1000 }),
      realResult({ asin: 'B0OTHER02', brand: 'Natrol',    reviewsCount: 300 }),
      realResult({ asin: 'B0OTHER03', brand: 'NOW Foods', reviewsCount: 250 }),
      realResult({ asin: 'B0OTHER04', brand: 'Nature Made', reviewsCount: 200 }),
      // Organic placement of the SAME real ASIN later in the SERP
      realResult({ asin: 'B0DUPE001', brand: 'Nutricost', reviewsCount: 1000 }),
      realResult({ asin: 'B0OTHER06', brand: 'Solgar', reviewsCount: 150 }),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal

    // 5 real distinct listings after dedupe (6 raw items, 1 duplicate ASIN removed).
    expect(rv.avg_review_count).toBeDefined()
    const asins = rv.top_competitors!.map(c => c.productId)
    // Deduped ASIN appears exactly once.
    expect(asins.filter(a => a === 'B0DUPE001').length).toBe(1)
    expect(asins.length).toBe(5)
  })

  it('keeps the first (earliest/highest-ranked) real occurrence, preserving its true SERP position', async () => {
    const items = [
      realResult({ asin: 'B0DUPE001', brand: 'Nutricost', reviewsCount: 1000 }), // position 1
      realResult({ asin: 'B0OTHER02', brand: 'Natrol', reviewsCount: 300 }),      // position 2
      realResult({ asin: 'B0OTHER03', brand: 'NOW Foods', reviewsCount: 250 }),   // position 3
      realResult({ asin: 'B0OTHER04', brand: 'Nature Made', reviewsCount: 200 }), // position 4
      realResult({ asin: 'B0OTHER05', brand: 'Solgar', reviewsCount: 150 }),      // position 5
      realResult({ asin: 'B0DUPE001', brand: 'Nutricost', reviewsCount: 1000 }),  // position 6 (dupe, dropped)
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal
    const kept = rv.top_competitors!.find(c => c.productId === 'B0DUPE001')
    expect(kept).toBeDefined()
    expect(kept!.position).toBe(1)
  })

  it('does not dedupe items that lack a real asin (nothing reliable to key on)', async () => {
    const items = [
      realResult({ asin: undefined, brand: 'Nutricost', reviewsCount: 500 }),
      realResult({ asin: undefined, brand: 'Natrol', reviewsCount: 300 }),
      realResult({ asin: 'B0OTHER03', brand: 'NOW Foods', reviewsCount: 250 }),
      realResult({ asin: 'B0OTHER04', brand: 'Nature Made', reviewsCount: 200 }),
      realResult({ asin: 'B0OTHER05', brand: 'Solgar', reviewsCount: 150 }),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal
    // All 5 (including the 2 asin-less ones) count toward meaningful competitors.
    expect(rv.meaningful_competitor_count).toBe(5)
  })
})

// ── Finding 4: currency validation ──────────────────────────────────────────

describe('Finding 4 — currency validated before trusting price as USD', () => {
  it('includes price when currency is the confirmed real "$" symbol', async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      realResult({ asin: `B000000${i}`, price: { value: 24.99, currency: '$' } }),
    )
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal
    expect(rv.top_competitors!.every(c => c.price === 24.99)).toBe(true)
  })

  it('drops price (excludes from top_competitors) for a non-USD currency rather than assuming', async () => {
    const items = [
      realResult({ asin: 'B0EUR0001', brand: 'Nutricost',   price: { value: 18.5, currency: '€' } }),
      realResult({ asin: 'B0USD0002', brand: 'Natrol' }),
      realResult({ asin: 'B0USD0003', brand: 'NOW Foods' }),
      realResult({ asin: 'B0USD0004', brand: 'Nature Made' }),
      realResult({ asin: 'B0USD0005', brand: 'Solgar' }),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal
    // The €-priced listing must never appear in top_competitors (price required, non-USD dropped).
    const asins = rv.top_competitors!.map(c => c.productId)
    expect(asins).not.toContain('B0EUR0001')
    // Still counted as a meaningful competitor (currency has no bearing on that).
    expect(rv.meaningful_competitor_count).toBe(5)
  })

  it('drops price when currency is entirely missing rather than assuming USD', async () => {
    const items = [
      realResult({ asin: 'B0NOCUR01', price: { value: 12.0 } }), // no currency field at all
      realResult({ asin: 'B0USD0002' }),
      realResult({ asin: 'B0USD0003' }),
      realResult({ asin: 'B0USD0004' }),
      realResult({ asin: 'B0USD0005' }),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal
    const asins = rv.top_competitors!.map(c => c.productId)
    expect(asins).not.toContain('B0NOCUR01')
  })

  it('accepts the real "USD" string form too', async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      realResult({ asin: `B000000${i}`, price: { value: 15.0, currency: 'USD' } }),
    )
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal
    expect(rv.top_competitors!.every(c => c.price === 15.0)).toBe(true)
  })
})

// ── End-to-end sanity: real shape still produces a full, correct signal ────

describe('CompetitionSignalProvider.fetch() — end-to-end with mocked fixtures', () => {
  it('computes a full review_velocity signal from a realistic 8-item response', async () => {
    const items = [
      realResult({ asin: 'B01', brand: 'Nutricost', reviewsCount: 5000, stars: 4.6 }),
      realResult({ asin: 'B02', brand: 'Natrol', reviewsCount: 3000, stars: 4.3 }),
      realResult({ asin: 'B03', brand: 'NOW Foods', reviewsCount: 2000, stars: 4.5 }),
      realResult({ asin: 'B04', brand: 'Nature Made', reviewsCount: 800, stars: 4.4 }),
      realResult({ asin: 'B05', brand: 'Solgar', reviewsCount: 400, stars: 4.2 }),
      realResult({ asin: 'B06', brand: 'Doctor\'s Best', reviewsCount: 150, stars: 4.1 }),
      realResult({ asin: 'B07', brand: 'Thorne', reviewsCount: 90, stars: 4.7 }),
      realResult({ asin: 'B08', brand: 'Pure Encapsulations', reviewsCount: 50, stars: 4.6 }),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    expect(result).not.toBeNull()
    const rv = result!.review_velocity as ReviewVelocitySignal
    expect(rv.score).toBeGreaterThanOrEqual(1)
    expect(rv.score).toBeLessThanOrEqual(10)
    expect(rv.confidence).toBeGreaterThan(0)
    expect(rv.top_competitors!.length).toBe(8)
    expect(rv.avg_rating).toBeDefined()
    expect(result!.provider).toBe('apify-amazon-search')
  })

  it('caches the computed result and returns the cached value on a subsequent call', async () => {
    const items = Array.from({ length: 5 }, (_, i) => realResult({ asin: `B0000000${i}` }))
    mockProviderResponses(items)

    await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    expect(cacheSet).toHaveBeenCalledTimes(1)
  })
})

// ── Finding 2 (revised, purely additive) — unlisted_competitor_safety_flags ─

describe('Finding 2 — unlisted_competitor_safety_flags (additive, top_competitors unchanged)', () => {
  it('(a) scans and flags a real asin+brand+features listing that has no price/stars, without adding it to top_competitors', async () => {
    const items = [
      // 4 normal, fully-priced/rated listings — clears MIN_RESULTS and
      // gives filteredResults enough real rows.
      realResult({ asin: 'B01', brand: 'Nutricost' }),
      realResult({ asin: 'B02', brand: 'Natrol' }),
      realResult({ asin: 'B03', brand: 'NOW Foods' }),
      realResult({ asin: 'B04', brand: 'Nature Made' }),
      // Real asin+brand+scannable-features listing, but NO price and NO
      // stars (e.g. temporarily out of stock) — excluded from
      // filteredResults, but has real DSHEA disease-claim language in its
      // own real features text.
      realResult({
        asin:         'B0OOS0001',
        brand:        'Solgar',
        price:        undefined,
        stars:        undefined,
        features:     ['Clinically shown to treat acne and reduce inflammation'],
      }),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal

    expect(rv.unlisted_competitor_safety_flags).toBeDefined()
    expect(rv.unlisted_competitor_safety_flags!.count).toBe(1)
    expect(typeof rv.unlisted_competitor_safety_flags!.note).toBe('string')
    expect(rv.unlisted_competitor_safety_flags!.note.length).toBeGreaterThan(0)

    // The out-of-stock listing must never appear in top_competitors (still
    // requires real stars+price+asin, unchanged).
    const asins = rv.top_competitors!.map(c => c.productId)
    expect(asins).not.toContain('B0OOS0001')
  })

  it('(b) produces no field (not a fabricated {count: 0}) when the excluded subset has zero real flags', async () => {
    const items = [
      realResult({ asin: 'B01', brand: 'Nutricost' }),
      realResult({ asin: 'B02', brand: 'Natrol' }),
      realResult({ asin: 'B03', brand: 'NOW Foods' }),
      realResult({ asin: 'B04', brand: 'Nature Made' }),
      // Real asin+brand+scannable-features listing missing price/stars,
      // but its real feature text has NO disease-claim language and its
      // brand has no real recall history (mocked openFDA = empty).
      realResult({
        asin:         'B0OOS0002',
        brand:        'Solgar',
        price:        undefined,
        stars:        undefined,
        features:     ['Non-GMO', 'Gluten Free', 'Made in the USA'],
      }),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal

    expect(rv.unlisted_competitor_safety_flags).toBeUndefined()
  })

  it('(b2) produces no field when there is no excluded subset at all (every real listing has price+stars)', async () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      realResult({ asin: `B000000${i}`, brand: `Brand${i}` }),
    )
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal
    expect(rv.unlisted_competitor_safety_flags).toBeUndefined()
  })

  it('(c) top_competitors[] existing shape/fields are completely unchanged', async () => {
    const items = [
      realResult({ asin: 'B01', brand: 'Nutricost', reviewsCount: 500, stars: 4.5, price: { value: 19.99, currency: '$' } }),
      realResult({ asin: 'B02', brand: 'Natrol' }),
      realResult({ asin: 'B03', brand: 'NOW Foods' }),
      realResult({ asin: 'B04', brand: 'Nature Made' }),
      realResult({
        asin: 'B0OOS0003', brand: 'Solgar', price: undefined, stars: undefined,
        features: ['Clinically shown to treat acne and reduce inflammation'],
      }),
    ]
    mockProviderResponses(items)

    const result = await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })
    const rv = result!.review_velocity as ReviewVelocitySignal

    const b01 = rv.top_competitors!.find(c => c.productId === 'B01')!
    expect(b01).toEqual(expect.objectContaining({
      productId:   'B01',
      brand:       'Nutricost',
      reviewCount: 500,
      rating:      4.5,
      price:       19.99,
    }))
    // rating/price are still real, required `number` values — same as before.
    expect(typeof b01.rating).toBe('number')
    expect(typeof b01.price).toBe('number')
    // Exactly 4 real, fully-priced/rated listings in top_competitors —
    // the out-of-stock one is still excluded from this array.
    expect(rv.top_competitors!.length).toBe(4)
  })

  it('(d) efficiency fix: issues exactly one openFDA recall lookup for a brand shared across filteredResults and excludedScanEligible, not two', async () => {
    const items = [
      // Priced/rated listing for "Solgar" — lands in filteredResults.
      realResult({ asin: 'B01', brand: 'Solgar' }),
      realResult({ asin: 'B02', brand: 'Natrol' }),
      realResult({ asin: 'B03', brand: 'NOW Foods' }),
      realResult({ asin: 'B04', brand: 'Nature Made' }),
      // Out-of-stock listing for the SAME "Solgar" brand — lands in
      // excludedScanEligible. Before the fix, this brand's recall history
      // was fetched by two independent batch calls; now it must be exactly
      // one shared lookup.
      realResult({
        asin: 'B0OOS0004', brand: 'Solgar', price: undefined, stars: undefined,
        features: ['Clinically shown to treat acne and reduce inflammation'],
      }),
    ]
    const fetchSpy = mockProviderResponses(items)

    await new CompetitionSignalProvider().fetch({ query: 'magnesium glycinate' })

    // 4 distinct real brands total (Solgar, Natrol, NOW Foods, Nature
    // Made) → 4 total openFDA calls is correct (one per UNIQUE brand).
    // What matters here is that "Solgar" — the brand shared by a
    // filteredResults listing AND an excludedScanEligible listing — was
    // looked up exactly ONCE, not twice.
    const openFdaCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('api.fda.gov'))
    const solgarCalls  = openFdaCalls.filter(c => String(c[0]).includes('Solgar'))
    expect(solgarCalls.length).toBe(1)
    expect(openFdaCalls.length).toBe(4)
  })
})
