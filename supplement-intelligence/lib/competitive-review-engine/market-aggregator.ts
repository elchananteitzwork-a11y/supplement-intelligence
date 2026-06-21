import type { ReviewReport, RankedInsight } from '@/lib/review-engine'
import type { MarketGap, WinnerFeature, GapCategory, ProductAnalysisResult } from './types'

// ── Intermediate aggregation output ───────────────────────────────────────

export interface MarketAggregatedData {
  universal_gaps:  MarketGap[]       // ≥ 70% of products
  common_gaps:     MarketGap[]       // 40–69%
  niche_gaps:      MarketGap[]       // < 40%
  all_gaps:        MarketGap[]       // all tiers, prevalence-desc
  winner_features: WinnerFeature[]   // from top-rated products
}

// ── Category mapping ───────────────────────────────────────────────────────
// Maps ReviewReport insight keys to the market gap category taxonomy.

type InsightKey = keyof Pick<
  ReviewReport,
  | 'pain_points'
  | 'missing_features'
  | 'requested_improvements'
  | 'quality_issues'
  | 'packaging_issues'
  | 'shipping_issues'
  | 'price_complaints'
>

const INSIGHT_CATEGORY_MAP: Array<[InsightKey, GapCategory]> = [
  ['pain_points',            'pain_point'],
  ['missing_features',       'missing_feature'],
  ['requested_improvements', 'improvement_opportunity'],
  ['quality_issues',         'quality_issue'],
  ['packaging_issues',       'packaging_issue'],
  ['shipping_issues',        'shipping_issue'],
  ['price_complaints',       'price_complaint'],
]

// ── Entry type (internal) ──────────────────────────────────────────────────

interface InsightEntry {
  representative: string         // longest / most descriptive phrasing seen
  category:       GapCategory
  asins:          Set<string>    // which products mention this insight
  max_severity:   'High' | 'Medium' | 'Low'
}

const SEVERITY_RANK: Record<'High' | 'Medium' | 'Low', number> = {
  High: 2, Medium: 1, Low: 0,
}

// ── Public entry point ─────────────────────────────────────────────────────

export function aggregateAcrossProducts(
  results: ProductAnalysisResult[],
): MarketAggregatedData {
  const successful = results.filter(r => r.report !== null)
  const total      = successful.length
  if (!total) {
    return { universal_gaps: [], common_gaps: [], niche_gaps: [], all_gaps: [], winner_features: [] }
  }

  // ── Build cross-ASIN insight index ──────────────────────────────────────
  const index: Map<string, InsightEntry> = new Map()

  for (const { asin, report } of successful) {
    if (!report) continue
    for (const [field, category] of INSIGHT_CATEGORY_MAP) {
      const insights: RankedInsight[] = (report[field] as RankedInsight[]) ?? []
      for (const insight of insights) {
        if (!insight.insight?.trim()) continue
        const key   = normalise(insight.insight)
        const entry = index.get(key)
        if (entry) {
          entry.asins.add(asin)
          // Keep the most descriptive phrasing (longest wins)
          if (insight.insight.length > entry.representative.length) {
            entry.representative = insight.insight
          }
          // Escalate severity if a higher one is seen
          if (SEVERITY_RANK[insight.severity] > SEVERITY_RANK[entry.max_severity]) {
            entry.max_severity = insight.severity
          }
        } else {
          index.set(key, {
            representative: insight.insight,
            category,
            asins:          new Set([asin]),
            max_severity:   insight.severity,
          })
        }
      }
    }
  }

  // ── Convert to MarketGap objects ─────────────────────────────────────────
  const all_gaps: MarketGap[] = Array.from(index.values())
    .map(entry => ({
      description:   entry.representative,
      category:      entry.category,
      prevalence:    round2(entry.asins.size / total),
      product_count: entry.asins.size,
      asin_examples: Array.from(entry.asins).slice(0, 3),
      severity:      entry.max_severity,
    }))
    .filter(g => g.product_count >= 1)
    .sort((a, b) =>
      b.prevalence - a.prevalence ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    )

  // ── Tier the gaps ────────────────────────────────────────────────────────
  const universal_gaps = all_gaps.filter(g => g.prevalence >= 0.70)
  const common_gaps    = all_gaps.filter(g => g.prevalence >= 0.40 && g.prevalence < 0.70)
  const niche_gaps     = all_gaps.filter(g => g.prevalence < 0.40)

  // ── Winner features (positive themes from high-rated products) ───────────
  const winner_features = extractWinnerFeatures(successful, total)

  console.log('[MarketAggregator] aggregation complete', {
    products_with_data: total,
    total_unique_gaps:  all_gaps.length,
    universal:          universal_gaps.length,
    common:             common_gaps.length,
    niche:              niche_gaps.length,
    winner_features:    winner_features.length,
  })

  return { universal_gaps, common_gaps, niche_gaps, all_gaps, winner_features }
}

// ── Winner feature extraction ──────────────────────────────────────────────
//
// "Winner features" = positive themes that appear in the highest-rated products.
// These signal what the market already rewards — useful for positioning the
// winning product to inherit these while fixing the universal gaps.

function extractWinnerFeatures(
  results: ProductAnalysisResult[],
  total:   number,
): WinnerFeature[] {
  // Pick the top third by avg_rating, or products rated ≥ 4.3 (whichever is broader)
  const sorted   = [...results].sort((a, b) => b.insight.avg_rating - a.insight.avg_rating)
  const topCutoff = Math.max(Math.ceil(total * 0.35), 2)
  const topProducts = sorted
    .slice(0, topCutoff)
    .filter(r => r.insight.avg_rating >= 4.2)

  if (!topProducts.length) return []

  const featureIndex: Map<string, { representative: string; asins: Set<string>; ratingSum: number }> = new Map()

  for (const { asin, report, insight } of topProducts) {
    if (!report) continue
    for (const theme of report.positive_themes ?? []) {
      if (!theme.insight?.trim()) continue
      const key   = normalise(theme.insight)
      const entry = featureIndex.get(key)
      if (entry) {
        entry.asins.add(asin)
        entry.ratingSum += insight.avg_rating
        if (theme.insight.length > entry.representative.length) {
          entry.representative = theme.insight
        }
      } else {
        featureIndex.set(key, {
          representative: theme.insight,
          asins:          new Set([asin]),
          ratingSum:      insight.avg_rating,
        })
      }
    }
  }

  return Array.from(featureIndex.values())
    .filter(e => e.asins.size >= 2)   // must appear in ≥ 2 high-rated products
    .map(e => ({
      feature:       e.representative,
      product_count: e.asins.size,
      avg_rating:    round2(e.ratingSum / e.asins.size),
    }))
    .sort((a, b) => b.product_count - a.product_count || b.avg_rating - a.avg_rating)
    .slice(0, 10)
}

// ── Utilities ──────────────────────────────────────────────────────────────

// Stable grouping key: strips punctuation, lowercases, caps at 100 chars.
// Identical to the normalization in review-engine/aggregator.ts so the
// semantics are consistent across both layers.
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
