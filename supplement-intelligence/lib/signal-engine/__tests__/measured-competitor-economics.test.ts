// Tests for the item-ב pure helpers (docs/RD_V4_NICHE_COMPETITOR_ECONOMICS.md).
// The fixtures mirror the real 2026-07-27 live-probe shapes that motivated
// each guard: the Midol/OTC contamination case, The Missing Link size-variant
// double count, and the n=1 suppression rule.

import { describe, it, expect } from 'vitest'
import {
  filterToDominantCategory,
  dedupeByBrand,
  buildCompetitorRevenueTable,
  type MeasuredCompetitorInput,
} from '../measured-competitor-economics'

const SUPPLEMENTS_CAT = 3760901 // arbitrary stand-ins for real catIds
const OTC_MEDS_CAT    = 3760931

function input(over: Partial<MeasuredCompetitorInput>): MeasuredCompetitorInput {
  return {
    productId: 'B000000000', brand: 'BrandA', price: 20, monthlySold: 1000,
    categoryLevel1Id: SUPPLEMENTS_CAT,
    reviewCount: null, listingAgeMonths: null,
    ...over,
  }
}

describe('filterToDominantCategory (guard 1 — the Midol case)', () => {
  it('excludes minority-category products and counts them', () => {
    const products = [
      ...[1, 2, 3, 4, 5, 6, 7].map(i => input({ productId: `B${i}`, categoryLevel1Id: SUPPLEMENTS_CAT })),
      input({ productId: 'MIDOL', brand: 'Midol', categoryLevel1Id: OTC_MEDS_CAT }),
      input({ productId: 'PAMPRIN', brand: 'Pamprin', categoryLevel1Id: OTC_MEDS_CAT }),
    ]
    const { kept, excludedCount } = filterToDominantCategory(products)
    expect(kept).toHaveLength(7)
    expect(excludedCount).toBe(2)
    expect(kept.every(p => p.categoryLevel1Id === SUPPLEMENTS_CAT)).toBe(true)
  })

  it('keeps products with a null category id (missing data is not evidence of off-category)', () => {
    const products = [
      input({ productId: 'B1' }), input({ productId: 'B2' }),
      input({ productId: 'B3', categoryLevel1Id: null }),
      input({ productId: 'X', categoryLevel1Id: OTC_MEDS_CAT }),
    ]
    const { kept, excludedCount } = filterToDominantCategory(products)
    expect(kept.map(p => p.productId)).toEqual(['B1', 'B2', 'B3'])
    expect(excludedCount).toBe(1)
  })

  it('a tie keeps every tied category (nothing excluded on a coin flip)', () => {
    const products = [
      input({ productId: 'B1' }), input({ productId: 'B2' }),
      input({ productId: 'X1', categoryLevel1Id: OTC_MEDS_CAT }),
      input({ productId: 'X2', categoryLevel1Id: OTC_MEDS_CAT }),
    ]
    const { kept, excludedCount } = filterToDominantCategory(products)
    expect(kept).toHaveLength(4)
    expect(excludedCount).toBe(0)
  })

  it('a single-category (or all-null) set passes through untouched', () => {
    const products = [input({ productId: 'B1' }), input({ productId: 'B2', categoryLevel1Id: null })]
    expect(filterToDominantCategory(products)).toEqual({ kept: products, excludedCount: 0 })
  })
})

describe('dedupeByBrand (guard 2 — The Missing Link 1lb/5lb case)', () => {
  it('keeps only the highest-monthlySold listing per brand', () => {
    const products = [
      input({ productId: '1LB', brand: 'The Missing Link', monthlySold: 1000 }),
      input({ productId: '5LB', brand: 'The Missing Link', monthlySold: 200 }),
      input({ productId: 'OTHER', brand: 'Native Pet', monthlySold: 800 }),
    ]
    const deduped = dedupeByBrand(products)
    expect(deduped.map(p => p.productId).sort()).toEqual(['1LB', 'OTHER'])
  })

  it('brand matching is case/whitespace-insensitive', () => {
    const products = [
      input({ productId: 'A', brand: 'Jacked Factory', monthlySold: 100 }),
      input({ productId: 'B', brand: '  jacked factory ', monthlySold: 900 }),
    ]
    expect(dedupeByBrand(products).map(p => p.productId)).toEqual(['B'])
  })

  it('brandless listings never collapse into each other', () => {
    const products = [
      input({ productId: 'A', brand: '', monthlySold: 100 }),
      input({ productId: 'B', brand: '', monthlySold: 200 }),
    ]
    expect(dedupeByBrand(products)).toHaveLength(2)
  })
})

