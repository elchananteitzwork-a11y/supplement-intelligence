// Regression tests for 3 audit-confirmed correctness bugs in
// lib/manufacturing-engine/providers/apify.ts (data-integrity bug-fix task,
// not a feature/refactor — see the "BUGFIX (2026-07-18, Finding N)" comments
// in apify.ts itself for full rationale on each). No live Apify calls —
// global.fetch is mocked throughout with fixtures shaped exactly like the
// real, live-confirmed xtracto/alibaba-search-scraper actor output:
//   {"query":"...", "page":1, "productId":"...", "title":"...", "url":"...",
//    "priceFormatted":"$3.50 - $4.20", "minOrderQuantity":"5",
//    "minOrderUnit":"pieces", "companyId":"...", "companyName":"...",
//    "companyHomeUrl":"...", "countryCode":"CN", "goldSupplierYears":"11 yrs",
//    "tradeAssurance":false, "mainImage":"...", "scrapedAt":"..."}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApifyProvider } from '../providers/apify'
import type { ManufacturingRequest } from '../types'

const ORIGINAL_TOKEN = process.env.APIFY_API_TOKEN

// Real field shape, matching the confirmed actor output quoted above.
function realProduct(overrides: Record<string, unknown> = {}) {
  return {
    query:             'magnesium glycinate OEM private label capsule manufacturer',
    page:              1,
    productId:         'p-001',
    title:             'Magnesium Glycinate Capsules OEM',
    url:               'https://alibaba.com/product/p-001',
    priceFormatted:    '$3.50 - $4.20',
    minOrderQuantity:  '5',
    minOrderUnit:      'pieces',
    companyId:         'c-001',
    companyName:       'Alpha Manufacturing Co',
    companyHomeUrl:    'https://alibaba.com/company/c-001',
    countryCode:       'CN',
    goldSupplierYears: '11 yrs',
    tradeAssurance:    false,
    mainImage:         'https://example.com/img.jpg',
    scrapedAt:         new Date().toISOString(),
    ...overrides,
  }
}

function mockApifyResponse(items: unknown[]) {
  return vi.spyOn(global, 'fetch').mockResolvedValue(
    { ok: true, status: 200, json: async () => items } as Response,
  )
}

const REQ: ManufacturingRequest = {
  product:    'Magnesium Glycinate',
  category:   'supplements',
  complexity: 'Medium',
}

beforeEach(() => {
  process.env.APIFY_API_TOKEN = 'test-token'
})
afterEach(() => {
  process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN
  vi.restoreAllMocks()
})

// ── Finding 2: minOrderUnit is read directly, not guessed ──────────────────

describe('Finding 2 — MOQ unit reads the real minOrderUnit field', () => {
  it('uses minOrderUnit ("bags") instead of falling back to the generic "units" label', async () => {
    mockApifyResponse([
      realProduct({ companyName: 'Alpha Manufacturing Co', minOrderQuantity: '500', minOrderUnit: 'bags' }),
      realProduct({ companyName: 'Beta Corp',              minOrderQuantity: '1000', minOrderUnit: 'bags' }),
      realProduct({ companyName: 'Gamma Industries',       minOrderQuantity: '200', minOrderUnit: 'bags' }),
    ])

    const result = await new ApifyProvider().fetch(REQ)

    expect(result).not.toBeNull()
    // Real minOrderQuantity is a bare number string ("500") with no unit to
    // split out — the old code guessed the unit by splitting that string and
    // always fell back to 'units'. The real unit must come from minOrderUnit.
    expect(result!.moq?.unit).toBe('bags')
  })

  it('falls back to guessing from minOrderQuantity when minOrderUnit is genuinely absent', async () => {
    mockApifyResponse([
      realProduct({ companyName: 'Alpha Manufacturing Co', minOrderQuantity: '500 sets', minOrderUnit: undefined }),
      realProduct({ companyName: 'Beta Corp',              minOrderQuantity: '1000 sets', minOrderUnit: undefined }),
      realProduct({ companyName: 'Gamma Industries',       minOrderQuantity: '200 sets', minOrderUnit: undefined }),
    ])

    const result = await new ApifyProvider().fetch(REQ)

    expect(result).not.toBeNull()
    expect(result!.moq?.unit).toBe('sets')
  })

  it('treats minOrderUnit: "" as absent and falls back to guessing from minOrderQuantity, not the generic "units" label', async () => {
    // Regression for a `??`-vs-truthiness bug: `??` only falls through on
    // null/undefined, so a real actor response shaped as `minOrderUnit: ""`
    // (rather than omitting the key) must still hit the minOrderQuantity
    // fallback below, not silently short-circuit to 'units'.
    mockApifyResponse([
      realProduct({ companyName: 'Alpha Manufacturing Co', minOrderQuantity: '500 sets', minOrderUnit: '' }),
      realProduct({ companyName: 'Beta Corp',              minOrderQuantity: '1000 sets', minOrderUnit: '   ' }),
      realProduct({ companyName: 'Gamma Industries',       minOrderQuantity: '200 sets', minOrderUnit: '' }),
    ])

    const result = await new ApifyProvider().fetch(REQ)

    expect(result).not.toBeNull()
    expect(result!.moq?.unit).toBe('sets')
  })
})

