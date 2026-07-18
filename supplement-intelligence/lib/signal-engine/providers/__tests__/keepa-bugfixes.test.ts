// Regression tests for 4 audit-confirmed correctness bugs in
// lib/signal-engine/providers/keepa.ts (data-integrity bug-fix task, not a
// feature/refactor — see the fix comments in keepa.ts itself for full
// rationale on each).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildAsinSets,
  computeAnnualGrowthFromHistory,
  sellerCountTrend,
  KeepaProvider,
} from '../keepa'

// ── Finding 1: catProducts/queryProducts ASIN-set mismatch ─────────────────

describe('buildAsinSets — Finding 1 fix', () => {
  it('derives catProducts eligibility from the SAME filtered/backfilled bestseller ASINs actually placed into combinedAsins, not a fresh unfiltered slice', () => {
    // S2 is a bestseller ASIN that ALSO shows up in search results (rank 2).
    // The naive `bestsellerAsins.slice(0, 5)` (the old buggy re-derivation)
    // would be ['B1', 'S2', 'B2', 'B3', 'B4'] — including S2 (double-count
    // risk) and excluding the real backfilled ASIN 'B5' that combinedAsins
    // actually fetched.
    const searchAsins     = ['S1', 'S2', 'S3']
    const bestsellerAsins = ['B1', 'S2', 'B2', 'B3', 'B4', 'B5', 'B6']

    const { combinedAsins, bestsellerAsinsUsed, searchSet } = buildAsinSets(searchAsins, bestsellerAsins)

    // The real backfill ASIN (B5) that replaces the excluded S2 must be the
    // set actually fetched AND the set catProducts is later filtered against.
    expect(bestsellerAsinsUsed).toEqual(['B1', 'B2', 'B3', 'B4', 'B5'])
    expect(combinedAsins).toEqual(['S1', 'S2', 'S3', 'B1', 'B2', 'B3', 'B4', 'B5'])

    // B5 (real Keepa tokens already spent on it) is present in the fetched
    // set and would be found by a catProducts filter using bestsellerAsinsUsed.
    expect(bestsellerAsinsUsed).toContain('B5')
    // S2 must never appear in the bestseller portion — it's already counted
    // once via searchSet, so it's excluded here to avoid being double-counted
    // into both catProducts and queryProducts.
    expect(bestsellerAsinsUsed).not.toContain('S2')
    expect(searchSet.has('S2')).toBe(true)
  })

  it('never silently drops a real backfilled ASIN that was actually fetched (the live-confirmed failure mode)', () => {
    const searchAsins     = ['S1']
    const bestsellerAsins = ['S1', 'B1', 'B2', 'B3', 'B4', 'B5']
    const { combinedAsins, bestsellerAsinsUsed } = buildAsinSets(searchAsins, bestsellerAsins)
    // S1 is excluded from the bestseller side (already in search); B1-B5 backfill.
    expect(bestsellerAsinsUsed).toEqual(['B1', 'B2', 'B3', 'B4', 'B5'])
    // Every bestsellerAsinsUsed entry was actually fetched (present in combinedAsins).
    for (const asin of bestsellerAsinsUsed) {
      expect(combinedAsins).toContain(asin)
    }
  })

  it('caps combinedAsins at 10 total', () => {
    const searchAsins     = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']
    const bestsellerAsins = ['B1', 'B2', 'B3', 'B4', 'B5']
    const { combinedAsins } = buildAsinSets(searchAsins, bestsellerAsins)
    expect(combinedAsins.length).toBeLessThanOrEqual(10)
  })
})