describe('buildCompetitorRevenueTable', () => {
  it('returns null below 2 measured rows (the n=1 trap)', () => {
    expect(buildCompetitorRevenueTable([input({ productId: 'ONLY' })])).toBeNull()
    // 2 products but only 1 measured on both axes → still null
    expect(buildCompetitorRevenueTable([
      input({ productId: 'A' }),
      input({ productId: 'B', brand: 'BrandB', monthlySold: null }),
    ])).toBeNull()
    expect(buildCompetitorRevenueTable([])).toBeNull()
  })

  it('computes rows sorted by revenue desc, with floor arithmetic and aggregates', () => {
    const table = buildCompetitorRevenueTable([
      input({ productId: 'SMALL', brand: 'Small Brand', price: 25, monthlySold: 300 }),   // $7,500
      input({ productId: 'BIG', brand: 'Big Brand', price: 37, monthlySold: 20000 }),      // $740,000
      input({ productId: 'MID', brand: 'Mid Brand', price: 30, monthlySold: 3000 }),       // $90,000
      input({ productId: 'NO_PRICE', brand: 'Priceless', price: null, monthlySold: 5000 }), // dropped
    ])!
    expect(table).not.toBeNull()
    expect(table.rows.map(r => r.productId)).toEqual(['BIG', 'MID', 'SMALL'])
    expect(table.rows[0].est_monthly_revenue_mo).toBe(740_000)
    expect(table.measured_revenue_total_mo).toBe(740_000 + 90_000 + 7_500)
    expect(table.revenue_concentration_top1).toBeCloseTo(740_000 / 837_500, 2)
    expect(table.off_category_excluded_count).toBe(0)
  })

  it('applies both guards before the ≥2 floor: excluded + deduped products cannot rescue a thin table', () => {
    // After excluding the OTC product and merging the brand pair, only 1
    // measured competitor remains → null, not a fake 2-row table.
    const table = buildCompetitorRevenueTable([
      input({ productId: '1LB', brand: 'Same Brand', monthlySold: 1000 }),
      input({ productId: '5LB', brand: 'Same Brand', monthlySold: 200 }),
      input({ productId: 'MIDOL', brand: 'Midol', categoryLevel1Id: OTC_MEDS_CAT }),
    ])
    expect(table).toBeNull()
  })

  it('reports the off-category exclusion count on a real table', () => {
    const table = buildCompetitorRevenueTable([
      input({ productId: 'A', brand: 'A' }),
      input({ productId: 'B', brand: 'B' }),
      input({ productId: 'C', brand: 'C' }),
      input({ productId: 'MIDOL', brand: 'Midol', categoryLevel1Id: OTC_MEDS_CAT }),
    ])!
    expect(table.rows).toHaveLength(3)
    expect(table.off_category_excluded_count).toBe(1)
  })
})

// ── Entry Proof — docs/RD_ENTRY_PROOF.md ────────────────────────────────────
import {
  detectEntryProof,
  ENTRY_PROOF_ESTABLISHED_REVIEW_BASE,
  type CompetitorRevenueRow,
  type BrandReviewBase,
} from '../measured-competitor-economics'

function row(over: Partial<CompetitorRevenueRow>): CompetitorRevenueRow {
  const price = over.price ?? 25
  const sold  = over.monthly_sold ?? 1000
  return {
    productId: 'B00ROW', brand: 'BrandA', price, monthly_sold: sold,
    est_monthly_revenue_mo: Math.round(price * sold),
    review_count: 1000, listing_age_months: 60,
    ...over,
  }
}

