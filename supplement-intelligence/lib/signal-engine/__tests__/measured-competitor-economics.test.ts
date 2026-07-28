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