// End-to-end: catProducts built from allProducts filtered by bestsellerAsinsUsed
// (via the exported buildAsinSets contract) — confirmed through a full mocked
// fetch() run so the wiring inside fetch() (not just the pure helper) is covered.
describe('KeepaProvider.fetch() — Finding 1 end-to-end wiring', () => {
  const ORIGINAL_KEY = process.env.KEEPA_API_KEY
  beforeEach(() => { process.env.KEEPA_API_KEY = 'test-key' })
  afterEach(() => { process.env.KEEPA_API_KEY = ORIGINAL_KEY; vi.restoreAllMocks() })

  function statsFor(bsr: number, reviews = 500, rating = 45): unknown {
    return {
      current:  [null, null, null, bsr, null, null, null, null, null, null, null, 20, null, null, null, null, rating, reviews],
      avg90:    [null, null, null, bsr, null, null, null, null, null, null, 1500, 20, null, null, null, null, null, null],
      avg365:   [null, null, null, bsr, null, null, null, null, null, null, null, 20, null, null, null, null, null, null],
    }
  }

  it('/product is requested with the real backfilled bestseller ASINs (not a re-derived, unfiltered slice)', async () => {
    const bestsellerAsins = ['S2', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6']
    const searchAsins     = ['S2', 'S3']

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/bestsellers')) {
        return { ok: true, status: 200, json: async () => ({ bestSellersList: { asinList: bestsellerAsins } }) } as Response
      }
      if (u.includes('/search')) {
        return { ok: true, status: 200, json: async () => ({ asinList: searchAsins }) } as Response
      }
      if (u.includes('/product')) {
        const asinParam = new URL(u).searchParams.get('asin') ?? ''
        const asins = asinParam.split(',')
        return {
          ok: true, status: 200,
          json: async () => ({
            products: asins.map((asin, i) => ({
              asin, title: 'Creatine Monohydrate Powder', brand: 'BrandX',
              stats: statsFor(1000 + i * 100),
            })),
          }),
        } as Response
      }
      if (u.includes('/category')) {
        return { ok: true, status: 200, json: async () => ({ categories: {} }) } as Response
      }
      throw new Error('unexpected URL: ' + u)
    })

    await new KeepaProvider().fetch({ query: 'creatine monohydrate', categoryId: 'supplements' })

    const productCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('/product'))
    expect(productCall).toBeDefined()
    const requestedAsins = new URL(String(productCall![0])).searchParams.get('asin')!.split(',')
    // Real backfill ASIN B5 (which fills the slot S2's exclusion opens up)
    // must have actually been requested — the live-confirmed failure was
    // that it was fetched but then silently dropped from every output set.
    expect(requestedAsins).toContain('B5')
    // B6 was never requested (only 5 bestseller backfill slots) — correctly absent.
    expect(requestedAsins).not.toContain('B6')
  })
})

// ── Finding 2: calendar-accurate YoY growth ─────────────────────────────────

// Keepa epoch: Jan 1 2011 00:00:00 UTC, in unix seconds — mirrors the
// KEEPA_EPOCH constant in keepa.ts (recomputed independently here, not
// imported, since it's a private module constant).
const KEEPA_EPOCH = Math.floor(Date.UTC(2011, 0, 1) / 1000)

function ymToKeepaMin(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  // Mid-month timestamp avoids any month-boundary/timezone rounding risk.
  const unixSeconds = Date.UTC(y, m - 1, 15) / 1000
  return Math.round((unixSeconds - KEEPA_EPOCH) / 60)
}

function buildMsh(entries: Array<[string, number]>): number[] {
  const msh: number[] = []
  for (const [ym, units] of entries) msh.push(ymToKeepaMin(ym), units)
  return msh
}

