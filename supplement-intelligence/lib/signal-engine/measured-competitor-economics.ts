// ── Measured competitor economics — item ב (docs/RD_V4_NICHE_COMPETITOR_ECONOMICS.md)
//
// Pure helpers, no I/O: turn the query-specific /search products the Keepa
// provider ALREADY fetches (and previously discarded the monthlySold of)
// into a per-competitor revenue table plus honest aggregates. The three
// integrity guards here are exactly the three traps the 2026-07-27 live
// probe exposed:
//   1. filterToDominantCategory — Amazon search mixes product classes
//      (real case: Midol/Pamprin OTC caplets passing word-overlap relevance
//      for "Period Bloating Relief"); a founder can't legally compete with
//      an OTC monograph drug, so minority-category results are excluded and
//      COUNTED, never silently dropped.
//   2. dedupeByBrand — the same brand's size variants (real case: The
//      Missing Link 1lb + 5lb bags) must not count as two competitors.
//   3. Callers must present every figure as a floor: monthlySold is
//      Amazon's rounded-DOWN "bought in past month" band (20000, 3000,
//      300…), so price × monthlySold is a lower bound, not an exact read.
//      This module only does the arithmetic; the ~/floor presentation rule
//      lives with the UI (see EvidenceAppendix).

export interface MeasuredCompetitorInput {
  productId:        string
  brand:            string          // '' when the listing has no brand field
  price:            number | null   // dollars, extracted by the provider (fba → buybox → amazon avg90)
  monthlySold:      number | null   // Amazon's rounded-down band; null when the badge is absent
  categoryLevel1Id: number | null   // categoryTree[1].catId; null when the tree is missing/shallow
}

export interface CompetitorRevenueRow {
  productId:              string
  brand:                  string
  price:                  number
  monthly_sold:           number
  est_monthly_revenue_mo: number    // price × monthly_sold — a floor (see header)
}

export interface CompetitorRevenueTable {
  rows:                        CompetitorRevenueRow[]   // sorted by revenue desc
  measured_revenue_total_mo:   number
  revenue_concentration_top1:  number                   // 0–1, leader ÷ total
  off_category_excluded_count: number
}

// Guard 1. Majority vote on the second-level category id among products
// that HAVE one; products from minority categories are excluded (returned
// as a count for disclosure). Products with a null id are KEPT — a missing
// category tree is absence of data, not evidence the product is
// off-category; the real contamination case (OTC drugs) carries a real,
// different tree. Ties keep every tied category (conservative: when the
// data can't pick a winner, nothing is excluded on a coin flip).
export function filterToDominantCategory<T extends { categoryLevel1Id: number | null }>(
  products: T[],
): { kept: T[]; excludedCount: number } {
  const counts = new Map<number, number>()
  for (const p of products) {
    if (p.categoryLevel1Id !== null) counts.set(p.categoryLevel1Id, (counts.get(p.categoryLevel1Id) ?? 0) + 1)
  }
  if (counts.size <= 1) return { kept: products, excludedCount: 0 }

  const maxCount = Math.max(...Array.from(counts.values()))
  const dominant = new Set(Array.from(counts.entries()).filter(([, c]) => c === maxCount).map(([id]) => id))
  const kept = products.filter(p => p.categoryLevel1Id === null || dominant.has(p.categoryLevel1Id))
  return { kept, excludedCount: products.length - kept.length }
}

// Guard 2. One entry per brand, keeping the highest-monthlySold listing
// (the size variant actually selling most). Brandless listings are keyed
// by their own productId so they never collapse into each other.
export function dedupeByBrand<T extends { productId: string; brand: string; monthlySold: number | null }>(
  products: T[],
): T[] {
  const byKey = new Map<string, T>()
  for (const p of products) {
    const key = p.brand.trim().toLowerCase() || `__no_brand__${p.productId}`
    const existing = byKey.get(key)
    if (!existing || (p.monthlySold ?? -1) > (existing.monthlySold ?? -1)) byKey.set(key, p)
  }
  return Array.from(byKey.values())
}

// Composition: guard 1 → guard 2 → rows from products measured on BOTH
// axes (real price AND real monthlySold) → aggregates. Returns null below
// 2 measured rows: a one-product "table" is exactly the n=1 misleading
// average the round-1 critique caught — absence over fabrication.
export function buildCompetitorRevenueTable(products: MeasuredCompetitorInput[]): CompetitorRevenueTable | null {
  const { kept, excludedCount } = filterToDominantCategory(products)
  const deduped = dedupeByBrand(kept)

  const rows: CompetitorRevenueRow[] = deduped
    .filter((p): p is MeasuredCompetitorInput & { price: number; monthlySold: number } =>
      p.price !== null && p.price > 0 && p.monthlySold !== null && p.monthlySold > 0)
    .map(p => ({
      productId:              p.productId,
      brand:                  p.brand || '(no brand listed)',
      price:                  p.price,
      monthly_sold:           p.monthlySold,
      est_monthly_revenue_mo: Math.round(p.price * p.monthlySold),
    }))
    .sort((a, b) => b.est_monthly_revenue_mo - a.est_monthly_revenue_mo)

  if (rows.length < 2) return null

  const total = rows.reduce((sum, r) => sum + r.est_monthly_revenue_mo, 0)
  return {
    rows,
    measured_revenue_total_mo:   total,
    revenue_concentration_top1:  Math.round((rows[0].est_monthly_revenue_mo / total) * 100) / 100,
    off_category_excluded_count: excludedCount,
  }
}
