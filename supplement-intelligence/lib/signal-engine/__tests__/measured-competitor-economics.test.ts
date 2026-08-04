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
    ratingCurrent: null, ratingAvg365: null, priceAvg365: null, buyBoxIsAmazon: null,
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
    rating_current: null, rating_avg365: null, price_avg365: null,
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
      row({ productId: 'DUMPER', brand: 'CheapCo',   review_count: 45,     monthly_sold: 3000, price: 9, listing_age_months: 6 }),
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
      row({ productId: 'ZERO',   brand: 'BrandNew',  review_count: 0,    monthly_sold: 3000, listing_age_months: 2 }),
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
      row({ productId: 'M1',     brand: 'FreshOne',  review_count: 45,     monthly_sold: 4000, listing_age_months: 4 }),
      row({ productId: 'M2',     brand: 'FreshTwo',  review_count: 90,     monthly_sold: 3000, listing_age_months: 9 }),
      row({ productId: 'M3',     brand: 'FreshThree', review_count: 150,   monthly_sold: 2500, listing_age_months: 20 }),
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
      row({ productId: 'THIRD',  brand: 'ThirdCo',   review_count: 60,     monthly_sold: 2000, listing_age_months: 7 }),  // ≥ ¼ of median
      row({ productId: 'TINY',   brand: 'TinyCo',    review_count: 5,      monthly_sold: 200 }),   // < ¼ of median
      row({ productId: 'MID',    brand: 'MidBrand',  review_count: 4000,   monthly_sold: 3000 }),
    ]
    const ep = detectEntryProof(rows, [])!
    expect(ep.members!.map(m => m.productId)).toEqual(['THIRD'])
  })

  it('a price-dumping member stays a member, flagged (disclosed, not excluded)', () => {
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 20_000, monthly_sold: 6000, price: 30 }),
      row({ productId: 'FAIR',   brand: 'FairCo',    review_count: 50,     monthly_sold: 3000, price: 29, listing_age_months: 10 }),
      row({ productId: 'DUMP',   brand: 'DumpCo',    review_count: 40,     monthly_sold: 2500, price: 9, listing_age_months: 12 }),
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

// ── Entry Proof v2 bar (deep-research round, 2026-08-03) ────────────────────
describe('detectEntryProof v2 bar — absolute anchor + required recency', () => {
  it('the real Nature\'s Bounty case: below-median but >300 reviews is NOT a member', () => {
    // Sampled live 2026-08-03: magnesium glycinate, median 6,957 reviews —
    // Nature's Bounty at 5,787 reviews/80k sold qualified under the v1 bar.
    const rows = [
      row({ productId: 'MEGA1', brand: 'HugeCo A', review_count: 76_126, monthly_sold: 30_000 }),
      row({ productId: 'NB',    brand: 'Big Household Name', review_count: 5_787, monthly_sold: 80_000, listing_age_months: 17 }),
      row({ productId: 'MEGA2', brand: 'HugeCo B', review_count: 40_000, monthly_sold: 20_000 }),
      row({ productId: 'MEGA3', brand: 'HugeCo C', review_count: 9_000,  monthly_sold: 15_000 }),
    ]
    expect(detectEntryProof(rows, [])).toBeNull()
  })

  it('a null listing age is never a member (conservative on missing data)', () => {
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 20_000, monthly_sold: 5000 }),
      row({ productId: 'NOAGE',  brand: 'FreshCo',   review_count: 45,     monthly_sold: 3000, listing_age_months: null }),
      row({ productId: 'MID',    brand: 'MidBrand',  review_count: 4000,   monthly_sold: 2000 }),
    ]
    expect(detectEntryProof(rows, [])).toBeNull()
  })

  it('an old low-review listing is not a member (recency required, not corroboration)', () => {
    const rows = [
      row({ productId: 'LEADER', brand: 'BigLeader', review_count: 20_000, monthly_sold: 5000 }),
      row({ productId: 'OLD',    brand: 'OldCo',     review_count: 45,     monthly_sold: 3000, listing_age_months: 35 }),
      row({ productId: 'MID',    brand: 'MidBrand',  review_count: 4000,   monthly_sold: 2000 }),
    ]
    expect(detectEntryProof(rows, [])).toBeNull()
  })

  it('stamps criteria_version 2 on the result', () => {
    const ep = detectEntryProof([
      row({ productId: 'LEADER',   brand: 'BigLeader', review_count: 20_000, monthly_sold: 5000 }),
      row({ productId: 'NEWCOMER', brand: 'FreshCo',   review_count: 45,     monthly_sold: 3000, listing_age_months: 8 }),
      row({ productId: 'MID',      brand: 'MidBrand',  review_count: 4000,   monthly_sold: 2000 }),
    ], [])!
    expect(ep.criteria_version).toBe(2)
  })
})