describe('detectEntryProof (Entry Proof headline — emphasis only, never exclusion)', () => {
  // A classic niche: an entrenched leader with a huge review base, a
  // disproportionate low-review newcomer moving real volume, and mid-pack.
  const NICHE: CompetitorRevenueRow[] = [
    row({ productId: 'LEADER',   brand: 'BigLeader', review_count: 20_000, monthly_sold: 5000 }),
    row({ productId: 'NEWCOMER', brand: 'FreshCo',   review_count: 45,     monthly_sold: 3000, listing_age_months: 8 }),
    row({ productId: 'MID1',     brand: 'MidBrand',  review_count: 4000,   monthly_sold: 2000 }),
    row({ productId: 'MID2',     brand: 'OtherMid',  review_count: 3000,   monthly_sold: 1500 }),
  ]

  it('headlines the disproportionate low-review seller with real numbers + niche medians', () => {
    const ep = detectEntryProof(NICHE, [])
    expect(ep).not.toBeNull()
    expect(ep!.productId).toBe('NEWCOMER')
    expect(ep!.brand).toBe('FreshCo')
    expect(ep!.monthly_sold).toBe(3000)
    expect(ep!.review_count).toBe(45)
    expect(ep!.recent).toBe(true)              // 8 months ≤ 24
    expect(ep!.niche_median_reviews).toBe(3500) // median of 20000/45/4000/3000
    expect(ep!.price_dump_suspected).toBeUndefined() // same price as niche
  })

  it('critique fix 1: a tiny-volume seller cannot headline on ratio alone', () => {
    // 60/mo with 5 reviews is maximally disproportionate but far below half
    // the niche median volume — the owner's criterion is a NICE volume.
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 20_000, monthly_sold: 5000 }),
      row({ productId: 'TINY',   brand: 'TinyCo',    review_count: 5,      monthly_sold: 60 }),
      row({ productId: 'MID1',   brand: 'MidBrand',  review_count: 4000,   monthly_sold: 2000 }),
    ]
    expect(detectEntryProof(rows, [])).toBeNull()
  })

  it('critique fix 2: an established brand\'s low-review line extension is skipped', () => {
    const bases: BrandReviewBase[] = [
      // FreshCo has ANOTHER product in the fetched data with a big review base
      { productId: 'OTHER-ASIN', brand: 'freshco', reviewCount: ENTRY_PROOF_ESTABLISHED_REVIEW_BASE },
    ]
    const ep = detectEntryProof(NICHE, bases)
    expect(ep).toBeNull()   // no other row qualifies in this fixture
  })

  it('critique fix 2 (negative): the candidate\'s own listing never marks its brand established', () => {
    const bases: BrandReviewBase[] = [
      { productId: 'NEWCOMER', brand: 'FreshCo', reviewCount: 45 },
    ]
    expect(detectEntryProof(NICHE, bases)?.productId).toBe('NEWCOMER')
  })

  it('critique fix 3: deep-discount volume is disclosed, not hidden', () => {
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 20_000, monthly_sold: 5000, price: 30 }),
      row({ productId: 'DUMPER', brand: 'CheapCo',   review_count: 45,     monthly_sold: 3000, price: 9 }),
      row({ productId: 'MID1',   brand: 'MidBrand',  review_count: 4000,   monthly_sold: 2000, price: 28 }),
    ]
    const ep = detectEntryProof(rows, [])
    expect(ep?.productId).toBe('DUMPER')
    expect(ep?.price_dump_suspected).toBe(true)
    expect(ep?.niche_median_price).toBe(28)
  })

  it('rows with null review_count are ineligible but never crash detection', () => {
    const rows = [
      row({ productId: 'A', brand: 'A', review_count: null, monthly_sold: 5000 }),
      row({ productId: 'B', brand: 'B', review_count: null, monthly_sold: 3000 }),
    ]
    expect(detectEntryProof(rows, [])).toBeNull()   // <2 eligible rows
  })

  it('a real 0-review seller can headline (floored share, raw 0 preserved)', () => {
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 9000, monthly_sold: 4000 }),
      row({ productId: 'ZERO',   brand: 'BrandNew',  review_count: 0,    monthly_sold: 3000 }),
      row({ productId: 'MID1',   brand: 'MidBrand',  review_count: 5000, monthly_sold: 2500 }),
    ]
    const ep = detectEntryProof(rows, [])
    expect(ep?.productId).toBe('ZERO')
    expect(ep?.review_count).toBe(0)
  })

  it('returns null when nobody beats the niche pattern (no forced example)', () => {
    const rows = [
      row({ productId: 'A', brand: 'A', review_count: 5000, monthly_sold: 3000 }),
      row({ productId: 'B', brand: 'B', review_count: 4800, monthly_sold: 2900 }),
      row({ productId: 'C', brand: 'C', review_count: 5100, monthly_sold: 3100 }),
    ]
    expect(detectEntryProof(rows, [])).toBeNull()
  })
})