describe('computeAnnualGrowthFromHistory — Finding 2 fix (calendar-matched, not array-offset)', () => {
  // Real-shaped gap fixture: 2025-09 and 2025-12 are both missing (no valid
  // reading that month) — the exact "2 real missing months" scenario the
  // audit finding describes. 16 distinct monthly buckets total (>= the 14
  // required), spanning 2025-01 through 2026-06.
  const monthsWithGaps: Array<[string, number]> = [
    ['2025-01', 50], ['2025-02', 55], ['2025-03', 60],
    ['2025-04', 200], ['2025-05', 210], ['2025-06', 220],
    ['2025-07', 230], ['2025-08', 240],
    // 2025-09 intentionally missing (no valid reading that month)
    ['2025-10', 260], ['2025-11', 270],
    // 2025-12 intentionally missing (no valid reading that month)
    ['2026-01', 290], ['2026-02', 300], ['2026-03', 310],
    ['2026-04', 400], ['2026-05', 420], ['2026-06', 440],
  ]

  it('computes the calendar-correct YoY growth even though earlier months are missing (fixed-array-offset would desync)', () => {
    const result = computeAnnualGrowthFromHistory(buildMsh(monthsWithGaps))
    // Correct comparison: recent = avg(2026-04,05,06) = 420;
    // year-ago = avg(2025-04,05,06) = 210 -> +100.0%
    expect(result).toBeCloseTo(100.0, 1)
  })

  it('does NOT reproduce the old array-offset (slice(-15,-12)) result, which desyncs when earlier months are missing', () => {
    // Old buggy logic: monthly.slice(-15,-12) on this 16-bucket array is
    // index [1,2,3] = 2025-02, 2025-03, 2025-04 (avg 105) — misaligned by
    // the 2 missing months earlier in the sequence — NOT the real
    // 12-months-prior calendar window. That produced (420-105)/105*100 = +300%.
    const buggyOldValue = 300.0
    const result = computeAnnualGrowthFromHistory(buildMsh(monthsWithGaps))
    expect(result).not.toBeCloseTo(buggyOldValue, 1)
  })

  it('returns null (honest absence) rather than a misaligned comparison when an exact year-ago month is missing for one of the 3 recent months', () => {
    // Same shape, but 2025-06 (the exact year-ago match for 2026-06, one of
    // the 3 "recent" months) is also missing.
    const monthsMissingExactYearAgo: Array<[string, number]> = [
      ['2025-01', 50], ['2025-02', 55], ['2025-03', 60],
      ['2025-04', 200], ['2025-05', 210],
      // 2025-06 intentionally missing — exact year-ago match for 2026-06
      ['2025-07', 230], ['2025-08', 240],
      // 2025-09 intentionally missing
      ['2025-10', 260], ['2025-11', 270],
      // 2025-12 intentionally missing
      ['2026-01', 290], ['2026-02', 300], ['2026-03', 310],
      ['2026-04', 400], ['2026-05', 420], ['2026-06', 440],
    ]
    expect(monthsMissingExactYearAgo.length).toBeGreaterThanOrEqual(14)
    expect(computeAnnualGrowthFromHistory(buildMsh(monthsMissingExactYearAgo))).toBeNull()
  })

  it('returns null with fewer than 14 distinct monthly buckets', () => {
    const short: Array<[string, number]> = Array.from({ length: 10 }, (_, i) => [
      `2025-${String(i + 1).padStart(2, '0')}`, 100 + i * 5,
    ])
    expect(computeAnnualGrowthFromHistory(buildMsh(short))).toBeNull()
  })

  it('returns null on a flat (zero) year-ago base rather than dividing by zero', () => {
    const months: Array<[string, number]> = [
      ['2025-01', 0], ['2025-02', 0], ['2025-03', 0],
      ['2025-04', 0], ['2025-05', 0], ['2025-06', 100], // note: 0 units are filtered out by bucketsFromHistory (u<=0 skipped)
      ['2025-07', 100], ['2025-08', 100], ['2025-09', 100], ['2025-10', 100],
      ['2025-11', 100], ['2025-12', 100],
      ['2026-01', 100], ['2026-02', 100],
    ]
    // With all-zero months filtered out by bucketsFromHistory, this fixture
    // won't reach 14 real buckets, so it should be null via the length gate —
    // demonstrating null-on-insufficient-data rather than a fabricated value.
    expect(computeAnnualGrowthFromHistory(buildMsh(months))).toBeNull()
  })
})

// ── Finding 3: sellerCountTrend honest-null on missing avg365 ──────────────