// ── Entry Outcomes — docs/RD_ENTRY_OUTCOMES.md ──────────────────────────────
import { computeEntryOutcomes } from '../measured-competitor-economics'

describe('computeEntryOutcomes (visible-young-cohort fate)', () => {
  // input() default: reviewCount null, listingAgeMonths null — override per fixture.
  const inp = (id: string, brand: string, age: number | null, sold: number | null, reviews: number | null) =>
    input({ productId: id, brand, listingAgeMonths: age, monthlySold: sold, reviewCount: reviews })

  it('welcoming: most small-scale judgeable young listings broke out (real creatine-gummies shape)', () => {
    const eo = computeEntryOutcomes([
      inp('A', 'FreshA', 8, 6000, 200), inp('B', 'FreshB', 15, 5000, 400),
      inp('C', 'FreshC', 10, 5000, 660), inp('D', 'FreshD', 7, 2000, 130),
      inp('E', 'FreshE', 16, 2000, 199), inp('OLD', 'OldCo', 60, 9000, 5000),
    ], [])!
    expect(eo.state).toBe('welcoming')
    expect(eo.judgeable_count).toBe(5)
    expect(eo.broke_out).toHaveLength(5)
    expect(eo.stalled).toHaveLength(0)
  })

  it('contested: stalled share ≥ 0.34 (real berberine shape, dual-anchored bar)', () => {
    // median sold of deduped measured set drives the relative anchor.
    const eo = computeEntryOutcomes([
      inp('A', 'B1', 11, 3000, 700), inp('B', 'B2', 9, 1000, 366),
      inp('C', 'B3', 14, 800, 235), inp('D', 'B4', 16, 600, 258),
      inp('E', 'B5', 19, 200, 102), inp('F', 'B6', 12, 100, 235),
      inp('G', 'B7', 20, 100, 339), inp('H', 'B8', 12, 50, 67),
    ], [])!
    expect(eo.state).toBe('contested')
    // median sold = (200+600)/2=400 → bar = min(200, 100) = 100
    expect(eo.stall_threshold_sold).toBe(100)
    expect(eo.stalled.map(s => s.productId).sort()).toEqual(['F', 'G', 'H'])
  })

  it('critique fix: dual anchor protects low-volume niches from absolute-bar mislabeling', () => {
    // Median 400 → bar 100: a 200/mo seller is NOT stalled here even though
    // 200 ≤ the absolute anchor.
    const eo = computeEntryOutcomes([
      inp('A', 'B1', 10, 400, 100), inp('B', 'B2', 12, 400, 90),
      inp('C', 'B3', 9, 200, 80), inp('D', 'B4', 14, 300, 70),
    ], [])!
    expect(eo.stall_threshold_sold).toBeLessThan(200)
    expect(eo.stalled).toHaveLength(0)
    expect(eo.state).toBe('welcoming')
  })

  it('no_small_entrants_visible: young cohort exists but every member has a 1,000+ review base — with NO brand-identity claim encoded', () => {
    const eo = computeEntryOutcomes([
      inp('A', 'BigA', 17, 80000, 5788), inp('B', 'BigB', 15, 80000, 2976),
      inp('C', 'BigC', 14, 10000, 1799),
    ], [])!
    expect(eo.state).toBe('no_small_entrants_visible')
    expect(eo.small_scale_count).toBe(0)
    expect(eo.young_total).toBe(3)
  })

  it('critique fix: a successful small-scale entrant with a big OWN review base still counts as large_base (we cannot distinguish it from a giant — observation only)', () => {
    // Inner Brightness case: 11mo, 1,838 reviews. It is counted large_base
    // (review-scale observation), NOT misdescribed as a brand-identity fact.
    const eo = computeEntryOutcomes([
      inp('IB', 'Inner Brightness', 11, 7000, 1838),
      inp('A', 'FreshA', 8, 900, 120), inp('B', 'FreshB', 9, 800, 90),
      inp('C', 'FreshC', 12, 700, 60), inp('D', 'FreshD', 10, 600, 50),
    ], [])!
    expect(eo.large_base_count).toBe(1)
    expect(eo.judgeable_count).toBe(4)
  })

  it('large_base via same-brand base elsewhere in fetched data (entry-proof machinery reused)', () => {
    const eo = computeEntryOutcomes([
      inp('NEW', 'MegaBrand', 7, 900, 150),
      inp('A', 'FreshA', 8, 900, 120), inp('B', 'FreshB', 9, 800, 90),
      inp('C', 'FreshC', 12, 700, 60), inp('D', 'FreshD', 10, 600, 50),
    ], [{ productId: 'OTHER', brand: 'megabrand', reviewCount: 50_000 }])!
    expect(eo.large_base_count).toBe(1)
    expect(eo.judgeable_count).toBe(4)
  })

  it('insufficient: judgeable cohort below the minimum renders no claim state', () => {
    const eo = computeEntryOutcomes([
      inp('A', 'FreshA', 3, 300, 28), inp('B', 'FreshB', 2, 100, 15),
    ], [])!
    expect(eo.state).toBe('insufficient')
  })

  it('null listing age is excluded from the young cohort (conservative on missing data); no young cohort at all → null', () => {
    expect(computeEntryOutcomes([
      inp('A', 'A', null, 5000, 100), inp('B', 'B', 60, 3000, 4000),
    ], [])).toBeNull()
  })

  it('badge-absent young listings count as stalled (below ~50/mo by the badge), never as broke-out', () => {
    const eo = computeEntryOutcomes([
      inp('A', 'B1', 10, 3000, 700), inp('B', 'B2', 12, 2000, 366),
      inp('C', 'NoBadge1', 9, null, 12), inp('D', 'NoBadge2', 14, null, 8),
    ], [])!
    expect(eo.stalled.map(s => s.productId).sort()).toEqual(['C', 'D'])
    expect(eo.state).toBe('contested')   // 2 of 4 stalled = 50% ≥ 34%
  })

  it('internal consistency: broke_out + stalled always equals judgeable_count', () => {
    const eo = computeEntryOutcomes([
      inp('A', 'B1', 11, 3000, 700), inp('B', 'B2', 9, 1000, 366),
      inp('C', 'B3', 14, 100, 235), inp('D', 'B4', 16, 600, 258),
      inp('E', 'B5', 4, 900, 40),   // young but too new to judge
    ], [])!
    expect(eo.broke_out.length + eo.stalled.length).toBe(eo.judgeable_count)
    expect(eo.judgeable_count).toBe(4)
  })

  it('coexists with detectEntryProof on the same niche (a winner AND stalls is real information)', () => {
    const inputs = [
      inp('LEADER', 'BigLeader', 60, 8000, 20000),
      inp('MID', 'MidBrand', 60, 3000, 5000),
      inp('STAR', 'FreshStar', 8, 4000, 90),
      inp('S1', 'Stall1', 10, 100, 300), inp('S2', 'Stall2', 12, 100, 250),
      inp('S3', 'Stall3', 14, 100, 220),
    ]
    const table = buildCompetitorRevenueTable(inputs)!
    const ep = detectEntryProof(table.rows, [])
    const eo = computeEntryOutcomes(inputs, [])!
    expect(ep?.brand).toBe('FreshStar')
    expect(eo.state).toBe('contested')   // 3 of 4 judgeable small-scale young are stalled
  })
})