describe('buildCompetitorRevenueTable — entry-proof fields pass through', () => {
  it('carries review_count and listing_age_months onto every row', () => {
    const table = buildCompetitorRevenueTable([
      input({ productId: 'A1', brand: 'A', reviewCount: 45, listingAgeMonths: 8 }),
      input({ productId: 'B1', brand: 'B', reviewCount: null, listingAgeMonths: null }),
    ])
    expect(table).not.toBeNull()
    const byId = Object.fromEntries(table!.rows.map(r => [r.productId, r]))
    expect(byId['A1'].review_count).toBe(45)
    expect(byId['A1'].listing_age_months).toBe(8)
    expect(byId['B1'].review_count).toBeNull()
    expect(byId['B1'].listing_age_months).toBeNull()
  })
})

// ── Entry Proof ladder (owner design 2026-08-03) ────────────────────────────
describe('detectEntryProof ladder — members list + tier semantics', () => {
  it('returns ALL qualifying members ranked strongest-first, flat fields = strongest', () => {
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 20_000, monthly_sold: 8000 }),
      row({ productId: 'M1',     brand: 'FreshOne',  review_count: 45,     monthly_sold: 4000 }),
      row({ productId: 'M2',     brand: 'FreshTwo',  review_count: 90,     monthly_sold: 3000 }),
      row({ productId: 'M3',     brand: 'FreshThree', review_count: 150,   monthly_sold: 2500 }),
      row({ productId: 'MID',    brand: 'MidBrand',  review_count: 5000,   monthly_sold: 3000 }),
      row({ productId: 'MID2',   brand: 'OtherMid',  review_count: 3000,   monthly_sold: 2600 }),
    ]
    const ep = detectEntryProof(rows, [])!
    expect(ep).not.toBeNull()
    expect(ep.members!.map(m => m.productId)).toEqual(['M1', 'M2', 'M3'])
    expect(ep.productId).toBe('M1')   // flat fields mirror members[0]
    expect(ep.monthly_sold).toBe(4000)
  })

  it('critique fix: the relative-tautology mature-niche case produces NO members', () => {
    // All "below median" sellers here have 3-4k reviews selling roughly in
    // proportion — below-median alone would call them low-review entrants;
    // the disproportion requirement correctly rejects the whole set.
    const rows = [
      row({ productId: 'A', brand: 'A', review_count: 6000, monthly_sold: 3200 }),
      row({ productId: 'B', brand: 'B', review_count: 5500, monthly_sold: 3000 }),
      row({ productId: 'C', brand: 'C', review_count: 4000, monthly_sold: 2200 }),
      row({ productId: 'D', brand: 'D', review_count: 3800, monthly_sold: 2100 }),
    ]
    expect(detectEntryProof(rows, [])).toBeNull()
  })

  it('member volume bar is ¼ median: a ⅓-median seller is a member, a tiny one is not', () => {
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 20_000, monthly_sold: 6000 }),
      row({ productId: 'THIRD',  brand: 'ThirdCo',   review_count: 60,     monthly_sold: 2000 }),  // ≥ ¼ of median
      row({ productId: 'TINY',   brand: 'TinyCo',    review_count: 5,      monthly_sold: 200 }),   // < ¼ of median
      row({ productId: 'MID',    brand: 'MidBrand',  review_count: 4000,   monthly_sold: 3000 }),
    ]
    const ep = detectEntryProof(rows, [])!
    expect(ep.members!.map(m => m.productId)).toEqual(['THIRD'])
  })

  it('a price-dumping member stays a member, flagged (disclosed, not excluded)', () => {
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 20_000, monthly_sold: 6000, price: 30 }),
      row({ productId: 'FAIR',   brand: 'FairCo',    review_count: 50,     monthly_sold: 3000, price: 29 }),
      row({ productId: 'DUMP',   brand: 'DumpCo',    review_count: 40,     monthly_sold: 2500, price: 9 }),
      row({ productId: 'MID',    brand: 'MidBrand',  review_count: 4000,   monthly_sold: 3000, price: 28 }),
    ]
    const ep = detectEntryProof(rows, [])!
    const ids = ep.members!.map(m => m.productId)
    expect(ids).toContain('FAIR')
    expect(ids).toContain('DUMP')
    expect(ep.members!.find(m => m.productId === 'DUMP')!.price_dump_suspected).toBe(true)
    expect(ep.members!.find(m => m.productId === 'FAIR')!.price_dump_suspected).toBeUndefined()
  })
})
