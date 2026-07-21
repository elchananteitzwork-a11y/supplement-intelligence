// Formatting + table-building helpers for the compare/recommend prompt.
//
// Split out of route.ts (2026-07-18 audit) because Next.js route.ts files
// may only export the recognized route-handler symbols (GET/POST/etc. plus
// a small allowlist of route config consts like `maxDuration`) — exporting
// plain helper functions directly from route.ts fails Next's generated
// route-type check (`tsc --noEmit` error: "Property 'fmtN' is incompatible
// with index signature... Type '...' is not assignable to type 'never'").
// Colocating them here keeps them unit-testable without violating that
// constraint.
//
// Rewired (2026-07-2x) onto AnalysisComparisonItem — rows for fields with no
// equivalent in the real `analyses` pipeline (fee_data_source/breakeven_cogs/
// year1_base/margin_viable/capital_fit/timeline_fit/founder fit) are gone;
// see app/api/research/compare/route.ts's own header comment for why.
import type { AnalysisComparisonItem } from '../route'

export function fmtN(n: number | null, prefix = '', suffix = ''): string {
  if (n === null || n === undefined) return 'N/A'
  return `${prefix}${n.toLocaleString()}${suffix}`
}

// Fix (2026-07-18 audit, Finding 9): recommend/route.ts's fmtK was missing
// the >= 1_000_000 branch that app/research/compare/page.tsx's fmtK already
// has, so e.g. a $2.4M figure rendered as "$2400.0k" here. Matches
// page.tsx's correct logic exactly.
export function fmtK(n: number | null): string {
  if (n === null || n === undefined) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

// Fix (2026-07-18 audit, Finding 1 — Critical): review_concentration (and
// confidencePct) are real ratios/percents (confirmed by
// lib/stage25/launch-threshold.ts's `Math.round(concentration * 100)` and by
// app/research/compare/metrics.ts's own, correct formatter for the same
// field). review_concentration is still a real 0-1 ratio on
// AnalysisComparisonItem and must be scaled the same way.
export function fmtRatioPct(n: number | null): string {
  if (n === null || n === undefined) return 'N/A'
  return `${Math.round(n * 100)}%`
}

// Fix (2026-07-18 audit, Finding 4): signal age was fetched by route.ts but
// never surfaced to the model, so cross-analysis comparisons couldn't be
// caveated for wildly different data ages.
export function fmtDataAge(isoDate: string): string {
  const then = new Date(isoDate).getTime()
  if (isNaN(then)) return 'N/A'
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
  return `${days}d`
}

export function buildComparisonTable(items: AnalysisComparisonItem[]): string {
  const cols = items.map(i => `"${i.category_name.slice(0, 40)}"`).join(' | ')
  const rows: string[] = [
    `Metric                    | ${cols}`,
    `---                       | ${items.map(() => '---').join(' | ')}`,
    `Opportunity Score (0-100) | ${items.map(i => i.score).join(' | ')}`,
    `Market Verdict            | ${items.map(i => i.verdict ?? 'N/A').join(' | ')}`,
    `Quality Tier              | ${items.map(i => i.qualityTier ?? 'N/A').join(' | ')}`,
    // Fix (2026-07-18 audit, Finding 5): confidence was computed but
    // discarded before the AI ever saw it.
    `Data Confidence           | ${items.map(i => i.confidencePct === null ? 'N/A' : `${i.confidencePct}%`).join(' | ')}`,
    `Data Age                  | ${items.map(i => fmtDataAge(i.created_at)).join(' | ')}`,
    `Market Revenue/mo         | ${items.map(i => fmtK(i.market_revenue_mo)).join(' | ')}`,
    `Median Price              | ${items.map(i => fmtN(i.median_price, '$')).join(' | ')}`,
    `Competitors               | ${items.map(i => fmtN(i.competitor_count)).join(' | ')}`,
    `Review Concentration      | ${items.map(i => fmtRatioPct(i.review_concentration)).join(' | ')}`,
    `90-day Momentum           | ${items.map(i => fmtN(i.momentum_90d_pct, '', '%')).join(' | ')}`,
    `Trend Direction           | ${items.map(i => i.trend_direction ?? 'N/A').join(' | ')}`,
    `TikTok Views              | ${items.map(i => fmtN(i.tiktok_view_count)).join(' | ')}`,
    `Kill Criteria Clear       | ${items.map(i => i.kill_criteria_clear === null ? 'N/A' : i.kill_criteria_clear ? 'Yes' : `No (${i.triggered_kill_criteria.join(', ')})`).join(' | ')}`,
  ]
  return rows.join('\n')
}