// ── Wounded Leader + Amazon Presence — docs/RD_WOUNDED_LEADER_AMAZON_PRESENCE.md
import { detectWoundedLeader, detectAmazonPresence } from '../measured-competitor-economics'
import { matchAmazonBrand } from '../amazon-brands'

describe('detectWoundedLeader (single-leader, display-only)', () => {
  it('rating slide: leader current ≥0.2 below its own yearly average', () => {
    const wl = detectWoundedLeader([
      row({ productId: 'L', brand: 'Leader', rating_current: 4.2, rating_avg365: 4.5 }),
      row({ productId: 'P1', brand: 'P1', rating_current: 4.5 }),
    ])!
    expect(wl.brand).toBe('Leader')
    expect(wl.wounds).toEqual([{ type: 'rating_slide', now: 4.2, baseline: 4.5 }])
  })

  it('rating gap fires only with ≥4 rated peers (critique fix: unstable small medians)', () => {
    const peers3 = [
      row({ productId: 'P1', brand: 'P1', rating_current: 4.5 }),
      row({ productId: 'P2', brand: 'P2', rating_current: 4.5 }),
      row({ productId: 'P3', brand: 'P3', rating_current: 4.4 }),
    ]
    const leader = row({ productId: 'L', brand: 'Leader', rating_current: 4.0, rating_avg365: 4.0 })
    expect(detectWoundedLeader([leader, ...peers3])).toBeNull()   // 3 peers — not enough
    const wl = detectWoundedLeader([leader, ...peers3, row({ productId: 'P4', brand: 'P4', rating_current: 4.4 })])!
    expect(wl.wounds).toEqual([{ type: 'rating_gap', now: 4.0, baseline: 4.5 }])
  })

  it('price climb uses the leader row\'s own same-slot yearly average', () => {
    const wl = detectWoundedLeader([
      row({ productId: 'L', brand: 'Leader', price: 33, price_avg365: 29 }),
      row({ productId: 'P1', brand: 'P1' }),
    ])!
    expect(wl.wounds).toEqual([{ type: 'price_climb', now: 33, baseline: 29 }])
  })

  it('healthy leader (probe shape: +0.1 drift, stable price) → null; missing historicals → null', () => {
    expect(detectWoundedLeader([
      row({ productId: 'L', brand: 'Leader', rating_current: 4.7, rating_avg365: 4.6, price: 25, price_avg365: 25 }),
      row({ productId: 'P1', brand: 'P1', rating_current: 4.6 }),
    ])).toBeNull()
    expect(detectWoundedLeader([row({ productId: 'L', brand: 'Leader' }), row({ productId: 'P', brand: 'P' })])).toBeNull()
    expect(detectWoundedLeader([])).toBeNull()
  })

  it('multiple wounds stack on one leader', () => {
    const wl = detectWoundedLeader([
      row({ productId: 'L', brand: 'Leader', rating_current: 4.1, rating_avg365: 4.4, price: 34, price_avg365: 28 }),
      row({ productId: 'P1', brand: 'P1', rating_current: 4.5 }),
      row({ productId: 'P2', brand: 'P2', rating_current: 4.5 }),
      row({ productId: 'P3', brand: 'P3', rating_current: 4.6 }),
      row({ productId: 'P4', brand: 'P4', rating_current: 4.4 }),
    ])!
    expect(wl.wounds.map(w => w.type).sort()).toEqual(['price_climb', 'rating_gap', 'rating_slide'])
  })
})