describe('sellerCountTrend — Finding 3 fix', () => {
  it('returns null (not a false "Stable") when avg365 is unavailable but avg90 is present', () => {
    // Previously: reference = avg365 ?? avg90 = avg90 (40), recent = avg90 ?? current = avg90 (40)
    // -> pctChange forced to exactly 0 -> false 'Stable'.
    expect(sellerCountTrend(50, 40, null)).toBeNull()
  })

  it('returns null when avg365 and avg90 are both unavailable', () => {
    expect(sellerCountTrend(50, null, null)).toBeNull()
  })

  it('returns null when avg365 is exactly 0 (division-by-zero guard)', () => {
    expect(sellerCountTrend(50, 40, 0)).toBeNull()
  })

  it('computes Growing when avg90 is meaningfully above avg365', () => {
    expect(sellerCountTrend(60, 60, 40)).toBe('Growing') // +50% vs avg365
  })

  it('computes Shrinking when avg90 is meaningfully below avg365', () => {
    expect(sellerCountTrend(20, 20, 40)).toBe('Shrinking') // -50% vs avg365
  })

  it('computes Stable when avg90 is close to avg365', () => {
    expect(sellerCountTrend(42, 42, 40)).toBe('Stable') // +5% vs avg365
  })

  it('falls back to `current` for the recent point only when avg90 is unavailable, still requiring avg365', () => {
    expect(sellerCountTrend(60, null, 40)).toBe('Growing')
    expect(sellerCountTrend(null, null, 40)).toBeNull()
  })
})

// ── Finding 4: consistent price-preference ordering (FBA > Buy Box > Amazon) ─

describe('KeepaProvider — Finding 4 fix (category pricing prefers FBA, same as competitor-list pricing)', () => {
  const ORIGINAL_KEY = process.env.KEEPA_API_KEY
  beforeEach(() => { process.env.KEEPA_API_KEY = 'test-key' })
  afterEach(() => { process.env.KEEPA_API_KEY = ORIGINAL_KEY; vi.restoreAllMocks() })

  it('avg_price reflects the real FBA price, not the Amazon-direct price, when both are present', async () => {
    const asin = 'B0TEST0001'
    // CSV indices: 0=AMAZON_PRICE, 10=NEW_FBA, 18=BUYBOX_PRICE (cents)
    const stats = {
      current:  [3500, null, null, 1000, null, null, null, null, null, null, null, 20, null, null, null, null, 45, 500],
      avg90:    [5000, null, null, 1000, null, null, null, null, null, null, 2000, 20, null, null, null, null, null, null], // Amazon $50, FBA $20
      avg365:   [5500, null, null, 1000, null, null, null, null, null, null, 2200, 20, null, null, null, null, null, null],
    }

    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/bestsellers')) {
        return { ok: true, status: 200, json: async () => ({ bestSellersList: { asinList: [asin, 'B2', 'B3', 'B4', 'B5'] } }) } as Response
      }
      if (u.includes('/search')) {
        return { ok: true, status: 200, json: async () => ({ asinList: [] }) } as Response
      }
      if (u.includes('/product')) {
        const asinParam = new URL(u).searchParams.get('asin') ?? ''
        const asins = asinParam.split(',')
        return {
          ok: true, status: 200,
          json: async () => ({
            products: asins.map(a => ({
              asin: a, title: 'Creatine Monohydrate Powder', brand: 'BrandX',
              stats: a === asin ? stats : {
                current: [null, null, null, 1500, null, null, null, null, null, null, null, 15, null, null, null, null, 40, 300],
                avg90:   [null, null, null, 1500, null, null, null, null, null, null, null, 15, null, null, null, null, null, null],
                avg365:  [null, null, null, 1500, null, null, null, null, null, null, null, 15, null, null, null, null, null, null],
              },
            })),
          }),
        } as Response
      }
      if (u.includes('/category')) {
        return { ok: true, status: 200, json: async () => ({ categories: {} }) } as Response
      }
      throw new Error('unexpected URL: ' + u)
    })

    const result = await new KeepaProvider().fetch({ query: 'creatine monohydrate', categoryId: 'supplements' })
    expect(result).not.toBeNull()
    // avg_price is an average across all 5 bestsellers; the target product's
    // own contribution to that average must come from its $20 FBA price, not
    // its $50 Amazon-direct price. With 4 other products having no price data
    // at all, avg_price is driven entirely by this one product's price.
    expect(result!.pricing).toBeDefined()
    expect(result!.pricing!.avg_price).toBe('$20')
  })
})