// ── Finding 3: supplier_count and confidence use deduped supplier identity ──

describe('Finding 3 — supplier_count / confidence dedupe by companyName', () => {
  it('reports the distinct supplier count, not the raw listing count, when one supplier has many listings', async () => {
    // 4 listings, but only 2 distinct companies — a single supplier
    // (Alpha) posted 3 listings.
    mockApifyResponse([
      realProduct({ companyName: 'Alpha Manufacturing Co' }),
      realProduct({ companyName: 'Alpha Manufacturing Co' }),
      realProduct({ companyName: 'Alpha Manufacturing Co' }),
      realProduct({ companyName: 'Beta Corp' }),
    ])

    const result = await new ApifyProvider().fetch(REQ)

    expect(result).not.toBeNull()
    // Raw listing count is 4 — the old buggy behavior. Real distinct
    // supplier count is 2.
    expect(result!.supplier_count?.estimate).toBe(2)
  })

  it('computes confidence from the deduped supplier count, not the raw listing count', async () => {
    // Same 4 listings / 2 distinct suppliers as above, with no supplierScore
    // or goldSupplierYears (topRating() = null, so ratingScore = 0), and no
    // priceFormatted range large enough to push priceScore off its floor —
    // isolates the supplyScore term of scoreConfidence(). With the raw
    // listing count (4), supplyScore's `total >= 3` threshold is met (+0.1).
    // With the correct deduped count (2), it is not (+0).
    mockApifyResponse([
      realProduct({ companyName: 'Alpha Manufacturing Co', goldSupplierYears: undefined }),
      realProduct({ companyName: 'Alpha Manufacturing Co', goldSupplierYears: undefined }),
      realProduct({ companyName: 'Alpha Manufacturing Co', goldSupplierYears: undefined }),
      realProduct({ companyName: 'Beta Corp',              goldSupplierYears: undefined }),
    ])

    const result = await new ApifyProvider().fetch(REQ)

    expect(result).not.toBeNull()
    // priced=4 -> priceScore 0.15; deduped supplier count=2 -> supplyScore 0
    // (would be 0.1 under the old raw-count-of-4 bug); no ratings -> 0.
    expect(result!.confidence).toBeCloseTo(0.15, 5)
  })

  it('counts unnamed listings individually rather than collapsing them together', async () => {
    mockApifyResponse([
      realProduct({ companyName: 'Alpha Manufacturing Co' }),
      realProduct({ companyName: undefined }),
      realProduct({ companyName: undefined }),
    ])

    const result = await new ApifyProvider().fetch(REQ)

    expect(result).not.toBeNull()
    // 1 named distinct supplier + 2 unnamed listings counted individually = 3
    expect(result!.supplier_count?.estimate).toBe(3)
  })
})

// ── Finding 4: lead_time_days provenance is distinguishable from real data ──

describe('Finding 4 — lead_time_source marks the category-estimate provenance', () => {
  it('marks lead_time_days as a category_estimate, distinct from real scraped fields', async () => {
    mockApifyResponse([
      realProduct({ companyName: 'Alpha Manufacturing Co' }),
    ])

    const result = await new ApifyProvider().fetch(REQ)

    expect(result).not.toBeNull()
    expect(result!.lead_time_days).toEqual({ low: 45, high: 90 })
    expect(result!.lead_time_source).toBe('category_estimate')
    // Sanity check: this field is NOT the same provenance as data_source,
    // which correctly stays 'apify' for the fields that ARE real.
    expect(result!.data_source).toBe('apify')
  })
})