describe('detectAmazonPresence (facts, never a verdict)', () => {
  it('detects house brands via the curated list incl. aliases, sorted by volume', () => {
    const ap = detectAmazonPresence([
      input({ productId: 'A', brand: 'Amazon Basics', monthlySold: 9000 }),
      input({ productId: 'B', brand: 'Revly', monthlySold: 200 }),   // alias of Amazon Elements
      input({ productId: 'C', brand: 'FreshCo', monthlySold: 5000 }),
    ], matchAmazonBrand)!
    expect(ap.house_brands.map(h => h.brand)).toEqual(['Amazon Basics', 'Revly'])
  })

  it('live-validation fix: 1P buybox is NOT reported (biased denominator without buybox=1)', () => {
    const ap = detectAmazonPresence([
      input({ productId: 'A', brand: 'Amazon Basics', monthlySold: 900, buyBoxIsAmazon: true }),
    ], matchAmazonBrand)!
    expect(ap).toEqual({ house_brands: [{ productId: 'A', brand: 'Amazon Basics', monthly_sold: 900 }] })
  })

  it('returns null when no house brand is present — even with 1P buybox flags set', () => {
    expect(detectAmazonPresence([
      input({ productId: 'A', brand: 'FreshCo', buyBoxIsAmazon: true }),
      input({ productId: 'B', brand: 'OtherCo', buyBoxIsAmazon: true }),
    ], matchAmazonBrand)).toBeNull()
  })
})
